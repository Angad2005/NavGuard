'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { registerUser, startTestDatabase } = require('../test-support/mongo-setup');

let app;
let server;
let baseUrl;
let token;
let stopDatabase;
const originalFetch = global.fetch;
const originalWeatherUrl = process.env.WEATHER_API_URL;

function mockWeatherFetch(weatherFetch) {
  global.fetch = (url, options) => (
    String(url).startsWith(baseUrl)
      ? originalFetch(url, options)
      : weatherFetch(url, options)
  );
}

before(async () => {
  stopDatabase = await startTestDatabase();
  process.env.WEATHER_API_URL = 'https://weather.test/v1/forecast';
  app = require('../src/server');
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  token = (await registerUser(baseUrl, 'weather_driver')).token;
});

after(async () => {
  global.fetch = originalFetch;
  if (originalWeatherUrl === undefined) delete process.env.WEATHER_API_URL;
  else process.env.WEATHER_API_URL = originalWeatherUrl;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await stopDatabase();
});

test('validates weather coordinates and requires an authenticated user', async () => {
  const invalid = await fetch(`${baseUrl}/api/weather?lat=100&lng=20`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(invalid.status, 400);

  const unauthorized = await fetch(`${baseUrl}/api/weather?lat=10&lng=20`);
  assert.equal(unauthorized.status, 401);
});

test('fetches configured Open-Meteo current weather and maps it for the UI', async () => {
  let requestedUrl;
  mockWeatherFetch(async (url) => {
    requestedUrl = new URL(url);
    return new Response(JSON.stringify({
      timezone: 'Asia/Kolkata',
      current: {
        temperature_2m: 29.5,
        apparent_temperature: 32,
        relative_humidity_2m: 68,
        precipitation: 0.2,
        rain: 0.2,
        showers: 0,
        snowfall: 0,
        weather_code: 61,
        cloud_cover: 72,
        is_day: 1,
        time: '2026-10-25T14:00',
        wind_speed_10m: 12.4,
        wind_direction_10m: 180
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  const response = await fetch(`${baseUrl}/api/weather?lat=28.6&lng=77.2`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(response.status, 200);
  assert.equal(requestedUrl.origin + requestedUrl.pathname, 'https://weather.test/v1/forecast');
  assert.equal(requestedUrl.searchParams.get('latitude'), '28.6');
  assert.equal(requestedUrl.searchParams.get('longitude'), '77.2');
  assert.equal(requestedUrl.searchParams.get('wind_speed_unit'), 'kmh');
  assert.equal(requestedUrl.searchParams.get('current'), 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m');
  assert.deepEqual((await response.json()).data, {
    temperature: 29.5,
    apparentTemperature: 32,
    relativeHumidity: 68,
    precipitation: 0.2,
    rain: 0.2,
    showers: 0,
    snowfall: 0,
    weathercode: 61,
    windspeed: 12.4,
    windDirection: 180,
    cloudCover: 72,
    isDay: 1,
    time: '2026-10-25T14:00',
    timezone: 'Asia/Kolkata',
    source: 'Open-Meteo'
  });
});

test('reports unavailable weather-provider responses instead of returning stale weather', async () => {
  mockWeatherFetch(async () => new Response('service unavailable', { status: 503 }));
  const response = await fetch(`${baseUrl}/api/weather?lat=28.6&lng=77.2`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /Weather provider returned HTTP 503/);
});
