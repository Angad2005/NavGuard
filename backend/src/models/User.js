'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 254
  },
  passwordHash: {
    type: String,
    required: true,
    select: false
  }
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
