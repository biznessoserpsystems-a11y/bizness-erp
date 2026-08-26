const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const communicationLogController = require('../controllers/communicationLogController');
const announcementController = require('../controllers/announcementController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

// Personal notification feed — no permission gate, scoped to req.user.id.
router.get('/notifications', notificationController.listNotifications);
router.get('/notifications/alerts', notificationController.getAlerts);
router.patch('/notifications/:id/read', notificationController.markRead);
router.post('/notifications/mark-all-read', notificationController.markAllRead);

// Customer/supplier communication log — permission is checked per-record inside the
// controller (sales.customers.manage vs procurement.suppliers.manage), since it depends
// on relatedType, not a single fixed permission for the whole route.
router.get('/communication-logs', communicationLogController.listCommunicationLogs);
router.post('/communication-logs', communicationLogController.createCommunicationLog);
router.delete('/communication-logs/:id', communicationLogController.deleteCommunicationLog);

// Announcements — visible to everyone, posting requires a dedicated permission.
router.get('/announcements', announcementController.listAnnouncements);
router.post('/announcements', requirePermission('communications.announcements.manage'), announcementController.createAnnouncement);
router.delete('/announcements/:id', requirePermission('communications.announcements.manage'), announcementController.deleteAnnouncement);

module.exports = router;
