const express = require('express');
const router = express.Router();
const catalog = require('../controllers/catalogController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireInventoryControl } = require('../middleware/inventoryControls');

const editsAllowed = requireInventoryControl('allow_record_edit', 'Editing inventory records is turned off. Enable it under Inventory > Settings.');

router.use(authenticate);

router.get('/uom', catalog.listUom);
router.post('/uom', requirePermission('inventory.products.manage'), catalog.createUom);
router.patch('/uom/:id', requirePermission('inventory.products.manage'), catalog.updateUom);

router.get('/brands', catalog.listBrands);
router.post('/brands', requirePermission('inventory.products.manage'), catalog.createBrand);
router.patch('/brands/:id', requirePermission('inventory.products.manage'), editsAllowed, catalog.updateBrand);

router.get('/product-categories', catalog.listCategories);
router.post('/product-categories', requirePermission('inventory.products.manage'), catalog.createCategory);
router.patch('/product-categories/:id', requirePermission('inventory.products.manage'), editsAllowed, catalog.updateCategory);

module.exports = router;
