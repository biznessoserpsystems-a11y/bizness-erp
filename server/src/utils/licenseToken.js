const crypto = require('crypto');

// Excludes 0/O and 1/I/L — the standard reasoning for any code a human
// might actually read aloud, type by hand, or copy into a second
// company's registration form: those pairs are visually near-identical
// in many fonts, and a token that's wrong in exactly one confusable
// character is a genuinely bad failure mode for something meant to be
// shared between two related businesses.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 16;

function generateLicenseTokenString() {
  const bytes = crypto.randomBytes(LENGTH);
  let token = '';
  for (let i = 0; i < LENGTH; i++) {
    token += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return token;
}

module.exports = { generateLicenseTokenString };
