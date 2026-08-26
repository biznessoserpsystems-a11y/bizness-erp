const express = require('express');
const router = express.Router();
const fp = require('../controllers/financialPeriodController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/financial-years', fp.listFinancialYears);
router.post('/financial-years', requirePermission('system.financial_periods.manage'), fp.createFinancialYear);
router.patch('/financial-years/:id/status', requirePermission('system.financial_periods.manage'), fp.updateFinancialYearStatus);
router.patch('/fiscal-periods/:id/status', requirePermission('system.financial_periods.manage'), fp.updateFiscalPeriodStatus);

module.exports = router;
