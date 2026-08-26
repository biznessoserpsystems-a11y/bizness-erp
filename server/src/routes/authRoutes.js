const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Slow down brute-force attempts against login specifically.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

// A tighter limit for genuinely sensitive, low-frequency actions — unlike
// general API traffic, nobody legitimately registers a company, requests
// a password reset, or submits an MFA code dozens of times in 15 minutes,
// so a much stricter cap here doesn't risk blocking real usage the way a
// tight limit on ordinary endpoints would.
const sensitiveActionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
// MFA codes are only 6 digits (1 in 1,000,000) — capped even tighter,
// since without this an attacker could feasibly brute-force a code
// within the app's normal-looking traffic pattern.
const mfaLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

router.post('/register-company', sensitiveActionLimiter, authController.registerCompany);
router.get('/nature-of-business-options', authController.listNatureOfBusinessOptions);
router.post('/login', loginLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/forgot-password', sensitiveActionLimiter, authController.forgotPassword);
router.post('/reset-password', sensitiveActionLimiter, authController.resetPassword);
router.post('/mfa/setup', authenticate, authController.setupMfa);
router.post('/mfa/enable', authenticate, mfaLimiter, authController.enableMfa);

module.exports = router;
