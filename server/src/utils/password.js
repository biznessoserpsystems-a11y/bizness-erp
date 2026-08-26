const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Used for password-reset / refresh-token storage: never store the raw token.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRandomToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Basic password strength policy: 8+ chars, upper, lower, number.
function isStrongPassword(pw) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(pw);
}

module.exports = {
  hashPassword,
  comparePassword,
  hashToken,
  generateRandomToken,
  isStrongPassword,
};
