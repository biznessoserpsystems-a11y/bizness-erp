const express = require('express');
const router = express.Router();
const hrReportController = require('../controllers/hrReportController');
const hrHighlightsController = require('../controllers/hrHighlightsController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/hr-reports/headcount-summary', requirePermission('hr.reports.view'), hrReportController.headcountSummary);
router.get('/hr-reports/payroll-cost-trend', requirePermission('hr.reports.view'), hrReportController.payrollCostTrend);
router.get('/hr-reports/attendance-by-department', requirePermission('hr.reports.view'), hrReportController.attendanceByDepartment);
router.get('/hr-reports/hr-highlights', requirePermission('hr.reports.view'), hrHighlightsController.hrHighlights);

module.exports = router;
