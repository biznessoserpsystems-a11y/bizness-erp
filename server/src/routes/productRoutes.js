const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireInventoryControl } = require('../middleware/inventoryControls');

const editsAllowed = requireInventoryControl('allow_record_edit', 'Editing inventory records is turned off. Enable it under Inventory > Settings.');

router.use(authenticate);

router.get('/products', productController.listProducts);
router.get('/products/sku-editing', productController.getSkuEditing);
router.get('/products/:id', productController.getProduct);
router.post('/products', requirePermission('inventory.products.manage'), productController.createProduct);
router.patch('/products/:id', requirePermission('inventory.products.manage'), editsAllowed, productController.updateProduct);
router.patch(
  '/products/:id/warehouse-settings/:warehouseId',
  requirePermission('inventory.products.manage'),
  productController.setWarehouseSettings
);

module.exports = router;
