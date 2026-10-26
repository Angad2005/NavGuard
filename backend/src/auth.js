'use strict';

const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const path = require('path');
const User = require('./models/User');

const TOKEN_TTL = '7d';
const LOCAL_SECRET_PATH = path.resolve(__dirname, '..', '..', '.jwt-secret');

function getJwtSecret() {
  const configuredSecret = process.env.JWT_SECRET?.trim();
  if (configuredSecret) {
    if (configuredSecret.length < 32) {
      throw new Error('JWT_SECRET must contain at least 32 characters.');
    }
    return configuredSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Set JWT_SECRET to a stable secret of at least 32 characters before starting in production.');
  }

  try {
    const existingSecret = fs.readFileSync(LOCAL_SECRET_PATH, 'utf8').trim();
    if (existingSecret.length < 32) {
      throw new Error(`The local JWT secret at ${LOCAL_SECRET_PATH} is invalid. Remove that file and restart to generate a new one.`);
    }
    return existingSecret;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const generatedSecret = crypto.randomBytes(48).toString('base64url');
  try {
    const descriptor = fs.openSync(LOCAL_SECRET_PATH, 'wx', 0o600);
    try {
      fs.writeFileSync(descriptor, `${generatedSecret}\n`, 'utf8');
    } finally {
      fs.closeSync(descriptor);
    }
    return generatedSecret;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existingSecret = fs.readFileSync(LOCAL_SECRET_PATH, 'utf8').trim();
    if (existingSecret.length < 32) {
      throw new Error(`The local JWT secret at ${LOCAL_SECRET_PATH} is invalid.`);
    }
    return existingSecret;
  }
}

function createToken(user) {
  return jwt.sign({ sub: user.id }, getJwtSecret(), { expiresIn: TOKEN_TTL });
}

async function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Sign in to continue.' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (typeof payload.sub !== 'string') {
      return res.status(401).json({ error: 'Your session is invalid. Please sign in again.' });
    }
    const user = await User.findById(payload.sub).select('_id username email');
    if (!user) {
      return res.status(401).json({ error: 'Your account is no longer available.' });
    }
    req.user = user;
    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    }
    return next(error);
  }
}

function serializeUser(user) {
  return {
    id: user.id || user._id.toString(),
    username: user.username,
    email: user.email
  };
}

module.exports = { createToken, getJwtSecret, requireAuth, serializeUser };
