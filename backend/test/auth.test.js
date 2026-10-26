'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { after, before, test } = require('node:test');
const path = require('node:path');
const { registerUser, startTestDatabase } = require('../test-support/mongo-setup');
const { getJwtSecret } = require('../src/auth');

let app;
let server;
let baseUrl;
let stopDatabase;

before(async () => {
  stopDatabase = await startTestDatabase();
  app = require('../src/server');
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await stopDatabase();
});

async function post(endpoint, body) {
  return fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('registers unique accounts, hashes passwords, and authenticates sessions', async () => {
  const created = await registerUser(baseUrl, 'unique_driver');
  assert.ok(created.token);
  assert.equal(created.user.username, 'unique_driver');

  const duplicateEmail = await post('/api/auth/register', {
    username: 'another_driver',
    email: 'unique_driver@example.test',
    password: 'safe-password-2026'
  });
  assert.equal(duplicateEmail.status, 409);

  const duplicateUsername = await post('/api/auth/register', {
    username: 'unique_driver',
    email: 'different@example.test',
    password: 'safe-password-2026'
  });
  assert.equal(duplicateUsername.status, 409);

  const storedUser = await app.models.User.findById(created.user.id).select('+passwordHash');
  assert.notEqual(storedUser.passwordHash, 'safe-password-2026');

  const login = await post('/api/auth/login', {
    email: 'UNIQUE_DRIVER@example.test',
    password: 'safe-password-2026'
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).data.user.id, created.user.id);
});

test('rejects invalid credentials and invalid signup input', async () => {
  const invalidPassword = await post('/api/auth/register', {
    username: 'tiny',
    email: 'tiny@example.test',
    password: 'short'
  });
  assert.equal(invalidPassword.status, 400);

  const invalidLogin = await post('/api/auth/login', {
    email: 'missing@example.test',
    password: 'not-the-password'
  });
  assert.equal(invalidLogin.status, 401);
});

test('requires a valid bearer token to read the signed-in account profile', async () => {
  const unauthorized = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(unauthorized.status, 401);

  const created = await registerUser(baseUrl, 'profile_driver');
  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${created.token}` }
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.user, created.user);
});

test('generates and reuses a private local JWT secret when none is configured', () => {
  const previousSecret = process.env.JWT_SECRET;
  const previousEnvironment = process.env.NODE_ENV;
  delete process.env.JWT_SECRET;
  delete process.env.NODE_ENV;

  try {
    const firstSecret = getJwtSecret();
    const secondSecret = getJwtSecret();
    const secretPath = path.resolve(__dirname, '..', '..', '.jwt-secret');

    assert.equal(firstSecret, secondSecret);
    assert.ok(firstSecret.length >= 32);
    assert.equal(fs.readFileSync(secretPath, 'utf8').trim(), firstSecret);
    assert.equal(fs.statSync(secretPath).mode & 0o077, 0);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  }
});
