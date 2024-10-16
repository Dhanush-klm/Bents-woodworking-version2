const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const { connectDb, pool } = require('./config/dbConnection.cjs');
const app = express();
const port = 5002;

const corsOptions = {
  origin: ['https://bents-frontend-server.vercel.app','https://bents-backend-server.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
};

// Apply CORS middleware
app.use(cors(corsOptions));

app.options('*', (req, res) => {
  res.sendStatus(204);
});

app.get('/test-cors', (req, res) => {
  res.json({ message: 'CORS is working' });
});
// Middleware
app.use(bodyParser.json());


// Flask backend URL
const FLASK_BACKEND_URL = 'https://bents-llm-server.vercel.app';


//////////////////////////////////////////////////////////////////////////////////////////////////////



app.get('/api/test-db', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT NOW()');
    res.json({ message: 'Database connection successful', timestamp: rows[0].now });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ message: 'Database connection failed', error: error.message });
  }
});

app.get('/api/check-table', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'conversation_history'
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error checking table structure:', error);
    res.status(500).json({ message: 'Error checking table structure', error: error.message });
  }
});

app.get('/api/get-conversation/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM conversation_history WHERE user_id = $1',
      [userId]
    );

    if (rows.length > 0) {
      const conversationData = rows[0];
      try {
        conversationData.conversations = JSON.parse(conversationData.conversations);
        console.log("Parsed conversations:", JSON.stringify(conversationData.conversations, null, 2));
      } catch (parseError) {
        console.error('Error parsing conversations JSON:', parseError);
      }
      res.json(conversationData);
    } else {
      res.status(404).json({ message: 'Conversation history not found for this user' });
    }
  } catch (error) {
    console.error('Error fetching conversation history:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/save-conversation', async (req, res) => {
  try {
    const { userId, selectedIndex, conversations } = req.body;
    console.log('Received data:', { userId, selectedIndex, conversations });

    // Only save if conversations is not empty
    if (conversations && Object.values(conversations).some(arr => arr.length > 0)) {
      const conversationsJson = JSON.stringify(conversations);

      const { rows } = await pool.query(
        `INSERT INTO conversation_history (user_id, selected_index, conversations)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE
         SET selected_index = $2, conversations = $3, updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [userId, selectedIndex, conversationsJson]
      );

      console.log('Query executed successfully. Returned rows:', rows);
      res.json(rows[0]);
    } else {
      console.log('Skipping save for empty conversations');
      res.json({ message: 'Skipped saving empty conversations' });
    }
  } catch (error) {
    console.error('Error saving conversation:', error);
    res.status(500).json({ message: 'Server error', error: error.message, stack: error.stack });
  }
});


















//////////////////////////////////////////////////////////////////////////////////////////////////////////




// Get user data
app.get('/api/user/:userId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE user_id = $1', [req.params.userId]);
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Save user data
app.post('/api/user/:userId', async (req, res) => {
  try {
    const { conversations, searchHistory, selectedIndex } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO users (user_id, conversations, search_history, selected_index) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE SET conversations = $2, search_history = $3, selected_index = $4 RETURNING *',
      [req.params.userId, JSON.stringify(conversations), JSON.stringify(searchHistory), selectedIndex]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('Error saving user data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.get('/api/random-questions', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, question_text 
      FROM questions 
      ORDER BY RANDOM() 
      LIMIT 3
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching random questions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Route to handle contact form submission
app.post('/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;
  try {
    console.log('Received contact form submission:', { name, email, subject, message });
    const { rows } = await pool.query(
      'INSERT INTO contacts (name, email, subject, message) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, subject, message]
    );
    console.log('Contact saved successfully:', rows[0]);
    res.json({ message: 'Message received successfully!', data: rows[0] });
  } catch (err) {
    console.error('Error saving contact data:', err);
    res.status(500).json({ message: 'An error occurred while processing your request.', error: err.message });
  }
});





app.post('/chat', async (req, res) => {
  try {
    const response = await axios.post(`${FLASK_BACKEND_URL}/chat`, req.body);
    res.json(response.data);
  } catch (error) {
    console.error('Error forwarding chat request to Flask:', error);
    res.status(500).json({ message: 'An error occurred while processing your chat request.' });
  }
});

app.get('/documents', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ message: 'An error occurred while fetching documents.' });
  }
});

app.post('/add_document', async (req, res) => {
  try {
    const { title, tags, link, image_url } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO products (id, title, tags, link, image_url) VALUES (uuid_generate_v4(), $1, $2, $3, $4) RETURNING *',
      [title, tags, link, image_url]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('Error adding document:', error);
    res.status(500).json({ message: 'An error occurred while adding the document.' });
  }
});

app.post('/delete_document', async (req, res) => {
  try {
    const { id } = req.body;
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ message: 'An error occurred while deleting the document.' });
  }
});

app.post('/update_document', async (req, res) => {
  try {
    const { id, title, tags, link } = req.body;
    await pool.query(
      'UPDATE products SET title = $2, tags = $3, link = $4 WHERE id = $1',
      [id, title, tags, link]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ message: 'An error occurred while updating the document.' });
  }
});

// Route to get all users
app.get('/api/users', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Route to get all migrated data
app.get('/api/migrated-data', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM pinecone_data');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching migrated data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Route to fetch products
app.get('/api/products', async (req, res) => {
  try {
    console.log('Attempting to fetch products...');
    const sortOption = req.query.sort || 'default';
    let query = 'SELECT id, title, tags, link, image_data FROM products';
    
    if (sortOption === 'video') {
      query += ' ORDER BY tags';
    }
    
    const { rows } = await pool.query(query);
    console.log('Products fetched:', rows);
    
    const products = rows.map(product => {
      const allTags = product.tags.split(',').map(tag => tag.trim());
      return {
        ...product,
        image_data: product.image_data ? product.image_data.toString('base64') : null,
        tags: allTags,
        groupTags: allTags.slice(0, -1)
      };
    });

    if (sortOption === 'video') {
      const groupedProducts = {};
      products.forEach(product => {
        product.groupTags.forEach(tag => {
          if (!groupedProducts[tag]) {
            groupedProducts[tag] = [];
          }
          groupedProducts[tag].push(product);
        });
      });
      res.json({ groupedProducts, sortOption });
    } else {
      res.json({ products, sortOption });
    }
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Test route
app.get('/test', (req, res) => {
  res.json({ message: 'Server is working' });
});

// Start the server
app.listen(port, () => {
  console.log(`Express server is running on http://localhost:${port}`);
});
