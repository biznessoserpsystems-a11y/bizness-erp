const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/roles', requirePermission('system.roles.manage'), roleController.listRoles);
router.post('/roles', requirePermission('system.roles.manage'), roleController.createRole);
router.patch('/roles/:id', requirePermission('system.roles.manage'), roleController.updateRole);
router.delete('/roles/:id', requirePermission('system.roles.manage'), roleController.deleteRole);
router.get('/permissions', requirePermission('system.roles.manage'), roleController.listPermissions);

module.exports = router;
