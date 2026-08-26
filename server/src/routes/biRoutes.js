const express = require('express');
const router = express.Router();
const biController = require('../controllers/biController');
const { authenticate } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

router.use(authenticate);

// No BI-specific permission — every endpoint here is gated inside the
// controller itself, against whichever *.reports.view permission the
// requested data source actually requires (see biRegistry.js). A person
// can only ever build a report from data they could already see through
// some existing report in this app.
router.get('/bi/data-sources', biController.listDataSources);
router.post('/bi/run', biController.runReport);

router.get('/bi/saved-reports', biController.listSavedReports);
router.post('/bi/saved-reports', biController.createSavedReport);
router.get('/bi/saved-reports/:id/run', biController.runSavedReport);
router.delete('/bi/saved-reports/:id', biController.deleteSavedReport);

// Same tighter rate limit as every other AI endpoint in this app — a
// real, potentially billed external call, not an ordinary read.
const aiExplainLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
router.post('/bi/explain', aiExplainLimiter, biController.explainReport);

// No rate limit here — unlike /bi/explain, this never calls any
// external API; it's local PDF/Excel/Word generation from data the
// person already has on screen, the same as every other report's
// export in this app.
router.post('/bi/export', biController.exportReport);

module.exports = router;
