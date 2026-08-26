const express = require('express');
const router = express.Router();
const operationsController = require('../controllers/operationsController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const rateLimit = require('express-rate-limit');

router.use(authenticate);

// AI insights is a real, billed external API call — rate limited more
// tightly than an ordinary read endpoint so a person can't accidentally
// (or otherwise) rack up API costs by refreshing it in a loop.
const aiInsightsLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.get('/operations/manufacturing-summary', requirePermission('manufacturing.reports.view'), operationsController.getManufacturingSummary);
// No single module permission gates this — it summarizes Inventory,
// Procurement, and Manufacturing data together, the same "no one blanket
// permission for a cross-module view" pattern the Executive Dashboard
// itself already uses (individual widgets check their own permission,
// nothing gates the whole page).
router.get('/operations/ai-insights', aiInsightsLimiter, operationsController.getAiInsights);

module.exports = router;
