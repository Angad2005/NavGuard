'use strict';

const mongoose = require('mongoose');
const User = require('./models/User');
const Hazard = require('./models/Hazard');
const SavedPlace = require('./models/SavedPlace');

async function connectDatabase(uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/naviguard') {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const connection = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
  });
  await Promise.all([User.init(), Hazard.init(), SavedPlace.init()]);
  console.log(`[NaviGuard] Connected to MongoDB at ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')}`);
  return connection.connection;
}

module.exports = { connectDatabase };
