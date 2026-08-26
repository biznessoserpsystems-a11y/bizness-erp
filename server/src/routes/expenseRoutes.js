const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/expense-entries', requirePermission('accounting.expenses.manage'), expenseController.listExpenseEntries);
router.post('/expense-entries', requirePermission('accounting.expenses.manage'), expenseController.createExpenseEntry);

module.exports = router;
