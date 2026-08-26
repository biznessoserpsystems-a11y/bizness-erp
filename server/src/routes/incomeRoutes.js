const express = require('express');
const router = express.Router();
const incomeController = require('../controllers/incomeController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/income-entries', requirePermission('accounting.income.manage'), incomeController.listIncomeEntries);
router.post('/income-entries', requirePermission('accounting.income.manage'), incomeController.createIncomeEntry);

module.exports = router;
