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
CORS(app, resources={r"/*": {"origins": ["http://localhost:5173", "http://localhost:5002","https://bents-frontend-server.vercel.app","https://bents-backend-server.vercel.app"]}})
# System instructions
SYSTEM_INSTRUCTIONS = """You are an AI assistant representing Jason Bent's woodworking expertise. Your role is to:
1. Analyze woodworking documents and provide clear, natural responses that sound like Jason Bent is explaining the concepts.
2. Convert technical content into conversational, easy-to-understand explanations.
3. Focus on explaining the core concepts and techniques rather than quoting directly from transcripts.
4. Always maintain a friendly, professional tone as if Jason Bent is speaking directly to the user.
5. Include relevant timestamps in the format {{timestamp:MM:SS}} after each key point or technique mentioned. For videos longer than an hour, use {{timestamp:HH:MM:SS}} format.
   - Timestamps must be accurate and within the video duration 
   - Never use timestamps greater than the video duration
   - Always verify timestamps are in proper format (e.g., 05:30 not 5:30)
   - Place timestamps immediately after mentioning a specific technique or point
6. Organize multi-part responses clearly with natural transitions.
7. Keep responses concise and focused on the specific question asked.
8. If information isn't available in the provided context, clearly state that.
9. Always respond in English, regardless of the input language.
10. Avoid using phrases like "in the video" or "the transcript shows" - instead, speak directly about the techniques and concepts.
11. Don't include URLs or raw timestamps in the explanation text.
12. Present information in a teaching style, focusing on the "how" and "why" of woodworking techniques.
Remember:
- You are speaking as Jason Bent's AI assistant and so if you are mentioning jason bent, you should use the word "Jason Bent" instead of "I" like "Jason Bent will suggest that you..."
- Focus on analyzing the transcripts and explaining the concepts naturally rather than quoting transcripts
- Must provide a timestamp or location reference for where the information was found in the original document.
- Keep responses clear, practical, and focused on woodworking expertise
- If users ask about video details provide the video timestamp in the format {{timestamp:MM:SS}} or {{timestamp:HH:MM:SS}} for longer videos
- Timestamps must be properly formatted with leading zeros (e.g., 05:30 not 5:30)
- Never provide timestamps that exceed the video duration
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
llm = ChatOpenAI(openai_api_key=OPENAI_API_KEY, model="gpt-4o-2024-11-20", temperature=0)

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

def validate_timestamp(timestamp, max_duration=900):  # 900 seconds = 15 minutes
    """Validates and normalizes timestamps"""
    try:
        parts = timestamp.split(':')
        if len(parts) == 2:  # MM:SS format
            minutes, seconds = map(int, parts)
            total_seconds = minutes * 60 + seconds
        elif len(parts) == 3:  # HH:MM:SS format
            hours, minutes, seconds = map(int, parts)
            total_seconds = hours * 3600 + minutes * 60 + seconds
        else:
            return None

        # Validate the timestamp is within reasonable bounds
        if total_seconds < 0 or total_seconds > max_duration:
            return None
            
        # Return normalized HH:MM:SS format
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        
        if hours > 0:
            return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        return f"{minutes:02d}:{seconds:02d}"
    except:
        return None

def extract_context(text, position, window=100):
    """Extract context around a specific position in text"""
    start = max(0, position - window)
    end = min(len(text), position + window)
    return text[start:end].strip()

def generate_description(context, timestamp):
    """Generate a description based on the context and timestamp"""
    # Remove existing timestamps and clean up the text
    cleaned_context = re.sub(r'\{timestamp:[^\}]+\}', '', context)
    cleaned_context = re.sub(r'\s+', ' ', cleaned_context).strip()
    
    # Limit description length
    max_length = 150
    if len(cleaned_context) > max_length:
        cleaned_context = cleaned_context[:max_length] + '...'
    
    return cleaned_context

def process_timestamp(match, source_index, source_documents):
    timestamp = match.group(1)
    timestamp_pos = match.start()
    
    # Get the full text from the source document
    source_text = source_documents[source_index].page_content if source_index < len(source_documents) else ""
    context = extract_context(source_text, timestamp_pos)
    
    current_metadata = source_documents[source_index].metadata if source_index < len(source_documents) else {}
    current_url = current_metadata.get('url', None)
    current_title = current_metadata.get('title', "Unknown Video")
    
    # Validate timestamp
    validated_timestamp = validate_timestamp(timestamp)
    if not validated_timestamp:
        logging.warning(f"Invalid timestamp detected: {timestamp}")
        return None
        
    enhanced_description = generate_description(context, validated_timestamp)
    
    full_urls = [combine_url_and_timestamp(current_url, validated_timestamp)] if current_url else []
    
    return {
        'links': full_urls,
        'timestamp': validated_timestamp,
        'description': enhanced_description,
        'video_title': current_title
    }

def combine_url_and_timestamp(base_url, timestamp):
    if not base_url:
        return None
        
    try:
        parts = timestamp.split(':')
        total_seconds = 0
        
        if len(parts) == 2:  # MM:SS
            minutes, seconds = map(int, parts)
            total_seconds = minutes * 60 + seconds
        elif len(parts) == 3:  # HH:MM:SS
            hours, minutes, seconds = map(int, parts)
            total_seconds = hours * 3600 + minutes * 60 + seconds
            
        # Ensure the timestamp is valid
        if total_seconds < 0:
            logging.error(f"Invalid negative timestamp: {timestamp}")
            return base_url
            
        # Add timestamp parameter to URL
        separator = '&' if '?' in base_url else '?'
        return f"{base_url}{separator}t={total_seconds}"
        
    except Exception as e:
        logging.error(f"Error processing timestamp {timestamp}: {str(e)}")
        return base_url

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

def search_neon_db(query_embedding, table_name="bents", top_k=5):
    conn = None
    try:
        conn = psycopg2.connect(os.getenv("POSTGRES_URL"))
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Modified query to better handle text content with timestamps
            query = f"""
                WITH content_analysis AS (
                    SELECT 
                        id,
                        chunk_id,
                        title,
                        url,
                        text,
                        vector,
                        -- Extract timestamps with surrounding context
                        REGEXP_MATCHES(
                            text, 
                            '([^.]*?\d{1,2}:\d{2}(?::\d{2})?[^.]*\.)',
                            'g'
                        ) as timestamp_contexts
                    FROM {table_name}
                    WHERE vector IS NOT NULL
                ),
                ranked_results AS (
                    SELECT 
                        id,
                        chunk_id,
                        title,
                        url,
                        text,
                        timestamp_contexts,
                        1 - (vector <=> %s::vector) as similarity
                    FROM content_analysis
                    WHERE similarity > 0.5
                )
                SELECT * FROM ranked_results
                ORDER BY similarity DESC
                LIMIT %s
            """
            
            cur.execute(query, (str(query_embedding), top_k))
            results = cur.fetchall()
            
            processed_results = []
            for result in results:
                # Extract timestamps with their surrounding context
                timestamp_data = extract_timestamps_with_context(result['text'])
                
                processed_results.append({
                    'id': result['id'],
                    'chunk_id': result['chunk_id'],
                    'title': result['title'],
                    'url': result['url'],
                    'timestamps': timestamp_data,
                    'similarity_score': float(result['similarity'])
                })
            
            return processed_results

    except Exception as e:
        logging.error(f"Error in search_neon_db: {str(e)}")
        raise
    finally:
        if conn:
            conn.close()

def extract_timestamps_with_context(text):
    """
    Extract timestamps along with their surrounding context and description
    Returns a list of dictionaries containing timestamp, context, and description
    """
    timestamp_data = []
    
    # Find all timestamp patterns in the text
    timestamp_pattern = r'(\d{1,2}:\d{2}(?::\d{2})?)'
    
    # Split text into sentences
    sentences = text.split('.')
    
    for i, sentence in enumerate(sentences):
        timestamp_matches = re.finditer(timestamp_pattern, sentence)
        
        for match in timestamp_matches:
            timestamp = match.group(1)
            
            # Get surrounding context (current sentence + previous/next if available)
            context_start = max(0, i - 1)
            context_end = min(len(sentences), i + 2)
            context = '. '.join(sentences[context_start:context_end]).strip()
            
            # Try to find description in nearby text
            description = extract_description_for_timestamp(context, timestamp)
            
            timestamp_data.append({
                'timestamp': timestamp,
                'context': context,
                'description': description
            })
    
    return timestamp_data

def extract_description_for_timestamp(context, timestamp):
    """
    Extract a relevant description for the timestamp from the context
    """
    # Find the sentence containing the timestamp
    sentences = context.split('.')
    timestamp_sentence = next((s for s in sentences if timestamp in s), '')
    
    # Look for descriptive text after the timestamp
    if timestamp_sentence:
        parts = timestamp_sentence.split(timestamp)
        if len(parts) > 1:
            # Take text after the timestamp
            description = parts[1].strip()
            # Clean up any remaining timestamps
            description = re.sub(r'\d{1,2}:\d{2}(?::\d{2})?', '', description)
            return description.strip()
    
    return ''

def combine_url_and_timestamp(url, timestamp_data):
    """
    Create a timestamped YouTube URL with context
    """
    base_url = url
    if not timestamp_data.get('timestamp'):
        return {'url': base_url, 'context': '', 'description': ''}
    
    try:
        timestamp = timestamp_data['timestamp']
        parts = timestamp.split(':')
        total_seconds = 0
        
        if len(parts) == 2:  # MM:SS
            minutes, seconds = map(int, parts)
            total_seconds = minutes * 60 + seconds
        elif len(parts) == 3:  # HH:MM:SS
            hours, minutes, seconds = map(int, parts)
            total_seconds = hours * 3600 + minutes * 60 + seconds
        
        # Create timestamped URL
        separator = '&' if '?' in base_url else '?'
        timestamped_url = f"{base_url}{separator}t={total_seconds}"
        
        return {
            'url': timestamped_url,
            'context': timestamp_data.get('context', ''),
            'description': timestamp_data.get('description', ''),
            'timestamp': timestamp
        }
        
    except Exception as e:
        logging.error(f"Error processing URL timestamp: {str(e)}")
        return {'url': base_url, 'context': '', 'description': ''}

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

def get_all_related_products(video_dict):
    """Get related products from all video titles in video_links"""
    all_products = []  # Use list instead of set
    seen_products = set()  # Use a set of IDs to track duplicates
    
    # Extract unique video titles from video_dict
    video_titles = {entry['video_title'] for entry in video_dict.values()}
    
    # Get products for each video title
    for title in video_titles:
        if title:
            products = get_matched_products(title)
            for product in products:
                # Use product ID as unique identifier
                if product['id'] not in seen_products:
                    seen_products.add(product['id'])
                    all_products.append(product)
    
    return all_products

def process_answer(answer_text, source_documents):
    """Process the LLM answer to extract timestamps and generate video links"""
    timestamp_matches = list(re.finditer(r'\{timestamp:([^\}]+)\}', answer_text))
    timestamps_info = []
    
    # Extract URLs from source documents
    urls = [doc.metadata.get('url', '') for doc in source_documents]
    
    for i, match in enumerate(timestamp_matches):
        info = process_timestamp(match, i, source_documents)
        if info:  # Only add valid timestamps
            timestamps_info.append(info)
    
    video_dict = {
        str(i): {
            'urls': entry['links'],
            'timestamp': entry['timestamp'],
            'description': entry['description'],
            'video_title': entry['video_title']
        }
        for i, entry in enumerate(timestamps_info)
    }
    
    # Clean up the answer text
    processed_answer = re.sub(r'\{timestamp:[^\}]+\}', '', answer_text)
    processed_answer = re.sub(r'\[?video\s*\d+\]?', '', processed_answer, flags=re.IGNORECASE)
    processed_answer = re.sub(r'"\s*$', '"', processed_answer)
    processed_answer = re.sub(r'\s+', ' ', processed_answer)
    processed_answer = re.sub(r'\s*\n\s*', '\n', processed_answer)
    processed_answer = re.sub(r'\n{3,}', '\n\n', processed_answer)
    processed_answer = processed_answer.strip()
    
    return processed_answer, video_dict

@app.route('/')
@app.route('/database')
def serve_spa():
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        user_query = data['message'].strip()
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
        
        # Handle non-relevant cases using LLM
        if "GREETING" in relevance_response.upper():
            greeting_prompt = f"""
            The following message is a greeting or casual message. Please provide a friendly and engaging response.

            Message: {user_query}

            Response:
            """
            greeting_response = llm.predict(greeting_prompt)
            return jsonify({
                'response': greeting_response,
                'related_products': [],
                'urls': [],
                'contexts': [],
                'video_links': {}
            })
        elif "INAPPROPRIATE" in relevance_response.upper():
            inappropriate_prompt = f"""
            The following message is inappropriate or related to harmful activities. Please provide a polite and firm response indicating the limitations of the assistant.

            Message: {user_query}

            Response:
            """
            inappropriate_response = llm.predict(inappropriate_prompt)
            return jsonify({
                'response': inappropriate_response,
                'related_products': [],
                'urls': [],
                'contexts': [],
                'video_links': {}
            })
        elif "NOT RELEVANT" in relevance_response.upper():
            not_relevant_prompt = f"""
            The following question is not directly related to woodworking or the assistant's expertise. However, please provide a message to the user for could you please rephrase your question.

            Question: {user_query}

            Response:
            """
            not_relevant_response = llm.predict(not_relevant_prompt)
            return jsonify({
                'response': not_relevant_response,
                'related_products': [],
                'urls': [],
                'contexts': [],
                'video_links': {}
            })

        # Only proceed with query rewriting if the query is relevant
        rewritten_query = rewrite_query(user_query, formatted_history)
        logging.debug(f"Query rewritten from '{user_query}' to '{rewritten_query}'")

        # Continue with your existing retrieval and response generation logic...
        retriever = CustomNeonRetriever(table_name="bents")
        
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
        raw_answer = result['answer']  # Store the raw answer before processing
        source_documents = result['source_documents']
        
        # Process the answer to get video dictionary
        processed_answer, video_dict = process_answer(raw_answer, source_documents)
        
        response_data = {
            'response': processed_answer,
            'raw_response': raw_answer,
            'video_links': video_dict,
            'related_products': get_all_related_products(video_dict),
            'urls': [doc.metadata.get('url', '') for doc in source_documents]
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
                "bents": []
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
    
    table_name = "bents"
    
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
