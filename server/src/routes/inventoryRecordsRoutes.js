const express = require('express');
const router = express.Router();
const controller = require('../controllers/inventoryRecordsController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireInventoryControl } = require('../middleware/inventoryControls');

router.use(authenticate);

const canDelete = [
  requirePermission('inventory.records.delete'),
  requireInventoryControl('allow_record_delete', 'Deleting inventory records is turned off. Enable it under Inventory > Settings.'),
];

router.get('/inventory/record-controls', requirePermission(
  'inventory.products.manage', 'inventory.warehouses.manage', 'inventory.settings.manage', 'inventory.records.delete'
), controller.getControls);

router.delete('/products/:id', ...canDelete, controller.deleteProduct);
router.delete('/brands/:id', ...canDelete, controller.deleteBrand);
router.delete('/product-categories/:id', ...canDelete, controller.deleteCategory);
router.delete('/warehouses/:id', ...canDelete, controller.deleteWarehouse);

module.exports = router;
