const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/products', productController.listProducts);
router.get('/products/:id', productController.getProduct);
router.post('/products', requirePermission('inventory.products.manage'), productController.createProduct);
router.patch('/products/:id', requirePermission('inventory.products.manage'), productController.updateProduct);
router.patch(
  '/products/:id/warehouse-settings/:warehouseId',
  requirePermission('inventory.products.manage'),
  productController.setWarehouseSettings
);

module.exports = router;
