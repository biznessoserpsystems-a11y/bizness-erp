/*
 * Migration gap-checker: for every migration file, finds the FIRST new
 * table it creates (or, failing that, the first column it adds to an
 * existing table) and checks whether that marker actually exists in the
 * target database. Prints a clear per-file APPLIED / MISSING report.
 *
 * This does not run anything — it only reports. Run any MISSING file
 * individually with psql -f afterward.
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

function findMarker(sql) {
  const createTable = sql.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
  if (createTable) return { type: 'table', table: createTable[1] };
  const addColumn = sql.match(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
  if (addColumn) return { type: 'column', table: addColumn[1], column: addColumn[2] };
  return null;
}

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const dir = __dirname;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  let missingCount = 0;
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const marker = findMarker(sql);
    if (!marker) {
      console.log(`?  ${file} — no clear marker found, check manually`);
      continue;
    }

    let exists = false;
    if (marker.type === 'table') {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
        [marker.table]
      );
      exists = rows.length > 0;
    } else {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [marker.table, marker.column]
      );
      exists = rows.length > 0;
    }

    if (exists) {
      console.log(`✔  ${file}`);
    } else {
      console.log(`✘  ${file}  — MISSING (expected ${marker.type} "${marker.table}${marker.column ? '.' + marker.column : ''}" not found)`);
      missingCount++;
    }
  }

  console.log('');
  console.log(missingCount === 0 ? 'All migrations appear applied.' : `${missingCount} migration(s) appear MISSING — run each one individually with psql -f.`);
  await pool.end();
}

run();
