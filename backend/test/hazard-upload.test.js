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
  token = (await registerUser(baseUrl, 'hazard_owner')).token;
  otherToken = (await registerUser(baseUrl, 'other_owner')).token;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await stopDatabase();
});

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

function hazardForm(imageBytes, mimeType = 'image/png', authToken = token) {
  const form = new FormData();
  form.append('hazard', JSON.stringify({
    title: 'Flooded crossing',
    category: 'Flooding',
    severity: 'High',
    location: 'River Road',
    coordinates: { lat: 12, lng: 34 }
  }));
  form.append('image', new Blob([imageBytes], { type: mimeType }), 'hazard.png');
  return { form, headers: { Authorization: `Bearer ${authToken}` } };
}

function createPng() {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: '#ff0000'
    }
  }).png().toBuffer();
}

test('requires authentication and keeps each account hazard list private', async () => {
  const unauthorized = await fetch(`${baseUrl}/api/hazards`);
  assert.equal(unauthorized.status, 401);

  const response = await fetch(`${baseUrl}/api/hazards`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      title: 'Private road debris',
      category: 'Debris',
      severity: 'Medium',
      location: 'Market Street'
    })
  });
  assert.equal(response.status, 201);
  const created = (await response.json()).data;

  const otherListResponse = await fetch(`${baseUrl}/api/hazards`, {
    headers: { Authorization: `Bearer ${otherToken}` }
  });
  assert.deepEqual((await otherListResponse.json()).data, []);

  const otherDeleteResponse = await fetch(`${baseUrl}/api/hazards/${created.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${otherToken}` }
  });
  assert.equal(otherDeleteResponse.status, 404);
});

test('rejects uploads whose file signature does not match an image', async () => {
  const { form, headers } = hazardForm(Buffer.from('not an image'));
  const response = await fetch(`${baseUrl}/api/hazards`, { method: 'POST', headers, body: form });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /not a valid supported image/i);
  assert.equal(await app.models.Hazard.countDocuments({}), 1);
});

test('rejects a real image when the uploaded MIME type claims a different format', async () => {
  const { form, headers } = hazardForm(await createPng(), 'image/jpeg');
  const response = await fetch(`${baseUrl}/api/hazards`, { method: 'POST', headers, body: form });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /not a valid supported image/i);
  assert.equal(await app.models.Hazard.countDocuments({}), 1);
});

test('stores sanitized images in MongoDB and only serves them to their owner', async () => {
  const pngBytes = await createPng();
  const appendedData = Buffer.from('<script>not image content</script>');
  const { form, headers } = hazardForm(Buffer.concat([pngBytes, appendedData]));
  const response = await fetch(`${baseUrl}/api/hazards`, { method: 'POST', headers, body: form });
  let created;

  try {
    assert.equal(response.status, 201);
    created = (await response.json()).data;
    assert.match(created.imageUrl, /^\/api\/hazards\/hz_[a-f0-9-]+\/image$/);
    const persisted = await app.models.Hazard.collection.findOne({ id: created.id });
    assert.equal(persisted.hasImage, true);
    assert.ok(persisted.imageData.value().length > 0);

    const deniedImageResponse = await fetch(`${baseUrl}${created.imageUrl}`, {
      headers: { Authorization: `Bearer ${otherToken}` }
    });
    assert.equal(deniedImageResponse.status, 404);

    const imageResponse = await fetch(`${baseUrl}${created.imageUrl}`, { headers: authHeaders() });
    assert.equal(imageResponse.status, 200, await imageResponse.clone().text());
    assert.equal(imageResponse.headers.get('content-type'), 'image/png');
    const storedBytes = Buffer.from(await imageResponse.arrayBuffer());
    assert.equal(storedBytes.includes(appendedData), false);
    assert.equal((await sharp(storedBytes).metadata()).format, 'png');

    const deleteResponse = await fetch(`${baseUrl}/api/hazards/${created.id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    assert.equal(deleteResponse.status, 200);

    const removedImageResponse = await fetch(`${baseUrl}${created.imageUrl}`, { headers: authHeaders() });
    assert.equal(removedImageResponse.status, 404);
    created = null;
  } finally {
    if (created) {
      await fetch(`${baseUrl}/api/hazards/${created.id}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
    }
  }
});
