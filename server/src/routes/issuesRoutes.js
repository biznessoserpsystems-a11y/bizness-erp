const express = require('express');
const router = express.Router();
const issuesController = require('../controllers/issuesController');
const { authenticate } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

router.use(authenticate);

// Same tighter rate limit as every other AI endpoint in this app — a
// real, potentially billed external call, not an ordinary read.
const aiExplainLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

router.post('/issues/explain', aiExplainLimiter, issuesController.explainIssue);

module.exports = router;
