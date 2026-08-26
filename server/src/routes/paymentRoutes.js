const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/payments', requirePermission('sales.payments.manage'), paymentController.listPayments);
router.post('/payments', requirePermission('sales.payments.manage'), paymentController.createPayment);
router.post('/payments/:id/allocate', requirePermission('sales.payments.manage'), paymentController.allocatePayment);

module.exports = router;
