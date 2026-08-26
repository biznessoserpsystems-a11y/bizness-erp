const express = require('express');
const router = express.Router();
const accessControlController = require('../controllers/accessControlController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);
router.use(requirePermission('system.access_control.manage'));

router.get('/access-control/sessions', accessControlController.listSessions);
router.delete('/access-control/sessions/:id', accessControlController.revokeSession);

router.get('/access-control/ip-rules', accessControlController.listIpRules);
router.post('/access-control/ip-rules', accessControlController.createIpRule);
router.delete('/access-control/ip-rules/:id', accessControlController.deleteIpRule);
router.patch('/access-control/ip-restriction', accessControlController.setIpRestrictionEnabled);

module.exports = router;
