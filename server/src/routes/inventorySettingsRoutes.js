const express = require('express');
const router = express.Router();
const inventorySettingsController = require('../controllers/inventorySettingsController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/inventory/settings', requirePermission('inventory.settings.manage'), inventorySettingsController.getInventorySettings);
router.put('/inventory/settings', requirePermission('inventory.settings.manage'), inventorySettingsController.updateInventorySettings);

module.exports = router;
