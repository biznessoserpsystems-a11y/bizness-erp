const { authenticator } = require('otplib');
const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { hashPassword, comparePassword, isStrongPassword, hashToken, generateRandomToken } = require('../utils/password');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { recordAudit } = require('../middleware/auditLog');
const { ipMatchesAllowlist } = require('../utils/ipAllowlist');
const accountingService = require('../services/accountingService');
const payrollService = require('../services/payrollService');
const schoolAccountingService = require('../services/schoolAccountingService');

const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10);
const LOCK_MINUTES = parseInt(process.env.LOCK_MINUTES || '15', 10);

// The refresh token now lives in an httpOnly cookie rather than
// localStorage or the JSON response body — JavaScript (including any
// injected via a future XSS bug) can never read it via document.cookie
// or any DOM API, unlike the old approach where a single injected script
// could exfiltrate a 7-day-lived credential outright. Scoped to
// /api/auth specifically (not sent on every API request) since only the
// refresh and logout endpoints ever need it.
function refreshCookieOptions(rememberMe) {
  const isProduction = process.env.NODE_ENV === 'production';
  // Cross-site deployments — frontend and backend on genuinely different
  // domains, e.g. GitHub Pages serving the frontend with the API on a
  // separate host — need SameSite=None for the browser to send this
  // cookie on the frontend's own legitimate calls at all. SameSite=Strict
  // silently drops it on every cross-site request, including the
  // frontend's own fetch() calls, breaking the silent-login-refresh flow
  // entirely rather than intermittently. SameSite=None is only ever
  // valid together with Secure=true (browsers reject it outright
  // otherwise), so the two are always forced on together here — and
  // only when COOKIE_CROSS_SITE is explicitly set, since same-domain
  // deployments are strictly safer with Strict and shouldn't lose that
  // protection by default just because this feature exists for the
  // deployments that genuinely need it.
  const crossSite = process.env.COOKIE_CROSS_SITE === 'true';
  const options = {
    httpOnly: true,
    secure: isProduction || crossSite,
    sameSite: crossSite ? 'none' : 'strict',
    path: '/api/auth',
  };
  // "Remember me" unchecked: no maxAge at all, making this a genuine
  // session cookie the browser discards when it closes — the person is
  // signed out next time they open the browser, even though the
  // underlying refresh token itself is still validly signed for 7 days
  // server-side (see JWT_REFRESH_EXPIRES). Checked: the same 7-day
  // persistent cookie this always used to set.
  if (rememberMe) options.maxAge = 7 * 24 * 60 * 60 * 1000; // matches the 7-day user_sessions expiry below
  return options;
}

// The canonical Nature of Business list, straight from the source document
// provided — 28 real categories. The source itself numbers 1 through 29
// but genuinely has no item 9 (a gap in the original, not something lost in
// transcription — confirmed against the source PDF directly), so this list
// is intentionally 28 long even though the last label is "29."
const NATURE_OF_BUSINESS_OPTIONS = [
  'Trading & Distribution', 'Manufacturing Industries', 'Construction & Engineering',
  'Professional Services', 'Educational Institutions', 'Healthcare', 'Hospitality',
  'Transport & Logistics', 'Agriculture', 'Mining & Natural Resources',
  'Non-Profit Organizations', 'Religious Organizations', 'Government & Public Sector',
  'Real Estate', 'Media & Entertainment', 'Telecommunications', 'Automotive',
  'Energy & Utilities', 'Security Services', 'Beauty & Lifestyle', 'Sports & Recreation',
  'Travel & Tourism', 'E-Commerce & Digital Businesses', 'Rental & Leasing',
  'Import & Export', 'Cooperatives', 'Multi-Business Groups', 'Special Industry Solutions',
];

// POST /auth/register-company
// Bootstraps a brand-new company + its first Super Admin user.
const registerCompany = asyncHandler(async (req, res) => {
  const { companyName, firstName, lastName, email, password, natureOfBusiness, licenseToken } = req.body;

  if (!companyName || !firstName || !lastName || !email || !password || !natureOfBusiness || !licenseToken) {
    throw new ApiError(400, 'companyName, firstName, lastName, email, password, natureOfBusiness, and licenseToken are required');
  }
  if (!NATURE_OF_BUSINESS_OPTIONS.includes(natureOfBusiness)) {
    throw new ApiError(400, `natureOfBusiness must be one of the provided options`);
  }
  if (!isStrongPassword(password)) {
    throw new ApiError(400, 'Password must be 8+ characters with upper, lower, and a number');
  }
  // A license token is required for every registration — see the CLI
  // script at scripts/generateLicenseToken.js for how one gets issued
  // in the first place, since this is deliberately the only path to a
  // new token now. Format-checked here (16 uppercase letters/digits, a
  // real one this system actually generated) before ever touching the
  // database, since a malformed value is almost certainly a copy-paste
  // mistake worth catching immediately rather than a generic "not
  // found" further down.
  if (!/^[A-Z0-9]{16}$/.test(licenseToken)) {
    throw new ApiError(400, 'licenseToken must be 16 uppercase letters/digits');
  }

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length) throw new ApiError(409, 'A user with this email already exists');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Row-locked for the rest of this transaction — without this, two
    // registrations submitted at nearly the same moment against the
    // same token could each independently see "1 company using this
    // token so far" and both proceed, landing on 3 companies under a
    // token meant for at most 2. The lock makes the second
    // registration in any such race genuinely wait for the first to
    // finish (and its company count to become visible) before it's
    // allowed to check anything at all.
    const tokenResult = await client.query('SELECT id FROM license_tokens WHERE token = $1 FOR UPDATE', [licenseToken]);
    if (!tokenResult.rows.length) throw new ApiError(400, 'That license token was not found');
    const licenseTokenId = tokenResult.rows[0].id;
    const countResult = await client.query('SELECT COUNT(*)::int AS count FROM companies WHERE license_token_id = $1', [licenseTokenId]);
    if (countResult.rows[0].count >= 2) {
      throw new ApiError(400, 'That license token is already in use by 2 companies — one token covers at most 2');
    }
    const resolvedLicenseToken = licenseToken;

    const companyResult = await client.query(
      `INSERT INTO companies (name, base_currency, nature_of_business, license_token_id) VALUES ($1, 'GHS', $2, $3) RETURNING id`,
      [companyName, natureOfBusiness || null, licenseTokenId]
    );
    const companyId = companyResult.rows[0].id;

    await client.query(
      `INSERT INTO branches (company_id, name, code, is_head_office) VALUES ($1, 'Head Office', 'HQ', TRUE)`,
      [companyId]
    );

    const roleResult = await client.query(
      `INSERT INTO roles (company_id, name, description, is_system_role)
       VALUES ($1, 'Super Admin', 'Full system access', TRUE) RETURNING id`,
      [companyId]
    );
    const roleId = roleResult.rows[0].id;

    // Every permission except system.backup.manage is granted here.
    // Backup/restore runs pg_dump/psql against the whole, shared
    // DATABASE_URL — not scoped to this or any one company — so
    // granting it by default would mean every company that has ever
    // registered automatically has a Super Admin who can download
    // every OTHER company's data, or restore a file that replaces
    // every tenant's data on the entire platform. This is exactly
    // the opt-in the permission's own migration (036_backup_restore.sql)
    // already documented as the intent — this is what actually
    // implements it. A company that genuinely wants this must grant it
    // deliberately afterward, under Settings → Roles & Permissions.
    const allPerms = await client.query(
      `SELECT id FROM permissions WHERE code != 'system.backup.manage'`
    );
    for (const p of allPerms.rows) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleId, p.id]
      );
    }

    const passwordHash = await hashPassword(password);
    const userResult = await client.query(
      `INSERT INTO users (company_id, first_name, last_name, email, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [companyId, firstName, lastName, email.toLowerCase(), passwordHash]
    );
    const userId = userResult.rows[0].id;

    await client.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [userId, roleId]);

    await accountingService.seedDefaultChartOfAccounts(client, companyId);
    await payrollService.seedCompanyPayrollDefaults(client, companyId);
    await schoolAccountingService.seedSchoolChartOfAccounts(client, companyId);

    await client.query('COMMIT');

    await recordAudit({
      companyId,
      userId,
      action: 'CREATE',
      entityType: 'company',
      entityId: companyId,
      newValues: { companyName },
      ip: req.ip,
    });

    res.status(201).json({
      message: 'Company and admin account created. Please log in.',
      licenseToken: resolvedLicenseToken,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password, mfaToken, rememberMe } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email and password are required');

  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  const user = rows[0];

  // Deliberately vague error to avoid leaking which part was wrong.
  const invalidCreds = () => new ApiError(401, 'Invalid email or password');

  if (!user) throw invalidCreds();
  if (!user.is_active) throw new ApiError(403, 'Account is deactivated. Contact your administrator.');
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new ApiError(423, `Account locked. Try again after ${new Date(user.locked_until).toLocaleTimeString()}`);
  }

  const validPassword = await comparePassword(password, user.password_hash);
  if (!validPassword) {
    const attempts = (user.failed_login_attempts || 0) + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    await db.query(
      `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
      [locked ? 0 : attempts, locked ? new Date(Date.now() + LOCK_MINUTES * 60000) : null, user.id]
    );
    throw invalidCreds();
  }

  if (user.mfa_enabled) {
    if (!mfaToken) {
      return res.status(206).json({ mfaRequired: true, message: 'Enter your MFA code to continue' });
    }
    const validMfa = authenticator.check(mfaToken, user.mfa_secret);
    if (!validMfa) throw new ApiError(401, 'Invalid MFA code');
  }

  // Checked after identity is fully verified (password + MFA), before
  // any token is issued — this is an authorization check, not part of
  // proving who someone is. A blocked attempt is deliberately not
  // treated as a successful login: failed_login_attempts isn't reset,
  // no session row or refresh cookie is created, and the audit trail
  // records the block itself (genuinely useful security signal for an
  // admin — "who tried to log in from an unrecognized location") rather
  // than a generic LOGIN entry that would look identical to a real one.
  const companyResult = await db.query('SELECT ip_restriction_enabled FROM companies WHERE id = $1', [user.company_id]);
  if (companyResult.rows[0]?.ip_restriction_enabled) {
    const rulesResult = await db.query('SELECT cidr FROM ip_allowlist_rules WHERE company_id = $1', [user.company_id]);
    const allowed = ipMatchesAllowlist(req.ip, rulesResult.rows.map((r) => r.cidr));
    if (!allowed) {
      await recordAudit({ companyId: user.company_id, userId: user.id, action: 'LOGIN_BLOCKED_IP', entityType: 'user', entityId: user.id, ip: req.ip });
      throw new ApiError(403, 'Sign-in is not allowed from this network. Contact your administrator.');
    }
  }

  await db.query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1`,
    [user.id]
  );

  const accessToken = signAccessToken({ sub: user.id, companyId: user.company_id });
  const refreshToken = signRefreshToken({ sub: user.id });

  await db.query(
    `INSERT INTO user_sessions (user_id, refresh_token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
    [user.id, hashToken(refreshToken), req.ip, req.headers['user-agent'] || null]
  );

  await recordAudit({ companyId: user.company_id, userId: user.id, action: 'LOGIN', entityType: 'user', entityId: user.id, ip: req.ip });

  res.cookie('refreshToken', refreshToken, refreshCookieOptions(rememberMe));
  res.json({
    accessToken,
    user: {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      companyId: user.company_id,
    },
  });
});

// POST /auth/refresh
const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) throw new ApiError(400, 'No refresh token cookie present');

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const tokenHash = hashToken(refreshToken);
  const { rows } = await db.query(
    `SELECT * FROM user_sessions WHERE user_id = $1 AND refresh_token_hash = $2 AND revoked_at IS NULL AND expires_at > NOW()`,
    [decoded.sub, tokenHash]
  );
  if (!rows.length) throw new ApiError(401, 'Session not found or has been revoked');

  const userResult = await db.query('SELECT id, company_id FROM users WHERE id = $1', [decoded.sub]);
  const user = userResult.rows[0];
  if (!user) throw new ApiError(401, 'User no longer exists');

  const accessToken = signAccessToken({ sub: user.id, companyId: user.company_id });
  res.json({ accessToken });
});

// POST /auth/logout
const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) {
    await db.query(
      `UPDATE user_sessions SET revoked_at = NOW() WHERE refresh_token_hash = $1`,
      [hashToken(refreshToken)]
    );
  }
  res.clearCookie('refreshToken', {
    path: '/api/auth',
    // Must match the attributes the cookie was actually set with
    // (refreshCookieOptions above) - a mismatch, particularly on
    // sameSite, can mean the browser doesn't recognize this as clearing
    // the same cookie and silently leaves the original in place.
    secure: refreshCookieOptions().secure,
    sameSite: refreshCookieOptions().sameSite,
  });
  res.json({ message: 'Logged out' });
});

// POST /auth/forgot-password
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, 'Email is required');

  const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  // Always respond the same way whether or not the account exists.
  if (rows.length) {
    const rawToken = generateRandomToken();
    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [rows[0].id, hashToken(rawToken)]
    );
    // In production this would be emailed, never returned in the API response.
    console.log(`[dev-only] Password reset token for ${email}: ${rawToken}`);
  }
  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

// POST /auth/reset-password
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) throw new ApiError(400, 'token and newPassword are required');
  if (!isStrongPassword(newPassword)) throw new ApiError(400, 'Password must be 8+ characters with upper, lower, and a number');

  const tokenHash = hashToken(token);
  const { rows } = await db.query(
    `SELECT * FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [tokenHash]
  );
  if (!rows.length) throw new ApiError(400, 'Invalid or expired reset token');

  const record = rows[0];
  const passwordHash = await hashPassword(newPassword);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, record.user_id]);
  await db.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [record.id]);
  await db.query(`UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [record.user_id]);

  res.json({ message: 'Password has been reset. Please log in again.' });
});

// POST /auth/mfa/setup  (authenticated)
const setupMfa = asyncHandler(async (req, res) => {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(req.user.email, 'Bizness-OS', secret);
  await db.query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [secret, req.user.id]);
  res.json({ otpauth, secret, message: 'Scan the QR/otpauth URL in your authenticator app, then confirm with /auth/mfa/enable' });
});

// POST /auth/mfa/enable  (authenticated)
const enableMfa = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const { rows } = await db.query('SELECT mfa_secret FROM users WHERE id = $1', [req.user.id]);
  const secret = rows[0]?.mfa_secret;
  if (!secret) throw new ApiError(400, 'Call /auth/mfa/setup first');
  if (!authenticator.check(token, secret)) throw new ApiError(400, 'Invalid MFA code');

  await db.query('UPDATE users SET mfa_enabled = TRUE WHERE id = $1', [req.user.id]);
  res.json({ message: 'MFA enabled' });
});

// GET /auth/nature-of-business-options — unauthenticated on purpose, since
// the Register page needs this list before anyone has logged in.
const listNatureOfBusinessOptions = (req, res) => {
  res.json(NATURE_OF_BUSINESS_OPTIONS);
};

module.exports = {
  registerCompany,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  setupMfa,
  enableMfa,
  NATURE_OF_BUSINESS_OPTIONS,
  listNatureOfBusinessOptions,
  refreshCookieOptions,
};
