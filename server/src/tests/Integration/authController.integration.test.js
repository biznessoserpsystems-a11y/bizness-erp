// Must be set before config/db (and anything that requires it) is
// loaded, since the pool reads DATABASE_URL once at module-load time.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/bizness_os_test';

const db = require('../../config/db');
const { registerCompany } = require('../../controllers/authController');
const { generateLicenseTokenString } = require('../../utils/licenseToken');

function mockReqRes(body) {
  const req = { body, ip: '127.0.0.1' };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return { req, res };
}

afterAll(async () => {
  await db.pool.end();
});

describe('registerCompany (integration, real Postgres) - permission grant on signup', () => {
  const testEmail = `audit-regression-${Date.now()}@example.com`;
  let issuedLicenseToken;

  afterEach(async () => {
    // Real cleanup against the real test database - company_id cascades
    // remove the role, role_permissions, and branch; the user is deleted
    // explicitly since it's looked up by email, not company_id, here.
    // The license token used to register isn't tied to the company by
    // a cascading delete (a token can outlive the company that used it,
    // by design - it's meant to cover up to 2), so it's cleaned up here
    // by the value this test itself generated and tracked.
    await db.query('DELETE FROM users WHERE email = $1', [testEmail]);
    await db.query(`DELETE FROM companies WHERE name = 'Audit Regression Co'`);
    if (issuedLicenseToken) {
      await db.query('DELETE FROM license_tokens WHERE token = $1', [issuedLicenseToken]);
      issuedLicenseToken = null;
    }
  });

  test(
    'grants every existing permission except system.backup.manage to the new Super Admin role - ' +
    'the fix for a real vulnerability where any new company automatically got an admin able to ' +
    'download or destroy every OTHER company\'s data, since backup/restore runs pg_dump/psql ' +
    'against the whole shared database, not scoped to one tenant',
    async () => {
      // Registration now requires a real, pre-existing license token -
      // generated directly here the same way the standalone CLI script
      // does, since there's deliberately no HTTP endpoint for this.
      issuedLicenseToken = generateLicenseTokenString();
      await db.query('INSERT INTO license_tokens (token) VALUES ($1)', [issuedLicenseToken]);

      const { req, res } = mockReqRes({
        companyName: 'Audit Regression Co',
        firstName: 'Audit', lastName: 'Regression',
        email: testEmail, password: 'StrongPass123',
        natureOfBusiness: 'Trading & Distribution',
        licenseToken: issuedLicenseToken,
      });

      await registerCompany(req, res, (err) => { if (err) throw err; });

      expect(res.statusCode).toBe(201);

      const { rows: grantedCodes } = await db.query(
        `SELECT p.code FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE r.company_id = (SELECT id FROM companies WHERE name = 'Audit Regression Co')
           AND r.name = 'Super Admin'`
      );
      const codes = grantedCodes.map((r) => r.code);

      expect(codes).not.toContain('system.backup.manage');

      const { rows: totalPerms } = await db.query('SELECT COUNT(*)::int AS n FROM permissions');
      // Every permission except the one deliberately excluded should
      // still be granted - this is the property that actually matters:
      // not just that backup.manage is missing, but that nothing else
      // was accidentally excluded along with it.
      expect(codes.length).toBe(totalPerms[0].n - 1);
    }
  );

  // The actual behavior change this was built for: a license token is
  // now required up front, not generated automatically when omitted.
  // Registration without one must fail cleanly, and - just as
  // importantly - must not leave a half-created company or a stray
  // auto-generated token behind from the attempt.
  test('registration without a license token is rejected, not silently given a new one', async () => {
    const { req, res } = mockReqRes({
      companyName: 'Audit Regression Co',
      firstName: 'Audit', lastName: 'Regression',
      email: testEmail, password: 'StrongPass123',
      natureOfBusiness: 'Trading & Distribution',
      // licenseToken deliberately omitted
    });

    let caughtError;
    await registerCompany(req, res, (err) => { caughtError = err; });

    expect(caughtError).toBeTruthy();
    expect(caughtError.message).toMatch(/licenseToken/i);

    const { rows } = await db.query(`SELECT id FROM companies WHERE name = 'Audit Regression Co'`);
    expect(rows).toHaveLength(0);
  });
});
