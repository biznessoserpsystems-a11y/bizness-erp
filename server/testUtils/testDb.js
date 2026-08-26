const { Pool } = require('pg');

/**
 * Integration tests need a real Postgres running the project's actual
 * migrations — the docker-compose.yml at the repo root will do it:
 *
 *   docker compose up -d
 *   createdb -h localhost -U postgres bizness_os_test   # or: psql -c "CREATE DATABASE bizness_os_test;"
 *   DATABASE_URL=postgres://postgres:<pw>@localhost:5432/bizness_os_test node src/migrations/run.js
 *   TEST_DATABASE_URL=postgres://postgres:<pw>@localhost:5432/bizness_os_test npm run test:integration
 *
 * If TEST_DATABASE_URL isn't set, this falls back to a local default —
 * convenient for local dev, but CI should always set it explicitly.
 */
const connectionString =
  process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/bizness_os_test';

const pool = new Pool({ connectionString });

/**
 * Runs `fn(client)` inside a transaction that is always rolled back
 * afterwards, regardless of whether `fn` throws. This lets every test seed
 * whatever company/product/warehouse rows it needs and call the real
 * service functions against real Postgres — real constraints, real NUMERIC
 * rounding, the real ORDER BY — without any test leaving data behind or
 * tests needing to coordinate cleanup between each other.
 */
async function withRollback(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function closePool() {
  await pool.end();
}

module.exports = { withRollback, closePool };
