const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/audit-logs', requirePermission('system.audit.view'), auditController.listAuditLogs);
router.get('/activity-logs', requirePermission('system.audit.view'), auditController.listActivityLogs);

module.exports = router;
