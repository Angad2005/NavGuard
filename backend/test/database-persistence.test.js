'use strict';

const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Hazard = require('../src/models/Hazard');
const SavedPlace = require('../src/models/SavedPlace');
const User = require('../src/models/User');
const { connectDatabase } = require('../src/database');

let mongo;

after(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('MongoDB records and uploaded images survive an application disconnect and reconnect', async () => {
  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri('naviguard-persistence-test');
  await connectDatabase(uri);

  const user = await User.create({
    username: 'persistent_driver',
    email: 'persistent@example.test',
    passwordHash: 'test-password-hash'
  });
  const imageData = Buffer.from('persisted-image-bytes');
  const hazard = await Hazard.create({
    id: 'hz_persistence_test',
    ownerId: user._id,
    title: 'Persistent hazard',
    category: 'Debris',
    severity: 'Low',
    location: 'Test Road',
    imageData,
    imageMimeType: 'image/png',
    hasImage: true
  });
  const place = await SavedPlace.create({
    id: 'place_persistence_test',
    ownerId: user._id,
    name: 'Persistent place',
    coordinates: { lat: 12, lng: 34 },
    imageData,
    imageMimeType: 'image/png',
    hasImage: true
  });

  await mongoose.disconnect();
  await connectDatabase(uri);

  assert.ok(await User.findById(user._id));
  const persistedHazard = await Hazard.collection.findOne({ id: hazard.id });
  const persistedPlace = await SavedPlace.collection.findOne({ id: place.id });
  assert.deepEqual(persistedHazard.imageData.value(), imageData);
  assert.deepEqual(persistedPlace.imageData.value(), imageData);
});
