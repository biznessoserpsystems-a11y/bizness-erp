const originalEnv = { ...process.env };

function withEnv(vars, fn) {
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    process.env = { ...originalEnv };
  }
}

describe('refreshCookieOptions', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  test('defaults to SameSite=Strict when COOKIE_CROSS_SITE is not set', () => {
    withEnv({ NODE_ENV: 'development' }, () => {
      delete process.env.COOKIE_CROSS_SITE;
      jest.resetModules();
      const { refreshCookieOptions } = require('../controllers/authController');
      expect(refreshCookieOptions().sameSite).toBe('strict');
    });
  });

  test('a same-domain (default) deployment does not set Secure in development', () => {
    withEnv({ NODE_ENV: 'development' }, () => {
      delete process.env.COOKIE_CROSS_SITE;
      jest.resetModules();
      const { refreshCookieOptions } = require('../controllers/authController');
      expect(refreshCookieOptions().secure).toBe(false);
    });
  });

  // The real constraint this configuration exists to satisfy: browsers
  // reject a SameSite=None cookie outright unless Secure is also true.
  // Setting one without the other isn't a lesser version of the
  // feature, it's a cookie that silently never gets set at all.
  test('COOKIE_CROSS_SITE=true always forces Secure=true alongside SameSite=None, even outside production', () => {
    withEnv({ NODE_ENV: 'development', COOKIE_CROSS_SITE: 'true' }, () => {
      jest.resetModules();
      const { refreshCookieOptions } = require('../controllers/authController');
      const options = refreshCookieOptions();
      expect(options.sameSite).toBe('none');
      expect(options.secure).toBe(true);
    });
  });

  test('production alone (no cross-site) still uses Strict, not None', () => {
    withEnv({ NODE_ENV: 'production' }, () => {
      delete process.env.COOKIE_CROSS_SITE;
      jest.resetModules();
      const { refreshCookieOptions } = require('../controllers/authController');
      const options = refreshCookieOptions();
      expect(options.sameSite).toBe('strict');
      expect(options.secure).toBe(true);
    });
  });

  test('a literal string "false" for COOKIE_CROSS_SITE does not enable cross-site mode', () => {
    withEnv({ NODE_ENV: 'development', COOKIE_CROSS_SITE: 'false' }, () => {
      jest.resetModules();
      const { refreshCookieOptions } = require('../controllers/authController');
      expect(refreshCookieOptions().sameSite).toBe('strict');
    });
  });

  test('httpOnly and the /api/auth path are always set, regardless of cross-site mode', () => {
    withEnv({ NODE_ENV: 'development', COOKIE_CROSS_SITE: 'true' }, () => {
      jest.resetModules();
      const { refreshCookieOptions } = require('../controllers/authController');
      const options = refreshCookieOptions();
      expect(options.httpOnly).toBe(true);
      expect(options.path).toBe('/api/auth');
    });
  });

  test('rememberMe adds a 7-day maxAge; without it, the cookie has none (a real session cookie)', () => {
    withEnv({ NODE_ENV: 'development' }, () => {
      jest.resetModules();
      const { refreshCookieOptions } = require('../controllers/authController');
      expect(refreshCookieOptions(true).maxAge).toBe(7 * 24 * 60 * 60 * 1000);
      expect(refreshCookieOptions(false).maxAge).toBeUndefined();
    });
  });
});
