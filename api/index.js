const express = require('express');
const cors = require('cors');
const { connectToDatabase } = require('../src/utils/dbConnect'); // Import the connection

// Import your routes (paths are now ../src/routes/)
const clanRoutes = require('../src/routes/clanRoutes');
const groupRoutes = require('../src/routes/groupRoutes');

const app = express();

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  process.env.CLIENT_URL || 'https://cwstate-frontendnew.vercel.app'
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error('CORS not allowed'), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await connectToDatabase();
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      db: 'connected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Database connection failed',
      error: error.message 
    });
  }
});

// Connect to database for all API routes
app.use('/api', async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    res.status(500).json({ 
      error: 'Database connection failed',
      details: error.message 
    });
  }
});

// Your routes
app.use('/api/clan', clanRoutes);
app.use('/api/groups', groupRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ 
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Export for Vercel
module.exports = app;