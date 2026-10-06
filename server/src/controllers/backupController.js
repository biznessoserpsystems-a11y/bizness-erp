const { spawn } = require('child_process');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { recordAudit } = require('../middleware/auditLog');

const DATABASE_URL = process.env.DATABASE_URL;

async function logBackupEvent({ action, status, fileSizeBytes, errorMessage, userId }) {
  await db.query(
    `INSERT INTO backup_logs (action, status, file_size_bytes, error_message, performed_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [action, status, fileSizeBytes ?? null, errorMessage ?? null, userId]
  );
}

// GET /settings/backup — streams a real pg_dump straight to the response,
// never written to disk on the server. --clean --if-exists means the dump
// includes DROP ... IF EXISTS before every CREATE, so it can be restored
// into a database that already has these tables without the "relation
// already exists" failures this app's own migration runner is prone to.
const createBackup = asyncHandler(async (req, res) => {
  if (!DATABASE_URL) throw new ApiError(500, 'DATABASE_URL is not configured on the server');

  const filename = `bizness-os-backup-${new Date().toISOString().slice(0, 10)}.sql`;
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // --schema=public: only the app's own tables. A hosted Postgres (Supabase, etc.) also holds its own
  // system schemas (auth, storage, extensions...) that this role can't drop or recreate, so including
  // them makes the backup impossible to restore.
  const dump = spawn('pg_dump', ['--schema=public', '--clean', '--if-exists', '--no-owner', '--no-privileges', DATABASE_URL]);

  let bytesWritten = 0;
  let stderrOutput = '';
  dump.stdout.on('data', (chunk) => { bytesWritten += chunk.length; });
  dump.stderr.on('data', (chunk) => { stderrOutput += chunk.toString(); });
  dump.stdout.pipe(res);

  dump.on('error', async (err) => {
    // pg_dump itself couldn't even start (not on PATH, etc.)
    await logBackupEvent({ action: 'backup', status: 'failed', errorMessage: err.message, userId: req.user.id }).catch(() => {});
    if (!res.headersSent) res.status(500);
    res.end(`\n-- pg_dump failed to start: ${err.message}\n`);
  });

  dump.on('close', async (code) => {
    const status = code === 0 ? 'success' : 'failed';
    await logBackupEvent({
      action: 'backup', status, fileSizeBytes: bytesWritten,
      errorMessage: code === 0 ? null : (stderrOutput.slice(0, 2000) || `pg_dump exited with code ${code}`),
      userId: req.user.id,
    }).catch(() => {});
    if (code === 0) {
      await recordAudit({
        companyId: req.user.companyId, userId: req.user.id, action: 'CREATE',
        entityType: 'backup', entityId: null, newValues: { filename, bytes: bytesWritten }, ip: req.ip,
      }).catch(() => {});
    }
  });
});

// POST /settings/restore — DESTRUCTIVE. Requires the exact confirmation
// phrase in the request body as a server-side safety net (not just a
// frontend checkbox that could be bypassed by calling the API directly).
// The uploaded file's buffer is piped straight into psql's stdin — never
// written to disk — with --single-transaction, so a failure partway
// through rolls the *entire* restore back rather than leaving the
// database in a half-restored state.
// Exported separately so this validation can be unit tested directly
// against string fixtures, without needing a running server or database
// - the actual bug this exists to catch (a truncated upload silently
// accepted and partially applied) was only found by testing the real
// HTTP endpoint end to end, but the fix itself is pure and deserves a
// fast, deterministic regression test, not just a slow, one-off manual
// check that won't run again automatically.
function looksLikeCompleteDump(text) {
  // Checking the header is merely present anywhere in the text isn't
  // enough — "PostgreSQL database dump complete" (the footer) contains
  // "PostgreSQL database dump" as a substring, so a file with only a
  // footer and no genuine header would satisfy an unscoped .includes()
  // check for both. The header must appear near the file's actual
  // start, matching where pg_dump genuinely places it.
  const startsWithRealHeader = text.slice(0, 200).includes('-- PostgreSQL database dump');
  const endsWithCompletionMarker = text.trimEnd().includes('-- PostgreSQL database dump complete');
  return startsWithRealHeader && endsWithCompletionMarker;
}

// Schemas a dump creates other than 'public'. A backup made before backups were limited to the app's own
// schema also contains the database host's system schemas, which can't be restored by this app's login.
function foreignSchemasIn(text) {
  const names = new Set();
  for (const m of text.matchAll(/^CREATE SCHEMA (?:IF NOT EXISTS )?"?([A-Za-z0-9_]+)"?;/gm)) {
    if (m[1] !== 'public') names.add(m[1]);
  }
  return [...names];
}

// pg_dump --clean writes DROP SCHEMA public / CREATE SCHEMA public, which fails whenever an extension
// (pgcrypto, uuid-ossp) lives in public, and public must never be dropped on a hosted database anyway.
// The tables are cleared by the preamble below instead, so those two lines are removed.
function prepareRestoreSql(text) {
  const withoutSchemaStatements = text
    .replace(/^DROP SCHEMA IF EXISTS public;\r?\n/m, '')
    .replace(/^CREATE SCHEMA public;\r?\n/m, '');
  // Drop every table in public first (CASCADE), including tables the backup doesn't know about, so a
  // newer table with a foreign key into an older one can't block the restore. lock_timeout makes a
  // blocked DROP fail with a clear message instead of hanging until the request times out.
  const preamble = `SET client_min_messages = warning;
SET lock_timeout = '20s';
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
  END LOOP;
END $$;
`;
  return preamble + withoutSchemaStatements;
}

const restoreBackup = asyncHandler(async (req, res) => {
  if (!DATABASE_URL) throw new ApiError(500, 'DATABASE_URL is not configured on the server');
  if (!req.file) throw new ApiError(400, 'A backup .sql file is required');
  if (req.body.confirm !== 'RESTORE') {
    throw new ApiError(400, 'Type RESTORE in the confirmation field to proceed — this replaces all existing data');
  }

  // A truncated or otherwise incomplete upload is not itself invalid SQL
  // — it's just SQL that stops partway through, often mid-COPY-block —
  // so psql's --set ON_ERROR_STOP=1 does not catch it: the input stream
  // simply ends, psql treats that as "that was all the input" rather
  // than an error, and exits 0 having applied only whatever came before
  // the cut. Confirmed directly: a file truncated at 50% restored some
  // tables' data and left others empty, with the API reporting success
  // and no error at all. pg_dump always writes a specific header at the
  // very start and a specific completion marker as its last substantive
  // line — checking both, before ever spawning psql, catches truncation
  // (and a not-actually-a-backup file entirely) up front, when rejecting
  // is still free, rather than after a destructive restore has already
  // partially run.
  const text = req.file.buffer.toString('utf8');
  if (!looksLikeCompleteDump(text)) {
    throw new ApiError(400, 'This file does not look like a complete Bizness-OS backup — it may be truncated or corrupted. Restore was not attempted.');
  }

  const foreign = foreignSchemasIn(text);
  if (foreign.length) {
    throw new ApiError(400, `This backup also contains the database host's own system schemas (${foreign.slice(0, 5).join(', ')}${foreign.length > 5 ? ', ...' : ''}), which can't be restored safely. It was made before backups were limited to the app's own data. Create a new backup from this page and restore that one. Restore was not attempted.`);
  }

  const restoreSql = Buffer.from(prepareRestoreSql(text), 'utf8');
  const restore = spawn('psql', ['--single-transaction', '--set', 'ON_ERROR_STOP=1', DATABASE_URL]);
  let responded = false;
  const respond = (status, body) => { if (!responded) { responded = true; res.status(status).json(body); } };

  let stderrOutput = '';
  let stdoutOutput = '';
  restore.stdout.on('data', (chunk) => { stdoutOutput += chunk.toString(); });
  restore.stderr.on('data', (chunk) => { stderrOutput += chunk.toString(); });

  restore.on('error', async (err) => {
    await logBackupEvent({ action: 'restore', status: 'failed', errorMessage: err.message, userId: req.user.id }).catch(() => {});
    respond(500, { error: `psql failed to start: ${err.message}` });
  });

  restore.on('close', async (code) => {
    const status = code === 0 ? 'success' : 'failed';
    await logBackupEvent({
      action: 'restore', status, fileSizeBytes: req.file.buffer.length,
      errorMessage: code === 0 ? null : (stderrOutput.slice(0, 2000) || `psql exited with code ${code}`),
      userId: req.user.id,
    }).catch(() => {});

    if (code !== 0) {
      // Lead with the lines that explain the failure; psql can print a lot of other output around them.
      const keyLines = stderrOutput.split('\n').filter((l) => /^(psql:|ERROR|DETAIL|HINT|CONTEXT|LINE|FATAL)/.test(l)).join('\n');
      return respond(500, { error: 'Restore failed and was rolled back — no changes were made.', details: (keyLines || stderrOutput || `psql exited with code ${code}`).slice(0, 2000) });
    }

    await recordAudit({
      companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE',
      entityType: 'backup', entityId: null, newValues: { restoredBytes: req.file.buffer.length }, ip: req.ip,
    }).catch(() => {});
    if (!responded) { responded = true; res.json({ success: true, output: stdoutOutput.slice(-2000) }); }
  });

  // If psql stops early (a permission error on the first statement, say) while the file is still being
  // written to it, the write fails with EPIPE. Unhandled, that crashes the whole server and the real
  // error is lost; psql's own message is reported from the 'close' handler above instead.
  restore.stdin.on('error', () => {});
  restore.stdin.write(restoreSql);
  restore.stdin.end();
});

// GET /settings/backup-logs
const listBackupLogs = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT bl.*, u.first_name, u.last_name
     FROM backup_logs bl
     LEFT JOIN users u ON u.id = bl.performed_by
     ORDER BY bl.created_at DESC LIMIT 50`
  );
  res.json(rows);
});

module.exports = { createBackup, restoreBackup, listBackupLogs, looksLikeCompleteDump, foreignSchemasIn, prepareRestoreSql };
