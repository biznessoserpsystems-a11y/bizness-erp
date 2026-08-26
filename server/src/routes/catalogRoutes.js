const express = require('express');
const router = express.Router();
const catalog = require('../controllers/catalogController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/uom', catalog.listUom);
router.post('/uom', requirePermission('inventory.products.manage'), catalog.createUom);
router.patch('/uom/:id', requirePermission('inventory.products.manage'), catalog.updateUom);

router.get('/brands', catalog.listBrands);
router.post('/brands', requirePermission('inventory.products.manage'), catalog.createBrand);
router.patch('/brands/:id', requirePermission('inventory.products.manage'), catalog.updateBrand);

router.get('/product-categories', catalog.listCategories);
router.post('/product-categories', requirePermission('inventory.products.manage'), catalog.createCategory);
router.patch('/product-categories/:id', requirePermission('inventory.products.manage'), catalog.updateCategory);

module.exports = router;
