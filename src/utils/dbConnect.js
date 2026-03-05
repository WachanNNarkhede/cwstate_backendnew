const mongoose = require('mongoose');

// Cache the database connection
let cachedDb = null;

async function connectToDatabase() {
  // If we have a valid cached connection, use it
  if (cachedDb && cachedDb.readyState === 1) {
    console.log('📦 Using cached database connection');
    return cachedDb;
  }

  // Otherwise, create a new connection
  console.log('🆕 Creating new database connection');
  
  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,  // Timeout after 5 seconds
      socketTimeoutMS: 45000,           // Close sockets after 45 seconds
      family: 4                         // Force IPv4 (helps with Atlas)
    });
    
    cachedDb = connection;
    console.log('✅ MongoDB connected successfully');
    return connection;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

// IMPORTANT: DO NOT close connections in serverless!
// Let Vercel handle cleanup

module.exports = { connectToDatabase };