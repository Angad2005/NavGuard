'use strict';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { connectDatabase } = require('../src/database');

async function startTestDatabase() {
  process.env.JWT_SECRET = 'naviguard-test-signing-secret-32-characters';
  const mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri('naviguard-test'));
  return async () => {
    await mongoose.disconnect();
    await mongo.stop();
  };
}

async function registerUser(baseUrl, username) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      email: `${username}@example.test`,
      password: 'safe-password-2026'
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Could not create test user.');
  return payload.data;
}

module.exports = { registerUser, startTestDatabase };
