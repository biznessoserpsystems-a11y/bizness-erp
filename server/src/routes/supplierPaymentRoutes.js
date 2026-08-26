const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/supplierPaymentController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/supplier-payments', requirePermission('procurement.payments.manage'), paymentController.listPayments);
router.post('/supplier-payments', requirePermission('procurement.payments.manage'), paymentController.createPayment);
router.post('/supplier-payments/:id/allocate', requirePermission('procurement.payments.manage'), paymentController.allocatePayment);

module.exports = router;
