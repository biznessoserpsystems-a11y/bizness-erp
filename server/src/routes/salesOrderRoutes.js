const express = require('express');
const router = express.Router();
const salesOrderController = require('../controllers/salesOrderController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/sales-orders', requirePermission('sales.orders.manage'), salesOrderController.listSalesOrders);
router.get('/sales-orders/:id', requirePermission('sales.orders.manage'), salesOrderController.getSalesOrder);
router.post('/sales-orders', requirePermission('sales.orders.manage'), salesOrderController.createSalesOrder);
router.patch('/sales-orders/:id/status', requirePermission('sales.orders.manage'), salesOrderController.updateSalesOrderStatus);

module.exports = router;
