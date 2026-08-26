const express = require('express');
const router = express.Router();
const journalController = require('../controllers/journalController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/journal-entries', requirePermission('accounting.ledger.view', 'accounting.journal.manage'), journalController.listEntries);
router.get('/journal-entries/:id', requirePermission('accounting.ledger.view', 'accounting.journal.manage'), journalController.getEntry);
router.post('/journal-entries', requirePermission('accounting.journal.manage'), journalController.createEntry);
router.post('/journal-entries/:id/reverse', requirePermission('accounting.journal.manage'), journalController.reverseEntry);

module.exports = router;
