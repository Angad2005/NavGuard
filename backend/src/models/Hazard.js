'use strict';

const mongoose = require('mongoose');

const hazardSchema = new mongoose.Schema({
<<<<<<< HEAD
  id: { type: String, required: true, unique: true, index: true },
=======
  id: { type: String, required: true, unique: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
>>>>>>> fbc24ddca2a02f1afc11af6c62c1cf9005d4aa30
  title: { type: String, required: true },
  category: { type: String, required: true },
  severity: { type: String, required: true },
  location: { type: String, required: true },
  description: { type: String, default: '' },
  coordinates: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },
<<<<<<< HEAD
  imageUrl: { type: String, default: null },
=======
  hasImage: { type: Boolean, default: false },
  imageData: { type: Buffer, default: null, select: false },
  imageMimeType: { type: String, default: null, select: false },
>>>>>>> fbc24ddca2a02f1afc11af6c62c1cf9005d4aa30
  window: {
    scheduled: { type: Boolean, default: false },
    start: { type: String, default: null },
    end: { type: String, default: null }
  },
<<<<<<< HEAD
  confirmations: { type: Number, default: 1 },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, {
  versionKey: false
});

hazardSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret._id;
    return ret;
  }
});
=======
  confirmations: { type: Number, default: 1 }
}, { timestamps: true, versionKey: false });
>>>>>>> fbc24ddca2a02f1afc11af6c62c1cf9005d4aa30

module.exports = mongoose.models.Hazard || mongoose.model('Hazard', hazardSchema);
