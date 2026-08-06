import crypto from 'node:crypto';

export function generateToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

