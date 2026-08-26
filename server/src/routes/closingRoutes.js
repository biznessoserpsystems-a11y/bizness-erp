const express = require('express');
const router = express.Router();
const closingController = require('../controllers/closingController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.patch('/accounting/fiscal-periods/:id/close', requirePermission('accounting.closing.manage'), closingController.closeFiscalPeriod);
router.post('/accounting/year-end-close', requirePermission('accounting.closing.manage'), closingController.yearEndClose);

module.exports = router;
