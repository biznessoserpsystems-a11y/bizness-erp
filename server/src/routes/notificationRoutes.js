const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/notifications', requirePermission('system.notifications.view'), notificationController.listNotifications);
router.get('/notifications/unread-count', requirePermission('system.notifications.view'), notificationController.unreadCount);
router.patch('/notifications/:id/read', requirePermission('system.notifications.view'), notificationController.markRead);
router.post('/notifications/mark-all-read', requirePermission('system.notifications.view'), notificationController.markAllRead);
router.post('/notifications/scan', requirePermission('system.notifications.view'), notificationController.rescan);

module.exports = router;
