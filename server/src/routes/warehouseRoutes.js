const express = require('express');
const router = express.Router();
const warehouseController = require('../controllers/warehouseController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireInventoryControl } = require('../middleware/inventoryControls');

const editsAllowed = requireInventoryControl('allow_record_edit', 'Editing inventory records is turned off. Enable it under Inventory > Settings.');

router.use(authenticate);

router.get('/warehouses', warehouseController.listWarehouses);
router.post('/warehouses', requirePermission('inventory.warehouses.manage'), warehouseController.createWarehouse);
router.patch('/warehouses/:id', requirePermission('inventory.warehouses.manage'), editsAllowed, warehouseController.updateWarehouse);

router.get('/inventory/settings', requirePermission('inventory.settings.manage'), warehouseController.getInventorySettings);
router.put('/inventory/settings', requirePermission('inventory.settings.manage'), warehouseController.updateInventorySettings);

module.exports = router;
