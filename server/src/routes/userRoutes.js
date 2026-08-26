const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/', requirePermission('system.users.manage'), userController.listUsers);
router.post('/', requirePermission('system.users.manage'), userController.createUser);
router.patch('/:id', requirePermission('system.users.manage'), userController.updateUser);
router.delete('/:id', requirePermission('system.users.manage'), userController.deactivateUser);

module.exports = router;
