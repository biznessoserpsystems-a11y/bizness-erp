const { looksLikeCompleteDump } = require('../controllers/backupController');

const REAL_HEADER = '--\n-- PostgreSQL database dump\n--\n\n\\restrict abc123\n\nSET statement_timeout = 0;\n';
const REAL_FOOTER = '\n--\n-- PostgreSQL database dump complete\n--\n\n\\unrestrict abc123\n';

describe('looksLikeCompleteDump', () => {
  // The regression test for the real bug this function exists to fix:
  // found by actually truncating a genuine backup file and restoring
  // it through the real HTTP endpoint. psql exited 0 with no error -
  // ON_ERROR_STOP=1 only catches explicit SQL errors in statements that
  // are fully present, not an input stream that simply ends mid-COPY-
  // block. The database was left with some tables' data restored and
  // others not, silently, with the API reporting success.
  test('rejects a file truncated partway through, cut off mid-statement', () => {
    const fullDump = REAL_HEADER + 'COPY public.permissions (id, code) FROM stdin;\n1\tsystem.users.manage\n' + REAL_FOOTER;
    const truncated = fullDump.slice(0, Math.floor(fullDump.length / 2));
    expect(looksLikeCompleteDump(truncated)).toBe(false);
  });

  test('accepts a genuine, complete dump with both the header and completion marker present', () => {
    const fullDump = REAL_HEADER + 'COPY public.permissions (id, code) FROM stdin;\n1\tsystem.users.manage\n\\.\n' + REAL_FOOTER;
    expect(looksLikeCompleteDump(fullDump)).toBe(true);
  });

  test('rejects a file with the completion marker but missing the header entirely (not a real pg_dump at all)', () => {
    // Padded to a realistic size so the footer genuinely falls outside
    // any reasonable "start of file" window - a short fixture would
    // accidentally place the footer text within the first 200
    // characters purely because the whole fixture is short, which a
    // real, hundreds-of-KB uploaded file never would.
    const filler = 'not a real backup file, just some other text\n'.repeat(50);
    const notADump = filler + REAL_FOOTER;
    expect(looksLikeCompleteDump(notADump)).toBe(false);
  });

  test('rejects a file with the header but no completion marker (cut off right at the very end)', () => {
    const cutAtTheEnd = REAL_HEADER + 'COPY public.permissions (id, code) FROM stdin;\n1\tsystem.users.manage\n\\.\n';
    expect(looksLikeCompleteDump(cutAtTheEnd)).toBe(false);
  });

  test('rejects an empty file', () => {
    expect(looksLikeCompleteDump('')).toBe(false);
  });

  test('accepts a complete dump even with trailing whitespace after the footer', () => {
    const fullDump = REAL_HEADER + 'COPY public.permissions (id, code) FROM stdin;\n1\tsystem.users.manage\n\\.\n' + REAL_FOOTER + '\n\n   \n';
    expect(looksLikeCompleteDump(fullDump)).toBe(true);
  });
});
