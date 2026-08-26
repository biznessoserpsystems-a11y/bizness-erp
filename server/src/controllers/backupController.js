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

  const dump = spawn('pg_dump', ['--clean', '--if-exists', '--no-owner', '--no-privileges', DATABASE_URL]);

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

  const restore = spawn('psql', ['--single-transaction', '--set', 'ON_ERROR_STOP=1', DATABASE_URL]);

  let stderrOutput = '';
  let stdoutOutput = '';
  restore.stdout.on('data', (chunk) => { stdoutOutput += chunk.toString(); });
  restore.stderr.on('data', (chunk) => { stderrOutput += chunk.toString(); });

  restore.on('error', async (err) => {
    await logBackupEvent({ action: 'restore', status: 'failed', errorMessage: err.message, userId: req.user.id }).catch(() => {});
    res.status(500).json({ error: `psql failed to start: ${err.message}` });
  });

  restore.on('close', async (code) => {
    const status = code === 0 ? 'success' : 'failed';
    await logBackupEvent({
      action: 'restore', status, fileSizeBytes: req.file.buffer.length,
      errorMessage: code === 0 ? null : (stderrOutput.slice(0, 2000) || `psql exited with code ${code}`),
      userId: req.user.id,
    }).catch(() => {});

    if (code !== 0) {
      return res.status(500).json({ error: 'Restore failed and was rolled back — no changes were made.', details: stderrOutput.slice(0, 2000) });
    }

    await recordAudit({
      companyId: req.user.companyId, userId: req.user.id, action: 'UPDATE',
      entityType: 'backup', entityId: null, newValues: { restoredBytes: req.file.buffer.length }, ip: req.ip,
    }).catch(() => {});
    res.json({ success: true, output: stdoutOutput.slice(-2000) });
  });

  restore.stdin.write(req.file.buffer);
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

module.exports = { createBackup, restoreBackup, listBackupLogs, looksLikeCompleteDump };
