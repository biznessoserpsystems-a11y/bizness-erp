const express = require('express');
const router = express.Router();
const governanceController = require('../controllers/governanceController');
const { authenticate } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

router.use(authenticate);

// Same tighter rate limit as the other four suite pages' AI insights —
// a real, potentially billed external call, not an ordinary read.
const aiInsightsLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.get('/governance/ai-insights', aiInsightsLimiter, governanceController.getAiInsights);

module.exports = router;
