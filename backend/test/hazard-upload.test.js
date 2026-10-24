'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const sharp = require('sharp');
const app = require('../src/server');

let server;
let baseUrl;

before(async () => {
  app.hazards.splice(0, app.hazards.length);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  app.hazards.splice(0, app.hazards.length);
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

function hazardForm(imageBytes, mimeType = 'image/png') {
  const form = new FormData();
  form.append('hazard', JSON.stringify({
    title: 'Flooded crossing',
    category: 'Flooding',
    severity: 'High',
    location: 'River Road',
    coordinates: { lat: 12, lng: 34 }
  }));
  form.append('image', new Blob([imageBytes], { type: mimeType }), 'hazard.png');
  return form;
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

test('continues to accept JSON hazard reports without an image', async () => {
  let created;

  try {
    const response = await fetch(`${baseUrl}/api/hazards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Road debris',
        category: 'Debris',
        severity: 'Medium',
        location: 'Market Street'
      })
    });

    assert.equal(response.status, 201);
    created = (await response.json()).data;
    assert.equal(created.imageUrl, null);
  } finally {
    if (created) {
      await fetch(`${baseUrl}/api/hazards/${created.id}`, { method: 'DELETE' });
    }
  }
});

test('rejects uploads whose file signature does not match an image', async () => {
  const response = await fetch(`${baseUrl}/api/hazards`, {
    method: 'POST',
    body: hazardForm(Buffer.from('not an image'))
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /not a valid supported image/i);
  assert.equal(app.hazards.length, 0);
});

test('rejects a real image when the uploaded MIME type claims a different format', async () => {
  const pngBytes = await createPng();
  const response = await fetch(`${baseUrl}/api/hazards`, {
    method: 'POST',
    body: hazardForm(pngBytes, 'image/jpeg')
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /not a valid supported image/i);
  assert.equal(app.hazards.length, 0);
});

test('strips non-image data appended to an otherwise valid image', async () => {
  const pngBytes = await createPng();
  const appendedData = Buffer.from('<script>not image content</script>');
  const response = await fetch(`${baseUrl}/api/hazards`, {
    method: 'POST',
    body: hazardForm(Buffer.concat([pngBytes, appendedData]))
  });
  let created;

  try {
    assert.equal(response.status, 201);
    created = (await response.json()).data;
    const imageResponse = await fetch(`${baseUrl}${created.imageUrl}`);
    assert.equal(imageResponse.status, 200);
    const storedBytes = Buffer.from(await imageResponse.arrayBuffer());
    assert.equal(storedBytes.includes(appendedData), false);
    assert.equal((await sharp(storedBytes).metadata()).format, 'png');
  } finally {
    if (created) {
      await fetch(`${baseUrl}/api/hazards/${created.id}`, { method: 'DELETE' });
    }
  }
});

test('stores a valid hazard image, serves it, and removes it with the hazard', async () => {
  const imageBytes = await createPng();
  let created;

  try {
    const response = await fetch(`${baseUrl}/api/hazards`, {
      method: 'POST',
      body: hazardForm(imageBytes)
    });

    assert.equal(response.status, 201);
    created = (await response.json()).data;
    assert.match(created.imageUrl, /^\/uploads\/[a-f0-9-]+\.png$/);

    const imageResponse = await fetch(`${baseUrl}${created.imageUrl}`);
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get('content-type'), 'image/png');
    const sanitizedBytes = Buffer.from(await imageResponse.arrayBuffer());
    assert.equal((await sharp(sanitizedBytes).metadata()).format, 'png');

    const deleteResponse = await fetch(`${baseUrl}/api/hazards/${created.id}`, {
      method: 'DELETE'
    });
    assert.equal(deleteResponse.status, 200);

    const removedImageResponse = await fetch(`${baseUrl}${created.imageUrl}`);
    assert.equal(removedImageResponse.status, 404);
    created = null;
  } finally {
    if (created) {
      await fetch(`${baseUrl}/api/hazards/${created.id}`, { method: 'DELETE' });
    }
  }
});
