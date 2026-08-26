/*
 * Migration runner: executes every .sql file in this folder, in
 * filename order, against DATABASE_URL. Tracks applied migrations in
 * a `schema_migrations` table so re-running only applies new files.
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const dir = __dirname;

  // Distinguish "brand new database" from "already fully migrated by
  // the earlier version of this script, which never tracked anything
  // at all" - both look identical to an empty schema_migrations table,
  // but they need opposite handling. Checked before creating the
  // tracking table, since its own existence is what's being tested.
  const trackingTableCheck = await pool.query(
    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'schema_migrations') AS exists`
  );
  const trackingTableAlreadyExisted = trackingTableCheck.rows[0].exists;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT now()
    );
  `);

  if (!trackingTableAlreadyExisted) {
    // The tracking table is new, but is this a genuinely empty
    // database, or one the old script already fully migrated by hand
    // without ever recording it anywhere? `companies` is created in
    // the very first migration - if it's already there, every .sql
    // file that currently exists was already applied at some point,
    // and must be backfilled as such rather than re-run, which would
    // fail immediately on the first CREATE TABLE for a table that
    // already exists.
    const coreTableCheck = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'companies') AS exists`
    );
    if (coreTableCheck.rows[0].exists) {
      const existingFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
      for (const file of existingFiles) {
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
      }
      console.log(`Existing database detected — backfilled ${existingFiles.length} previously-applied migration(s) into schema_migrations.`);
    }
  }

  // Get list of already-applied migrations
  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let appliedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  - ${file} already applied, skipping`);
      skippedCount++;
      continue;
    }

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`Running migration: ${file}`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      console.log(`  \u2714 ${file} applied`);
      appliedCount++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  \u2718 ${file} failed:`, err.message);
      client.release();
      await pool.end();
      process.exit(1);
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log(
    `All migrations applied. (${appliedCount} newly applied, ${skippedCount} skipped)`
  );
}

run();
