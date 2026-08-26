// Generates a new license token, independent of registering any
// company. Run this yourself, out of band, whenever a prospective
// customer needs a token to sign up with - registration no longer
// generates its own, since a token is now required up front rather
// than optional. Hand the printed token to whoever is registering;
// it covers up to 2 companies (see authController.js's registration
// check for the actual enforcement of that limit).
//
// Usage: node src/scripts/generateLicenseToken.js
require('dotenv').config();
const db = require('../config/db');
const { generateLicenseTokenString } = require('../utils/licenseToken');

async function main() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateLicenseTokenString();
    try {
      await db.query('INSERT INTO license_tokens (token) VALUES ($1)', [candidate]);
      console.log('New license token (covers up to 2 companies):');
      console.log('');
      console.log(`  ${candidate}`);
      console.log('');
      return;
    } catch (err) {
      if (err.code !== '23505' || attempt === 4) throw err; // 23505 = unique_violation, retry on the astronomically unlikely collision
    }
  }
}

main()
  .catch((err) => {
    console.error('Failed to generate a license token:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.pool.end());
