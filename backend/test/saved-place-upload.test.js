'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const sharp = require('sharp');
const { registerUser, startTestDatabase } = require('../test-support/mongo-setup');

let app;
let server;
let baseUrl;
let token;
let otherToken;
let stopDatabase;

before(async () => {
  stopDatabase = await startTestDatabase();
  app = require('../src/server');
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  token = (await registerUser(baseUrl, 'place_owner')).token;
  otherToken = (await registerUser(baseUrl, 'place_other')).token;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await stopDatabase();
});

function createPng() {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: '#2563eb'
    }
  }).png().toBuffer();
}

function authHeaders(authToken = token) {
  return { Authorization: `Bearer ${authToken}` };
}

test('saved places require authentication and are private to the owner', async () => {
  const denied = await fetch(`${baseUrl}/api/places`);
  assert.equal(denied.status, 401);

  const response = await fetch(`${baseUrl}/api/places`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Home',
      coordinates: { lat: 12.5, lng: 34.5 }
    })
  });
  assert.equal(response.status, 201);
  const savedPlace = (await response.json()).data;
  const otherListResponse = await fetch(`${baseUrl}/api/places`, {
    headers: authHeaders(otherToken)
  });
  assert.deepEqual((await otherListResponse.json()).data, []);

  const otherDeleteResponse = await fetch(`${baseUrl}/api/places/${savedPlace.id}`, {
    method: 'DELETE',
    headers: authHeaders(otherToken)
  });
  assert.equal(otherDeleteResponse.status, 404);

  await fetch(`${baseUrl}/api/places/${savedPlace.id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
});

test('saved place images accept valid images only and are owner-protected', async () => {
  const form = new FormData();
  form.append('name', 'Office');
  form.append('coordinates', JSON.stringify({ lat: 12.5, lng: 34.5 }));
  form.append('image', new Blob([await createPng()], { type: 'image/png' }), 'office.png');
  const response = await fetch(`${baseUrl}/api/places`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  });
  assert.equal(response.status, 201);
  const place = (await response.json()).data;
  assert.match(place.imageUrl, /^\/api\/places\/place_[a-f0-9-]+\/image$/);

  try {
    const persisted = await app.models.SavedPlace.collection.findOne({ id: place.id });
    assert.equal(persisted.hasImage, true);
    assert.ok(persisted.imageData.value().length > 0);

    const deniedImage = await fetch(`${baseUrl}${place.imageUrl}`, {
      headers: authHeaders(otherToken)
    });
    assert.equal(deniedImage.status, 404);

    const imageResponse = await fetch(`${baseUrl}${place.imageUrl}`, {
      headers: authHeaders()
    });
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get('content-type'), 'image/png');
    assert.equal((await sharp(Buffer.from(await imageResponse.arrayBuffer())).metadata()).format, 'png');

    const invalidForm = new FormData();
    invalidForm.append('name', 'Invalid upload');
    invalidForm.append('coordinates', JSON.stringify({ lat: 12.5, lng: 34.5 }));
    invalidForm.append('image', new Blob(['not an image'], { type: 'image/png' }), 'image.png');
    const invalidResponse = await fetch(`${baseUrl}/api/places`, {
      method: 'POST',
      headers: authHeaders(),
      body: invalidForm
    });
    assert.equal(invalidResponse.status, 400);
    assert.match((await invalidResponse.json()).error, /not a valid supported image/i);

    const nonImageForm = new FormData();
    nonImageForm.append('name', 'Text upload');
    nonImageForm.append('coordinates', JSON.stringify({ lat: 12.5, lng: 34.5 }));
    nonImageForm.append('image', new Blob(['text'], { type: 'text/plain' }), 'note.txt');
    const nonImageResponse = await fetch(`${baseUrl}/api/places`, {
      method: 'POST',
      headers: authHeaders(),
      body: nonImageForm
    });
    assert.equal(nonImageResponse.status, 400);
    assert.match((await nonImageResponse.json()).error, /upload a jpeg, png, webp, or gif image/i);
  } finally {
    await fetch(`${baseUrl}/api/places/${place.id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
  }
});
