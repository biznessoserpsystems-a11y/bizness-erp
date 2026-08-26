const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/stock/movements', requirePermission('inventory.reports.view'), stockController.listMovements);
router.post('/stock/in', requirePermission('inventory.stock_in.create'), stockController.stockIn);
router.post('/stock/out', requirePermission('inventory.stock_out.create'), stockController.stockOut);
router.post('/stock/adjust', requirePermission('inventory.adjustments.manage'), stockController.adjustStock);
router.post('/stock/damage', requirePermission('inventory.damage.manage'), stockController.reportDamage);
router.get('/stock/damaged-goods', requirePermission('inventory.reports.view'), stockController.listDamagedGoods);

module.exports = router;
