const express = require('express');
const router = express.Router();
const statutoryComplianceController = require('../controllers/statutoryComplianceController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/statutory-compliance-status', requirePermission('system.compliance.manage'), statutoryComplianceController.getComplianceStatus);
router.patch('/statutory-compliance-items/:id', requirePermission('system.compliance.manage'), statutoryComplianceController.updateComplianceItem);

module.exports = router;
