const express = require('express');
const router = express.Router();
const salesCrmController = require('../controllers/salesCrmController');
const { authenticate } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

router.use(authenticate);

// Same tighter rate limit as the other dashboard AI insights endpoints —
// a real, potentially billed external call, not an ordinary read.
const aiInsightsLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

// No single permission gates either — pipeline-summary reads leads,
// ai-insights reads leads and sales_invoices together, matching the same
// "no one blanket permission for a cross-source summary" pattern already
// used for Operations' and People's AI insights.
router.get('/sales-crm/pipeline-summary', salesCrmController.getPipelineSummary);
router.get('/sales-crm/ai-insights', aiInsightsLimiter, salesCrmController.getAiInsights);

module.exports = router;
