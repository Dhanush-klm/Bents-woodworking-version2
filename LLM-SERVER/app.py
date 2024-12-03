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
from langchain.schema import Document as LangchainDocument
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.prompts import ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
import json
from functools import partial
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from psycopg2.pool import SimpleConnectionPool

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": ["http://localhost:5173", "http://localhost:5002","https://bents-frontend-server.vercel.app","https://bents-backend-server.vercel.app"]}})

app.secret_key = os.urandom(24)

# Configure logging
logging.basicConfig(level=logging.DEBUG)

# Initialize OpenAI components
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
embeddings = OpenAIEmbeddings(openai_api_key=OPENAI_API_KEY)
llm = ChatOpenAI(openai_api_key=OPENAI_API_KEY, model="gpt-4o-mini", temperature=0)

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
    Remember, always respond in English, even if the query or context is in another language.
    Always represent the speaker as Jason bent. You are an assistant expert representing Jason Bent on woodworking response."""

# Initialize connection pool
db_pool = SimpleConnectionPool(
    minconn=1,
    maxconn=3,
    dsn=os.getenv("POSTGRES_URL")
)

def get_db_connection():
    return db_pool.getconn()

def return_db_connection(conn):
    db_pool.putconn(conn)

def check_query_relevance(user_query, chat_history):
    """Check if the query is relevant to woodworking or is a greeting/general conversation."""
    try:
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
        {chat_history[-3:] if chat_history else "No previous context"}

        Current Question: {user_query}
        
        Response (GREETING, RELEVANT, INAPPROPRIATE, or NOT RELEVANT):
        """
        
        relevance_response = llm.predict(relevance_check_prompt).strip().upper()
        
        if relevance_response == "GREETING":
            greeting_prompt = f"Generate a friendly greeting response for a woodworking assistant in response to: '{user_query}'"
            try:
                return "GREETING", llm.predict(greeting_prompt)
            except Exception as e:
                return "GREETING", "Hello! I'm Jason Bent's woodworking assistant. How can I help you today?"
                
        elif relevance_response == "INAPPROPRIATE":
            decline_prompt = f"Generate a polite response declining to answer the inappropriate query: '{user_query}' and redirect to woodworking topics"
            try:
                return "INAPPROPRIATE", llm.predict(decline_prompt)
            except Exception as e:
                return "INAPPROPRIATE", "I'm sorry, but I can only assist with appropriate woodworking and home improvement related topics."
                
        elif relevance_response == "NOT RELEVANT":
            redirect_prompt = f"Generate a polite response explaining why the query: '{user_query}' is not relevant to woodworking and redirect to appropriate topics"
            try:
                return "NOT RELEVANT", llm.predict(redirect_prompt)
            except Exception as e:
                return "NOT RELEVANT", "I'm specialized in topics related to woodworking, tools, and home improvement. Could you please ask a question related to these topics?"
                
        else:  # RELEVANT
            return "RELEVANT", None

    except Exception as e:
        logging.error(f"Error in relevance check: {str(e)}")
        return "ERROR", "I'm having trouble processing your request. Could you please try asking about woodworking or home improvement topics?"

def rewrite_query(query, chat_history=None):
    """Rewrite the query to be more specific and searchable."""
    try:
        rewrite_prompt = f"""As bent's woodworks assistant, rewrite this query to be more specific 
        and searchable for woodworking content. Add relevant terminology and context while maintaining 
        the original intent. Only return the rewritten query without any explanations.

        Original query: {query}
        
        Chat history: {json.dumps(chat_history) if chat_history else '[]'}
        
        Rewritten query:"""
        
        response = llm.predict(rewrite_prompt)
        cleaned_response = response.replace("Rewritten query:", "").strip()
        
        logging.debug(f"Original query: {query}")
        logging.debug(f"Rewritten query: {cleaned_response}")
        
        return cleaned_response if cleaned_response else query
        
    except Exception as e:
        logging.error(f"Error in query rewriting: {str(e)}", exc_info=True)
        return query

def get_relevant_content(query, cur):
    """Get relevant content from specific tables using vector similarity search"""
    try:
        query_embedding = embeddings.embed_query(query)
        
        # Modified query to search across multiple tables
        similarity_query = """
            (SELECT id, chunk_id, text, title, url, vector,
                   (vector <=> $1) as similarity_score
            FROM bents
            WHERE vector IS NOT NULL)
            UNION ALL
            (SELECT id, chunk_id, text, title, url, vector,
                   (vector <=> $1) as similarity_score
            FROM shop_improvement
            WHERE vector IS NOT NULL)
            UNION ALL
            (SELECT id, chunk_id, text, title, url, vector,
                   (vector <=> $1) as similarity_score
            FROM tool_recommendations
            WHERE vector IS NOT NULL)
            ORDER BY similarity_score
            LIMIT 5;
        """
        
        cur.execute(similarity_query, (query_embedding,))
        similar_chunks = cur.fetchall()
        
        documents = []
        for chunk in similar_chunks:
            doc = LangchainDocument(
                page_content=chunk['text'],
                metadata={
                    'chunk_id': chunk['chunk_id'],
                    'title': chunk['title'],
                    'url': chunk['url']
                }
            )
            documents.append(doc)
        
        return documents
    except Exception as e:
        logging.error(f"Error in get_relevant_content: {str(e)}")
        return []

def get_matched_products(video_title):
    """Get matched products from database based on video title."""
    try:
        conn = psycopg2.connect(os.getenv("POSTGRES_URL"))
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            query = """
                SELECT id, title, tags, link 
                FROM products 
                WHERE LOWER(tags) LIKE LOWER(%s)
            """
            cur.execute(query, (f"%{video_title}%",))
            matched_products = cur.fetchall()
        conn.close()

        return [{
            'id': product['id'],
            'title': product['title'],
            'tags': product['tags'].split(',') if product['tags'] else [],
            'link': product['link']
        } for product in matched_products]
    except Exception as e:
        logging.error(f"Error in get_matched_products: {str(e)}")
        return []

def process_answer(answer, urls, source_documents):
    """Process answer to include video links and timestamps."""
    def extract_context(text, timestamp_pos, window=150):
        start = max(0, timestamp_pos - window)
        end = min(len(text), timestamp_pos + window)
        return text[start:end].strip()

    def generate_description(context, timestamp):
        description_prompt = f"""
        Given this woodworking video context at {timestamp}, create an extremely concise action phrase (max 6-8 words).
        Context: {context}
        Description:"""

        try:
            enhanced_description = llm.predict(description_prompt).strip()
            words = enhanced_description.split()[:8]
            return ' '.join(words)
        except Exception as e:
            logging.error(f"Error generating description: {str(e)}")
            return ' '.join(context.split()[:6])

    timestamp_matches = list(re.finditer(r'\{timestamp:([^\}]+)\}', answer))
    timestamps_with_context = []
    
    for i, match in enumerate(timestamp_matches):
        timestamp = match.group(1)
        timestamp_pos = match.start()
        context = extract_context(answer, timestamp_pos)
        
        current_url = urls[i] if i < len(urls) else None
        current_metadata = source_documents[i].metadata if i < len(source_documents) else {}
        current_title = current_metadata.get('title', "Unknown Video")
        
        enhanced_description = generate_description(context, timestamp)
        
        timestamps_with_context.append({
            'links': [f"{current_url}?t={timestamp}"] if current_url else [],
            'timestamp': timestamp,
            'description': enhanced_description,
            'video_title': current_title
        })
    
    video_dict = {
        f'[video{i}]': entry
        for i, entry in enumerate(timestamps_with_context)
    }
    
    processed_answer = answer
    for i, match in enumerate(timestamp_matches):
        processed_answer = processed_answer.replace(match.group(0), f'[video{i}]')
    
    return processed_answer, video_dict

def verify_database():
    """Verify database connection and content."""
    try:
        conn = psycopg2.connect(os.getenv("POSTGRES_URL"))
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT COUNT(*) FROM bents")
            count = cur.fetchone()['count']
            logging.info(f"Total records in bents table: {count}")
            
            cur.execute("SELECT title FROM bents LIMIT 5")
            sample_titles = [row['title'] for row in cur.fetchall()]
            logging.info(f"Sample titles: {sample_titles}")
        conn.close()
        return True
    except Exception as e:
        logging.error(f"Database verification failed: {str(e)}")
        return False

def extract_text_from_docx(file):
    """Extract text content from a DOCX file."""
    doc = Document(file)
    text = "\n".join([para.text for para in doc.paragraphs])
    return text

def extract_metadata_from_text(text):
    """Extract metadata from transcript text."""
    title = text.split('\n')[0] if text else "Untitled Video"
    return {"title": title}

def process_chat_logic(user_query, chat_history):
    # Initial input validation
    if not user_query or user_query in ['.', ',', '?', '!']:
        return {
            'response': "I'm sorry, but I didn't receive a valid question. Could you please ask a complete question?",
            'related_products': [],
            'urls': [],
            'contexts': [],
            'video_links': {}
        }

    # Format chat history
    formatted_history = []
    for i in range(0, len(chat_history) - 1, 2):
        human = chat_history[i]
        ai = chat_history[i + 1] if i + 1 < len(chat_history) else ""
        formatted_history.append((human, ai))

    # Check query relevance
    relevance_type, direct_response = check_query_relevance(user_query, formatted_history)
    
    if relevance_type != "RELEVANT":
        return {
            'response': direct_response,
            'related_products': [],
            'urls': [],
            'contexts': [],
            'video_links': {}
        }

    # Rewrite query for better search
    rewritten_query = rewrite_query(user_query, formatted_history)

    # Connect to database and get relevant content
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    source_documents = get_relevant_content(rewritten_query, cur)

    # Prepare context and create QA chain
    context = "\n".join([doc.page_content for doc in source_documents])
    
    prompt = ChatPromptTemplate.from_messages([
        SystemMessagePromptTemplate.from_template(SYSTEM_INSTRUCTIONS),
        HumanMessagePromptTemplate.from_template(
            "Context: {context}\n\nChat History: {chat_history}\n\nQuestion: {question}"
        )
    ])

    qa_chain = ConversationalRetrievalChain.from_llm(
        llm=llm,
        retriever=None,
        combine_docs_chain_kwargs={"prompt": prompt}
    )

    # Generate response
    result = qa_chain({
        "question": rewritten_query,
        "chat_history": formatted_history,
        "context": context
    })

    # Extract metadata and process answer
    video_titles = []
    urls = []
    contexts = []
    for doc in source_documents:
        metadata = doc.metadata
        video_titles.append(metadata.get('title', "Unknown Video"))
        urls.append(metadata.get('url', None))
        contexts.append(doc.page_content)

    processed_answer, video_dict = process_answer(
        result['answer'],
        urls,
        source_documents
    )

    # Get related products
    related_products = get_matched_products(
        video_titles[0] if video_titles else "Unknown Video"
    )

    # Prepare response
    response_data = {
        'response': result['answer'],
        'related_products': related_products,
        'urls': urls,
        'contexts': contexts,
        'video_links': video_dict,
        'video_titles': video_titles
    }

    # Close database connection
    cur.close()
    return_db_connection(conn)

    return response_data

def process_chat_with_timeout(user_query, chat_history, timeout=9):
    with ThreadPoolExecutor() as executor:
        future = executor.submit(
            partial(
                process_chat_logic,
                user_query=user_query,
                chat_history=chat_history
            )
        )
        try:
            return future.result(timeout=timeout)
        except TimeoutError:
            return {
                'response': "I apologize, but the request took too long to process. Please try asking a shorter or simpler question.",
                'related_products': [],
                'urls': [],
                'contexts': [],
                'video_links': {},
                'video_titles': []
            }

# Main chat endpoint
@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        user_query = data['message'].strip()
        chat_history = data.get('chat_history', [])

        # Process with timeout
        response_data = process_chat_with_timeout(user_query, chat_history)
        return jsonify(response_data)

    except Exception as e:
        logging.error(f"Error in chat route: {str(e)}", exc_info=True)
        return jsonify({
            'response': "An error occurred. Please try again with a simpler question.",
            'related_products': [],
            'urls': [],
            'contexts': [],
            'video_links': {}
        }), 500

@app.route('/api/user/<user_id>', methods=['GET'])
def get_user_data(user_id):
    """Get user conversation data."""
    try:
        user_data = {
            'conversationsBySection': {
                "transcripts": [],
                "shop-improvement": [],
                "tool-recommendations": []
            },
            'searchHistory': [],
            'selectedIndex': "transcripts"
        }
        return jsonify(user_data)
    except Exception as e:
        logging.error(f"Error fetching user data: {str(e)}", exc_info=True)
        return jsonify({'error': 'An error occurred fetching user data'}), 500

@app.route('/upload_document', methods=['POST'])
def upload_document():
    """Handle document upload and processing."""
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file part'})
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No selected file'})
    
    if file and file.filename.endswith('.docx'):
        try:
            # Save file temporarily
            filename = secure_filename(file.filename)
            file_path = os.path.join('/tmp', filename)
            file.save(file_path)
            
            # Process file
            transcript_text = extract_text_from_docx(file_path)
            metadata = extract_metadata_from_text(transcript_text)
            
            # Generate embedding
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
            chunks = text_splitter.split_text(transcript_text)
            
            # Connect to database
            conn = psycopg2.connect(os.getenv("POSTGRES_URL"))
            cur = conn.cursor()
            
            # Insert chunks into database
            for i, chunk in enumerate(chunks):
                chunk_id = f"{metadata['title']}_chunk_{i}"
                chunk_embedding = embeddings.embed_query(chunk)
                
                cur.execute("""
                    INSERT INTO bents (id, chunk_id, text, title, url, vector)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    str(uuid.uuid4()),
                    chunk_id,
                    chunk,
                    metadata['title'],
                    metadata.get('url', ''),
                    chunk_embedding
                ))
            
            conn.commit()
            cur.close()
            conn.close()
            
            # Clean up
            os.remove(file_path)
            
            return jsonify({'success': True, 'message': 'File uploaded and processed successfully'})
            
        except Exception as e:
            logging.error(f"Error processing document: {str(e)}")
            return jsonify({'success': False, 'message': f'Error processing document: {str(e)}'})
    else:
        return jsonify({'success': False, 'message': 'Invalid file format'})

@app.route('/documents', methods=['GET'])
def get_documents():
    """Get all documents from database."""
    try:
        conn = psycopg2.connect(os.getenv("POSTGRES_URL"))
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT DISTINCT title, url FROM bents")
            documents = cur.fetchall()
        conn.close()
        return jsonify(documents)
    except Exception as e:
        logging.error(f"Error fetching documents: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/')
def index():
    """Serve the main application page."""
    # Option 1: Return a simple status message since this is an API
    return jsonify({"status": "API is running"})

def init_app():
    """Initialize the application."""
    # Verify database connection
    if not verify_database():
        logging.error("Failed to verify database connection")
        raise Exception("Database verification failed")
    
    # Ensure required environment variables are set
    required_env_vars = ['OPENAI_API_KEY', 'POSTGRES_URL']
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    if missing_vars:
        raise Exception(f"Missing required environment variables: {', '.join(missing_vars)}")
    
    logging.info("Application initialized successfully")

if __name__ == '__main__':
    try:
        init_app()
        app.run(debug=True, port=5000)
    except Exception as e:
        logging.error(f"Failed to start application: {str(e)}")
