const express = require('express');
const router = express.Router();
const countController = require('../controllers/inventoryCountController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/inventory-counts', requirePermission('inventory.counts.manage'), countController.listCounts);
router.get('/inventory-counts/:id', requirePermission('inventory.counts.manage'), countController.getCount);
router.post('/inventory-counts', requirePermission('inventory.counts.manage'), countController.createCount);
router.patch('/inventory-counts/:id/lines/:lineId', requirePermission('inventory.counts.manage'), countController.updateCountLine);
router.post('/inventory-counts/:id/complete', requirePermission('inventory.counts.manage'), countController.completeCount);

module.exports = router;
