const express = require('express');
const router = express.Router();
const controller = require('../controllers/payrollRecordsController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requirePayrollControl } = require('../middleware/payrollControls');

router.use(authenticate);

router.get('/payroll/record-controls', requirePermission('hr.payroll.view', 'hr.payroll.manage', 'hr.settings.manage'), controller.getControls);
router.put('/payroll/record-controls', requirePermission('hr.settings.manage'), controller.updateControls);

router.put(
  '/payroll-runs/:id',
  requirePermission('hr.payroll.edit'),
  requirePayrollControl('allow_record_edit', 'Editing payroll runs is turned off. Enable it under HR & Payroll > Settings.'),
  controller.updatePayrollRun
);
router.delete(
  '/payroll-runs/:id',
  requirePermission('hr.payroll.delete'),
  requirePayrollControl('allow_record_delete', 'Deleting payroll runs is turned off. Enable it under HR & Payroll > Settings.'),
  controller.deletePayrollRun
);

module.exports = router;
