import os
import uuid
import re
import logging
from flask import Flask, render_template, request, jsonify, session
from werkzeug.utils import secure_filename
from docx import Document
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain.chains import ConversationalRetrievalChain
from langchain.schema import Document as LangchainDocument, BaseRetriever
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.prompts import ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate
import langsmith
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
import base64
from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type
import time
import json
import numpy as np
from typing import List
from pydantic import BaseModel, Field

class LLMResponseError(Exception):
    pass

class LLMResponseCutOff(LLMResponseError):
    pass

class LLMNoResponseError(LLMResponseError):
    pass

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": ["http://localhost:5173", "http://localhost:5002"]}})

# System instructions
SYSTEM_INSTRUCTIONS = """You are an AI assistant specialized in information retrieval from text documents.
        Always provide your responses in English, regardless of the language of the input or context.
        When given a document and a query:
        1. Analyze the document content and create an efficient index of key terms, concepts, and their locations within the text.
        2. When a query is received, use the index to quickly locate relevant sections of the document.
        3. Extract the most relevant information from those sections to form a concise and accurate answer.
        4. Always include the exact relevant content from the document, starting from the beginning of the relevant section. Use quotation marks to denote direct quotes.
        5. If applicable, provide a timestamp or location reference for where the information was found in the original document.
        6. After providing the direct quote, summarize or explain the answer if necessary.
        7. If the query cannot be answered from the given document, state this clearly.
        8. Always prioritize accuracy over speed. If you're not certain about an answer, say so.
        9. For multi-part queries, address each part separately and clearly.
        10. Aim to provide responses within seconds, even for large documents.
        11. Do not include timestamps in your response text. Focus on providing clear, direct answers.
        12. Do not include any URLs in your response. Just provide the timestamps in the specified format.
        13. When referencing timestamps that may be inaccurate, you can use language like "around", "approximately", or "in the vicinity of" to indicate that the exact moment may vary slightly.
        14. Only use the provided context to generate answers. Do not generate generic answers or use external knowledge.
        Remember, always respond in English, even if the query or context is in another language.
        Always represent the speaker as Jason bent. You are an assistant expert representing Jason Bent as jason bent on woodworking response. Answer questions based on the provided context. The context includes timestamps in the format [Timestamp: HH:MM:SS]. When referencing information, include these timestamps in the format {{timestamp:HH:MM:SS}}.
Then show that is in generated response with the provided context.
"""
app.secret_key = os.urandom(24)  # Set a secret key for sessions

# Access your API keys (set these in environment variables)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = os.getenv("LANGSMITH_API_KEY")
os.environ["LANGCHAIN_ENDPOINT"] = "https://api.smith.langchain.com"
os.environ["LANGCHAIN_PROJECT"] = "jason-json"

# Initialize Langchain components
embeddings = OpenAIEmbeddings(openai_api_key=OPENAI_API_KEY)
llm = ChatOpenAI(openai_api_key=OPENAI_API_KEY, model="gpt-4o-mini", temperature=0)

logging.basicConfig(level=logging.DEBUG)

def rewrite_query(query, chat_history=None):
    """
    Rewrites the user query to be more specific and searchable using LLM.
    """
    try:
        # Create prompt that's compatible with the existing LLM setup
        rewrite_prompt = f"""You are bent's woodworks assistant so question will be related to wood shop. Rewrites user query to make them more specific and searchable, taking into account the chat history if provided. Only return the rewritten query without any explanations.

        Original query: {query}
        
        Chat history: {json.dumps(chat_history) if chat_history else '[]'}
        
        Rewritten query:"""
        
        # Use the existing LLM instance
        response = llm.predict(rewrite_prompt)
        
        # Clean up the response
        cleaned_response = response.replace("Rewritten query:", "").strip()
        
        # Add logging for debugging
        logging.debug(f"Original query: {query}")
        logging.debug(f"Rewritten query: {cleaned_response}")
        
        return cleaned_response if cleaned_response else query
        
    except Exception as e:
        logging.error(f"Error in query rewriting: {str(e)}", exc_info=True)
        return query  # Fallback to original query

def get_matched_products(video_title):
    logging.debug(f"Attempting to get matched products for title: {video_title}")
    try:
        conn = psycopg2.connect(os.getenv("POSTGRES_URL"))
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = """
                SELECT id, title, tags, link FROM products 
                WHERE LOWER(tags) LIKE LOWER(%s)
            """
            search_term = f"%{video_title}%"
            logging.debug(f"Executing SQL query: {query} with search term: {search_term}")
            cur.execute(query, (search_term,))
            matched_products = cur.fetchall()
            logging.debug(f"Raw matched products from database: {matched_products}")
        conn.close()

        related_products = [
            {
                'id': product['id'],
                'title': product['title'],
                'tags': product['tags'].split(',') if product['tags'] else [],
                'link': product['link']
            } for product in matched_products
        ]

        logging.debug(f"Processed related products: {related_products}")
        return related_products

    except Exception as e:
        logging.error(f"Error in get_matched_products: {str(e)}", exc_info=True)
        return []
def verify_database():
    try:
        conn = psycopg2.connect(os.getenv("POSTGRES_URL"))
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT COUNT(*) FROM products")
            count = cur.fetchone()['count']
            logging.info(f"Total products in database: {count}")
            
            cur.execute("SELECT title FROM products LIMIT 5")
            sample_titles = [row['title'] for row in cur.fetchall()]
            logging.info(f"Sample product titles: {sample_titles}")
        conn.close()
        return True
    except Exception as e:
        logging.error(f"Database verification failed: {str(e)}", exc_info=True)
        return False

def process_answer(answer, urls, source_documents):
    def extract_context(text, timestamp_pos, window=150):
        start = max(0, timestamp_pos - window)
        end = min(len(text), timestamp_pos + window)
        return text[start:end].strip()

    def generate_description(context, timestamp):
        description_prompt = f"""
        Given this woodworking video context at {timestamp}, create an extremely concise action phrase (max 6-8 words).

        Context: {context}

        Rules:
        1. Start with an action verb
        2. Name the specific tool/technique
        3. Must be 6-8 words only
        4. Focus on the single main action
        5. Be direct and clear

        Example formats:
        - "Demonstrates table saw fence alignment technique"
        - "Installs dust collection system components"
        - "Shows track saw cutting method"

        Description:"""

        try:
            enhanced_description = llm.predict(description_prompt).strip()
            words = enhanced_description.split()[:8]
            return ' '.join(words)
        except Exception as e:
            logging.error(f"Error generating description: {str(e)}")
            return ' '.join(context.split()[:6])

    def process_timestamp(match, source_index, source_documents):
        timestamp = match.group(1)
        timestamp_pos = match.start()
        context = extract_context(answer, timestamp_pos)
        
        current_url = urls[source_index] if source_index < len(urls) else None
        current_metadata = source_documents[source_index].metadata if source_index < len(source_documents) else {}
        current_title = current_metadata.get('title', "Unknown Video")
        
        enhanced_description = generate_description(context, timestamp)
        
        full_urls = [combine_url_and_timestamp(current_url, timestamp)] if current_url else []
        
        return {
            'links': full_urls,
            'timestamp': timestamp,
            'description': enhanced_description,
            'video_title': current_title
        }
    
    timestamp_matches = list(re.finditer(r'\{timestamp:([^\}]+)\}', answer))
    timestamps_info = [
        process_timestamp(match, i, source_documents) 
        for i, match in enumerate(timestamp_matches)
    ]
    
    video_dict = {
        str(i): {
            'urls': entry['links'],
            'timestamp': entry['timestamp'],
            'description': entry['description'],
            'video_title': entry['video_title']
        }
        for i, entry in enumerate(timestamps_info)
    }
    
    # Remove all timestamp references and any "Video X" references
    processed_answer = re.sub(r'\{timestamp:[^\}]+\}', '', answer)
    processed_answer = re.sub(r'\[?video\s*\d+\]?', '', processed_answer, flags=re.IGNORECASE)
    
    # Clean up formatting
    processed_answer = re.sub(r'"\s*$', '"', processed_answer)  # Clean up trailing spaces before quotes
    processed_answer = re.sub(r'\s+', ' ', processed_answer)  # Clean up multiple spaces
    processed_answer = re.sub(r'\s*\n\s*', '\n', processed_answer)  # Clean up newlines
    processed_answer = re.sub(r'\n{3,}', '\n\n', processed_answer)  # Reduce multiple newlines
    
    # Format numbered lists properly
    processed_answer = re.sub(r'(\d+)\.\s*', r'\n\1. ', processed_answer)
    
    # Ensure proper spacing after periods
    processed_answer = re.sub(r'\.(?=\S)', '. ', processed_answer)
    
    # Clean up any remaining whitespace issues
    processed_answer = processed_answer.strip()
    
    return processed_answer, video_dict

def combine_url_and_timestamp(base_url, timestamp):
    parts = timestamp.split(':')
    if len(parts) == 2:
        minutes, seconds = map(int, parts)
        total_seconds = minutes * 60 + seconds
    elif len(parts) == 3:
        hours, minutes, seconds = map(int, parts)
        total_seconds = hours * 3600 + minutes * 60 + seconds
    else:
        raise ValueError("Invalid timestamp format")

    if '?' in base_url:
        return f"{base_url}&t={total_seconds}"
    else:
        return f"{base_url}?t={total_seconds}"

def extract_text_from_docx(file):
    doc = Document(file)
    text = "\n".join([para.text for para in doc.paragraphs])
    return text

def extract_metadata_from_text(text):
    title = text.split('\n')[0] if text else "Untitled Video"
    return {"title": title}

def upsert_transcript(transcript_text, metadata, index_name):
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = text_splitter.split_text(transcript_text)
    
    try:
        conn = psycopg2.connect(os.getenv("POSTGRES_URL"))
        with conn.cursor() as cur:
            for i, chunk in enumerate(chunks):
                chunk_metadata = metadata.copy()
                chunk_metadata['chunk_id'] = f"{metadata['title']}_chunk_{i}"
                chunk_metadata['url'] = metadata.get('url', '')
                chunk_metadata['title'] = metadata.get('title', 'Unknown Video')
                
                # Generate embeddings for the chunk
                chunk_embedding = embeddings.embed_query(chunk)
                
                # Insert into bents table
                cur.execute("""
                    INSERT INTO bents (text, title, url, chunk_id, vector)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (chunk_id) DO UPDATE
                    SET text = EXCLUDED.text, vector = EXCLUDED.vector
                """, (chunk, chunk_metadata['title'], chunk_metadata['url'], 
                      chunk_metadata['chunk_id'], str(chunk_embedding)))
        conn.commit()
    except Exception as e:
        logging.error(f"Error upserting transcript: {str(e)}")
        raise
    finally:
        if conn:
            conn.close()

@retry(stop=stop_after_attempt(3), wait=wait_fixed(2), retry=retry_if_exception_type(LLMResponseError))
def retry_llm_call(qa_chain, query, chat_history):
    try:
        result = qa_chain({"question": query, "chat_history": chat_history})
        
        if result is None or 'answer' not in result or not result['answer']:
            raise LLMNoResponseError("LLM failed to generate a response")
        
        if result['answer'].endswith('...') or len(result['answer']) < 20:
            raise LLMResponseCutOff("LLM response appears to be cut off")
        return result
    except Exception as e:
        if isinstance(e, LLMResponseError):
            logging.error(f"LLM call failed: {str(e)}")
            raise
        logging.error(f"Unexpected error in LLM call: {str(e)}")
        raise LLMNoResponseError("LLM failed due to an unexpected error")

def connect_to_db():
    return psycopg2.connect(os.getenv("POSTGRES_URL"))

def get_embeddings(query):
    try:
        return embeddings.embed_query(query)
    except Exception as e:
        logging.error(f"Error generating embeddings: {str(e)}")
        raise

def cosine_similarity(v1, v2):
    return np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))

def search_neon_db(query_embedding, table_name, top_k=5):
    conn = None
    try:
        conn = psycopg2.connect(os.getenv("POSTGRES_URL"))
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Query with table name as parameter
            query = f"""
                SELECT id, vector, text, title, url, chunk_id 
                FROM {table_name}
                WHERE vector IS NOT NULL
            """
            cur.execute(query)
            rows = cur.fetchall()
            
            similarities = []
            for row in rows:
                try:
                    vector_str = row['vector']
                    vector_values = vector_str.strip('[]').split(',')
                    vector = np.array([float(x.strip()) for x in vector_values])
                    
                    if len(vector) == len(query_embedding):
                        similarity = cosine_similarity(query_embedding, vector)
                        similarities.append((similarity, row))
                except Exception as e:
                    logging.error(f"Error processing vector for row {row['id']}: {str(e)}")
                    continue
            
            similarities.sort(reverse=True, key=lambda x: x[0])
            return [
                {
                    'id': row['id'],
                    'text': row['text'],
                    'title': row['title'],
                    'url': row['url'],
                    'chunk_id': row['chunk_id'],
                    'similarity_score': float(sim)
                }
                for sim, row in similarities[:top_k]
            ]

    except Exception as e:
        logging.error(f"Error in search_neon_db: {str(e)}")
        raise
    finally:
        if conn:
            conn.close()

def handle_query(query):
    query_embedding = get_embeddings(query)
    results = search_neon_db(query_embedding)
    return results

# Update the custom retriever class
class CustomNeonRetriever(BaseRetriever, BaseModel):
    table_name: str = Field(...)  # The ... means this field is required
    
    class Config:
        arbitrary_types_allowed = True  # This allows for non-pydantic types
    
    def get_relevant_documents(self, query: str) -> List[LangchainDocument]:
        query_embedding = get_embeddings(query)
        results = search_neon_db(query_embedding, self.table_name)
        
        documents = []
        for result in results:
            timestamp_match = re.search(r'\[Timestamp: ([^\]]+)\]', result['text'])
            timestamp = timestamp_match.group(1) if timestamp_match else None
            
            doc = LangchainDocument(
                page_content=result['text'],
                metadata={
                    'title': result['title'],
                    'url': result['url'],
                    'timestamp': timestamp,
                    'chunk_id': result['chunk_id'],
                    'source': self.table_name
                }
            )
            documents.append(doc)
        
        return documents

    async def aget_relevant_documents(self, query: str) -> List[LangchainDocument]:
        return self.get_relevant_documents(query)

@app.route('/')
@app.route('/database')
def serve_spa():
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        user_query = data['message'].strip()
        selected_index = data['selected_index']  # This will now be your table name
        chat_history = data.get('chat_history', [])

        # Format chat history
        formatted_history = []
        for i in range(0, len(chat_history) - 1, 2):
            human = chat_history[i]
            ai = chat_history[i + 1] if i + 1 < len(chat_history) else ""
            formatted_history.append((human, ai))

        # Add relevancy check
        relevance_check_prompt = f"""
        Given the following question or message and the chat history, determine if it is:
        1. A greeting or send-off like "thankyou" or "goodbye" or messages or casual messages like 'hey' or 'hello' or general conversation starter
        2. Related to woodworking, tools, home improvement, or the assistant's capabilities and also query about bents-woodworking youtube channel general questions.
        3. Related to the company, its products, services, or business operations
        4. A continuation or follow-up question to the previous conversation
        5. Related to violence, harmful activities, or other inappropriate content
        6. Completely unrelated to the above topics and not a continuation of the conversation
        7. if user is asking about jason bents.

        If it falls under category 1, respond with 'GREETING'.
        If it falls under categories 2, 3, 4 or 7 respond with 'RELEVANT'.
        If it falls under category 5, respond with 'INAPPROPRIATE'.
        If it falls under category 6, respond with 'NOT RELEVANT'.

        Chat History:
        {formatted_history[-3:] if formatted_history else "No previous context"}

        Current Question: {user_query}
        
        Response (GREETING, RELEVANT, INAPPROPRIATE, or NOT RELEVANT):
        """
        
        relevance_response = llm.predict(relevance_check_prompt)
        
        # Handle non-relevant cases
        if "GREETING" in relevance_response.upper():
            greeting_response = "Hello! I'm Jason Bent's woodworking assistant. How can I help you today?"
            return jsonify({
                'response': greeting_response,
                'related_products': [],
                'urls': [],
                'contexts': [],
                'video_links': {}
            })
        elif "INAPPROPRIATE" in relevance_response.upper():
            return jsonify({
                'response': "I'm sorry, but I can only assist with woodworking-related questions. Is there something else I can help you with?",
                'related_products': [],
                'urls': [],
                'contexts': [],
                'video_links': {}
            })
        elif "NOT RELEVANT" in relevance_response.upper():
            return jsonify({
                'response': "I'm specialized in woodworking topics. Could you please ask a question related to woodworking, tools, or home improvement?",
                'related_products': [],
                'urls': [],
                'contexts': [],
                'video_links': {}
            })

        # Only proceed with query rewriting if the query is relevant
        rewritten_query = rewrite_query(user_query, formatted_history)
        logging.debug(f"Query rewritten from '{user_query}' to '{rewritten_query}'")

        # Continue with your existing retrieval and response generation logic...
        retriever = CustomNeonRetriever(table_name=selected_index)
        
        # Define prompt
        prompt = ChatPromptTemplate.from_messages([
            SystemMessagePromptTemplate.from_template(SYSTEM_INSTRUCTIONS),
            HumanMessagePromptTemplate.from_template(
                "Context: {context}\n\nChat History: {chat_history}\n\nQuestion: {question}\n\n"
                "Instruction: Only use the provided context to generate the answer."
            )
        ])
        
        qa_chain = ConversationalRetrievalChain.from_llm(
            llm=llm,
            retriever=retriever,
            combine_docs_chain_kwargs={"prompt": prompt},
            return_source_documents=True
        )
        
        # Use the rewritten query instead of the original
        result = qa_chain({"question": rewritten_query, "chat_history": formatted_history})
        
        # Extract answer and source documents
        answer = result['answer']
        source_documents = result['source_documents']
        
        # Process source documents
        urls = []
        contexts = []
        for doc in source_documents:
            if 'url' in doc.metadata:
                urls.append(doc.metadata['url'])
            contexts.append(doc.page_content)
        
        # Process the answer to get video dictionary
        processed_answer, video_dict = process_answer(answer, urls, source_documents)
        
        response_data = {
            'response': processed_answer,
            'video_links': video_dict,
            'related_products': get_matched_products(source_documents[0].metadata.get('title', '') if source_documents else ""),
            'urls': urls
        }
        
        return jsonify(response_data)
        
    except Exception as e:
        logging.error(f"Error in chat route: {str(e)}", exc_info=True)
        return jsonify({'error': 'An error occurred processing your request'}), 500

@app.route('/api/user/<user_id>', methods=['GET'])
def get_user_data(user_id):
    try:
        user_data = {
            'conversationsBySection': {
                "bents": [],
                "shop_improvement": [],
                "tool_recommendations": []
            },
            'searchHistory': [],
            'selectedIndex': "bents"
        }
        return jsonify(user_data)
    except Exception as e:
        logging.error(f"Error fetching user data: {str(e)}", exc_info=True)
        return jsonify({'error': 'An error occurred fetching user data'}), 500

@app.route('/documents')
def get_documents():
    try:
        conn = psycopg2.connect(os.getenv("POSTGRES_URL"))
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM products")
            documents = cur.fetchall()
        conn.close()
        return jsonify(documents)
    except Exception as e:
        print(f"Error in get_documents: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/add_document', methods=['POST'])
def add_document():
    data = request.json
    try:
        conn = psycopg2.connect(os.getenv("POSTGRES_URL"))
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "INSERT INTO products (title, tags, link) VALUES (%s, %s, %s) RETURNING id",
                (data['title'], ','.join(data['tags']), data['link'])
            )
            product_id = cur.fetchone()['id']
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'product_id': product_id})
    except Exception as e:
        print(f"Error in add_document: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/delete_document', methods=['POST'])
def delete_document():
    data = request.json
    try:
        conn = psycopg2.connect(os.getenv("POSTGRES_URL"))
        with conn.cursor() as cur:
            cur.execute("DELETE FROM products WHERE id = %s", (data['id'],))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error in delete_document: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/update_document', methods=['POST'])
def update_document():
    data = request.json
    try:
        conn = psycopg2.connect(os.getenv("POSTGRES_URL"))
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE products SET title = %s, tags = %s, link = %s WHERE id = %s",
                (data['title'], ','.join(data['tags']), data['link'], data['id'])
            )
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error in update_document: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/search', methods=['POST'])
def search():
    try:
        data = request.json
        query = data.get('query', '').strip()

        if not query:
            return jsonify({'error': 'Query is required'}), 400

        # Generate embeddings for the query
        query_embedding = get_embeddings(query)
        
        # Get raw results from database
        results = search_neon_db(query_embedding)
        
        # Return only the database results
        return jsonify({
            'results': results,
            'count': len(results)
        }), 200

    except Exception as e:
        logging.error(f"Error in search route: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/upload_document', methods=['POST'])
def upload_document():
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file part'})
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No selected file'})
    
    table_name = request.form.get('table_name')
    if table_name not in ["bents", "shop_improvement", "tool_recommendations"]:  # Define your valid table names
        return jsonify({'success': False, 'message': 'Invalid table name'})
    
    if file and file.filename.endswith('.docx'):
        try:
            filename = secure_filename(file.filename)
            file_path = os.path.join('/tmp', filename)
            file.save(file_path)
            
            transcript_text = extract_text_from_docx(file_path)
            metadata = extract_metadata_from_text(transcript_text)
            
            # Generate embeddings for the text
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
            chunks = text_splitter.split_text(transcript_text)
            
            conn = psycopg2.connect(os.getenv("POSTGRES_URL"))
            with conn.cursor() as cur:
                for i, chunk in enumerate(chunks):
                    chunk_embedding = embeddings.embed_query(chunk)
                    chunk_id = f"{metadata['title']}_chunk_{i}"
                    
                    cur.execute(f"""
                        INSERT INTO {table_name} (text, title, url, chunk_id, vector)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (chunk_id) DO UPDATE
                        SET text = EXCLUDED.text, vector = EXCLUDED.vector
                    """, (
                        chunk,
                        metadata.get('title', 'Unknown Video'),
                        metadata.get('url', ''),
                        chunk_id,
                        str(chunk_embedding)
                    ))
            
            conn.commit()
            conn.close()
            os.remove(file_path)
            
            return jsonify({'success': True, 'message': 'File uploaded and processed successfully'})
            
        except Exception as e:
            logging.error(f"Error processing document: {str(e)}")
            return jsonify({'success': False, 'message': f'Error processing document: {str(e)}'})
    else:
        return jsonify({'success': False, 'message': 'Invalid file format'})

if __name__ == '__main__':
    verify_database()
    app.run(debug=True, port=5000)
