const express = require('express');
const router = express.Router();
const performance = require('../controllers/performanceController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

// KPIs — viewable by anyone, managed by hr.performance.manage
router.get('/kpis', performance.listKpis);
router.post('/kpis', requirePermission('hr.performance.manage'), performance.createKpi);
router.patch('/kpis/:id', requirePermission('hr.performance.manage'), performance.updateKpi);

// Review cycles — viewable by anyone, managed by hr.performance.manage
router.get('/performance-cycles', performance.listCycles);
router.post('/performance-cycles', requirePermission('hr.performance.manage'), performance.createCycle);
router.patch('/performance-cycles/:id', requirePermission('hr.performance.manage'), performance.updateCycle);

// Goals — self/manager/hr.performance.manage access enforced in the controller
router.get('/employees/:id/goals', performance.listGoals);
router.post('/employees/:id/goals', performance.createGoal);
router.patch('/goals/:id', performance.updateGoal);

// Reviews — self/manager/peer/hr.performance.manage access enforced in the controller
router.get('/employees/:id/performance-reviews', performance.listReviewsForEmployee);
router.post('/employees/:id/performance-reviews', performance.createReview);
router.patch('/performance-reviews/:id', performance.updateReview);

// Reports
router.get('/hr-reports/performance-summary', requirePermission('hr.performance.manage'), performance.getPerformanceSummary);

module.exports = router;
