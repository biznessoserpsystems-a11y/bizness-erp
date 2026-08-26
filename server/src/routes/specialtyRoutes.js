const express = require('express');
const router = express.Router();
const specialtyController = require('../controllers/specialtyController');
const { authenticate } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

router.use(authenticate);

// Same tighter rate limit as the other three suite pages' AI insights —
// a real, potentially billed external call, not an ordinary read.
const aiInsightsLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.get('/specialty/ai-insights', aiInsightsLimiter, specialtyController.getAiInsights);

module.exports = router;
