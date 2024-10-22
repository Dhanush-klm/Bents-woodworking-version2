const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const { connectDb, pool } = require('./config/dbConnection.cjs');
const app = express();
const port = 5002;

const corsOptions = {
  origin: ['http://localhost:5173','http://localhost:5002','https://bents-frontend-server.vercel.app'],
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
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Flask backend URL
const FLASK_BACKEND_URL = 'https://bents-llm-server.vercel.app';






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

// Modify the save session route to handle large payloads
app.post('/api/save-session', async (req, res) => {
  const { userId, sessionData } = req.body;
  try {
    const cleanedSessionData = sessionData.map(session => ({
      ...session,
      conversations: session.conversations.map(conv => {
        const { products, ...cleanedConv } = conv;
        return {
          ...cleanedConv,
          video: conv.video || [],
          videoLinks: conv.videoLinks || {}
        };
      })
    }));

    const compressedSessionData = JSON.stringify(cleanedSessionData);
    const { rows } = await pool.query(
      'INSERT INTO session_hist (user_id, session_data) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET session_data = $2, updated_at = CURRENT_TIMESTAMP RETURNING *',
      [userId, compressedSessionData]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('Error saving session data:', error);
    res.status(500).json({ message: 'An error occurred while saving session data.', error: error.message });
  }
});

// Route to retrieve session data
app.get('/api/get-session/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { rows } = await pool.query('SELECT session_data FROM session_hist WHERE user_id = $1', [userId]);
    if (rows.length > 0) {
      res.json(rows[0].session_data);
    } else {
      res.json([]); // Return an empty array if no session data found
    }
  } catch (error) {
    console.error('Error retrieving session data:', error);
    res.status(500).json({ message: 'An error occurred while retrieving session data.' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Express server is running on http://localhost:${port}`);
});
