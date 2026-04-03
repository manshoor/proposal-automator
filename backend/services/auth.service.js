import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import * as userRepo from '../repositories/user.repository.js';
import * as refreshTokenRepo from '../repositories/refresh-token.repository.js';
import * as profileRepo from '../repositories/profile.repository.js';
import * as settingsRepo from '../repositories/settings.repository.js';
import { ValidationError, AuthenticationError, ConflictError } from '../lib/errors.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';
const BCRYPT_ROUNDS = 10;

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function generateTokens(user) {
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );
  const refreshToken = randomBytes(40).toString('hex');
  return { accessToken, refreshToken };
}

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

export async function register({ email, password, fullName }) {
  if (!email || !password) {
    throw new ValidationError('email and password are required');
  }
  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }

  const existing = await userRepo.findByEmail(email);
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await userRepo.create({ email, passwordHash, fullName });

  // Create initial profile and settings for the new user
  await profileRepo.create({
    full_name: fullName || '',
    title: '', summary: '', skills: [],
    experience: '', portfolio: '', default_hourly_rate: 50.0,
  }, user.id);

  await settingsRepo.ensureExists(user.id);

  const { accessToken, refreshToken } = generateTokens(user);

  // Store refresh token hash
  const expiresAt = new Date(Date.now() + parseDuration(REFRESH_EXPIRY));
  await refreshTokenRepo.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt,
  });

  return { user: sanitizeUser(user), accessToken, refreshToken };
}

export async function login({ email, password }) {
  if (!email || !password) {
    throw new ValidationError('email and password are required');
  }

  const user = await userRepo.findByEmail(email);
  if (!user) {
    throw new AuthenticationError('Invalid email or password');
  }

  if (!user.is_active) {
    throw new AuthenticationError('Account is deactivated');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new AuthenticationError('Invalid email or password');
  }

  const { accessToken, refreshToken } = generateTokens(user);

  const expiresAt = new Date(Date.now() + parseDuration(REFRESH_EXPIRY));
  await refreshTokenRepo.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt,
  });

  return { user: sanitizeUser(user), accessToken, refreshToken };
}

export async function refresh(token) {
  if (!token) {
    throw new AuthenticationError('Refresh token is required');
  }

  const record = await refreshTokenRepo.findByHash(hashToken(token));
  if (!record) {
    throw new AuthenticationError('Invalid or expired refresh token');
  }

  if (!record.is_active) {
    throw new AuthenticationError('Account is deactivated');
  }

  // Rotate: delete old token, issue new pair
  await refreshTokenRepo.deleteByUserId(record.user_id);

  const user = { id: record.user_id, email: record.email };
  const { accessToken, refreshToken } = generateTokens(user);

  const expiresAt = new Date(Date.now() + parseDuration(REFRESH_EXPIRY));
  await refreshTokenRepo.create({
    userId: record.user_id,
    tokenHash: hashToken(refreshToken),
    expiresAt,
  });

  return { accessToken, refreshToken };
}

export async function logout(userId) {
  await refreshTokenRepo.deleteByUserId(userId);
}

export function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function parseDuration(str) {
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 days
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return num * multipliers[unit];
}
