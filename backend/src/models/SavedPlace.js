'use strict';

const mongoose = require('mongoose');

const savedPlaceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  hasImage: { type: Boolean, default: false },
  imageData: { type: Buffer, default: null, select: false },
  imageMimeType: { type: String, default: null, select: false }
}, { timestamps: true, versionKey: false });

module.exports = mongoose.models.SavedPlace || mongoose.model('SavedPlace', savedPlaceSchema);
