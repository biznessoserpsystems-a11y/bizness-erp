const express = require('express');
const router = express.Router();
const cc = require('../controllers/complianceCalendarController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/compliance-calendar/summary', requirePermission('system.compliance.manage'), cc.getSummary);
router.get('/compliance-calendar/items', requirePermission('system.compliance.manage'), cc.listCalendarItems);
router.post('/compliance-calendar/items', requirePermission('system.compliance.manage'), cc.createCalendarItem);
router.patch('/compliance-calendar/items/:id', requirePermission('system.compliance.manage'), cc.updateCalendarItem);
router.delete('/compliance-calendar/items/:id', requirePermission('system.compliance.manage'), cc.deleteCalendarItem);
router.get('/compliance-calendar/items/:id/filings', requirePermission('system.compliance.manage'), cc.listFilings);
router.post('/compliance-calendar/items/:id/file', requirePermission('system.compliance.manage'), cc.markFiled);

module.exports = router;
