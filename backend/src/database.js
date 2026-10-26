'use strict';

const mongoose = require('mongoose');
<<<<<<< HEAD

let isConnected = false;

async function connectDatabase(uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/naviguard') {
  if (isConnected || mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    isConnected = true;
    console.log(`[NaviGuard] Connected to MongoDB at ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')}`);
    return conn.connection;
  } catch (error) {
    console.warn(`[NaviGuard] MongoDB connection notice: ${error.message}. Running with in-memory persistence.`);
    return null;
  }
=======
const User = require('./models/User');
const Hazard = require('./models/Hazard');

async function connectDatabase(uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/naviguard') {
  await mongoose.connect(uri);
  await Promise.all([User.init(), Hazard.init()]);
  return mongoose.connection;
>>>>>>> fbc24ddca2a02f1afc11af6c62c1cf9005d4aa30
}

module.exports = { connectDatabase };
