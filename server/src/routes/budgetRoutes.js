const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/budgetController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

const BUDGET_PERMS = ['accounting.budgets.manage', 'procurement.budget.manage', 'sales.budget.manage'];

router.get('/budgets', requirePermission(...BUDGET_PERMS), budgetController.listBudgets);
router.get('/budgets/:id', requirePermission(...BUDGET_PERMS), budgetController.getBudget);
router.post('/budgets', requirePermission('accounting.budgets.manage'), budgetController.createBudget);
router.patch('/budgets/:id/status', requirePermission('accounting.budgets.manage'), budgetController.updateBudgetStatus);
router.get('/budgets/:id/vs-actual', requirePermission(...BUDGET_PERMS), budgetController.budgetVsActual);
router.post('/budgets/:id/lines', requirePermission(...BUDGET_PERMS), budgetController.addBudgetLine);
router.patch('/budgets/:id/lines/:lineId', requirePermission(...BUDGET_PERMS), budgetController.updateBudgetLine);

module.exports = router;
