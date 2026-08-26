const express = require('express');
const router = express.Router();
const ess = require('../controllers/essController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/me/employee', ess.getMyEmployee);
router.get('/me/payslips', ess.getMyPayslips);
router.get('/me/leave-balance', ess.getMyLeaveBalance);

router.get('/timesheets', ess.listTimesheets);
router.post('/timesheets', ess.createTimesheet);
router.patch('/timesheets/:id/status', requirePermission('hr.timesheets.manage'), ess.updateTimesheetStatus);

router.get('/loans', ess.listLoans);
router.post('/loans', ess.createLoanRequest);
router.patch('/loans/:id/status', requirePermission('hr.loans.manage'), ess.updateLoanStatus);
router.post('/loans/:id/repayment', requirePermission('hr.loans.manage'), ess.recordLoanRepayment);

module.exports = router;
