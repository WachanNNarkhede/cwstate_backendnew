const mongoose = require('mongoose');

// Cache the database connection
let cachedDb = null;

async function connectToDatabase() {
  // If we have a valid cached connection, use it
  if (cachedDb && cachedDb.readyState === 1) {
    console.log('📦 Using cached database connection');
    return cachedDb;
  }

  console.log('🆕 Creating new database connection');
  
  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4
    });
    
    cachedDb = connection;
    console.log('✅ MongoDB connected successfully');
    return connection;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

module.exports = { connectToDatabase };