const express = require('express');
const router = express.Router();
const purchaseOrderController = require('../controllers/purchaseOrderController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/purchase-orders', requirePermission('procurement.orders.manage'), purchaseOrderController.listPurchaseOrders);
router.get('/purchase-orders/:id', requirePermission('procurement.orders.manage'), purchaseOrderController.getPurchaseOrder);
router.post('/purchase-orders', requirePermission('procurement.orders.manage'), purchaseOrderController.createPurchaseOrder);
router.patch('/purchase-orders/:id/status', requirePermission('procurement.orders.manage'), purchaseOrderController.updatePurchaseOrderStatus);

module.exports = router;
