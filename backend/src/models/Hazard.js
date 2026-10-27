'use strict';

const mongoose = require('mongoose');

const hazardSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  category: { type: String, required: true },
  severity: { type: String, required: true },
  location: { type: String, required: true },
  description: { type: String, default: '' },
  coordinates: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },
  hasImage: { type: Boolean, default: false },
  imageData: { type: Buffer, default: null, select: false },
  imageMimeType: { type: String, default: null, select: false },
  window: {
    scheduled: { type: Boolean, default: false },
    start: { type: String, default: null },
    end: { type: String, default: null }
  },
  confirmations: { type: Number, default: 1 }
}, { timestamps: true, versionKey: false });

hazardSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret._id;
    return ret;
  }
});

module.exports = mongoose.models.Hazard || mongoose.model('Hazard', hazardSchema);
