'use strict';

const mongoose = require('mongoose');
const User = require('./models/User');
const Hazard = require('./models/Hazard');

async function connectDatabase(uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/naviguard') {
  await mongoose.connect(uri);
  await Promise.all([User.init(), Hazard.init()]);
  return mongoose.connection;
}

module.exports = { connectDatabase };
