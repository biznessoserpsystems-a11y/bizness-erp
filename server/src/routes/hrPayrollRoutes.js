const express = require('express');
const router = express.Router();
const hr = require('../controllers/hrPayrollController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

// Employees
router.get('/employees', hr.listEmployees);
router.get('/employees/:employeeId/contract-terms', requirePermission('hr.contract_terms.manage'), hr.listContractTerms);
router.post('/employees/:employeeId/contract-terms', requirePermission('hr.contract_terms.manage'), hr.createContractTerm);
router.patch('/employees/:employeeId/contract-terms/:id', requirePermission('hr.contract_terms.manage'), hr.updateContractTerm);
router.delete('/employees/:employeeId/contract-terms/:id', requirePermission('hr.contract_terms.manage'), hr.deleteContractTerm);
router.get('/employees/:id', hr.getEmployee);
router.get('/employees/:id/history', hr.getEmployeeHistory);

// Onboarding
router.get('/employees/:id/onboarding', hr.getOnboarding);
router.patch('/onboarding-steps/:id', hr.updateOnboardingStep);

// Equipment allocation
router.get('/employees/:id/asset-assignments', hr.listAssetAssignments);
router.post('/employees/:id/asset-assignments', requirePermission('assets.register.manage'), hr.createAssetAssignment);
router.post('/asset-assignments/:id/return', requirePermission('assets.register.manage'), hr.returnAssetAssignment);

// System account creation
router.post('/employees/:id/create-account', requirePermission('system.users.manage'), hr.createEmployeeAccount);
router.post('/employees', requirePermission('hr.employees.manage'), hr.createEmployee);
router.patch('/employees/:id', requirePermission('hr.employees.manage'), hr.updateEmployee);
router.post('/employees/:id/terminate', requirePermission('hr.employees.manage'), hr.terminateEmployee);

// Shifts
router.get('/shifts', hr.listShifts);
router.post('/shifts', requirePermission('hr.shifts.manage'), hr.createShift);
router.patch('/shifts/:id', requirePermission('hr.shifts.manage'), hr.updateShift);

// Attendance
router.get('/attendance', hr.listAttendance);
router.post('/attendance/clock-in', hr.clockIn);
router.post('/attendance/clock-out', hr.clockOut);
router.get('/attendance/me/today', hr.getMyAttendanceToday);
router.post('/attendance', requirePermission('hr.attendance.manage'), hr.recordAttendance);
router.patch('/attendance/:id', requirePermission('hr.attendance.manage'), hr.updateAttendance);

// HR reports
router.get('/hr-reports/attendance-summary', requirePermission('hr.reports.view'), hr.getAttendanceSummary);

// Leave types
router.get('/leave-types', hr.listLeaveTypes);
router.post('/leave-types', requirePermission('hr.leave.manage'), hr.createLeaveType);

// Leave requests
router.get('/leave-requests', hr.listLeaveRequests);
router.post('/leave-requests', hr.createLeaveRequest);
router.patch('/leave-requests/:id/status', requirePermission('hr.leave.approve'), hr.updateLeaveRequestStatus);

// Payroll
router.get('/payroll-runs', requirePermission('hr.payroll.view'), hr.listPayrollRuns);
router.get('/payroll-runs/auto-run-settings', requirePermission('hr.payroll.manage'), hr.getPayrollAutoRunSettings);
router.put('/payroll-runs/auto-run-settings', requirePermission('hr.payroll.manage'), hr.updatePayrollAutoRunSettings);
router.get('/payroll-runs/:id', requirePermission('hr.payroll.view'), hr.getPayrollRun);
router.post('/payroll-runs', requirePermission('hr.payroll.manage'), hr.createPayrollRun);
router.post('/payroll-runs/:id/process', requirePermission('hr.payroll.manage'), hr.processPayrollRun);
router.post('/payroll-runs/:id/mark-paid', requirePermission('hr.payroll.manage'), hr.markPayrollRunPaid);

// Statutory configuration (SSNIT rates + PAYE bands)
router.get('/payroll-settings', requirePermission('hr.payroll.view'), hr.getPayrollSettings);
router.patch('/payroll-settings', requirePermission('hr.settings.manage'), hr.updatePayrollSettings);
router.put('/paye-bands', requirePermission('hr.settings.manage'), hr.replacePayeBands);

module.exports = router;
