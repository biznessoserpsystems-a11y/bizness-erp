const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/purchaseInvoiceController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/purchase-invoices', requirePermission('procurement.invoices.manage'), invoiceController.listInvoices);
router.get('/purchase-invoices/:id', requirePermission('procurement.invoices.manage'), invoiceController.getInvoice);
router.post('/purchase-invoices', requirePermission('procurement.invoices.manage'), invoiceController.createInvoice);
router.patch('/purchase-invoices/:id/void', requirePermission('procurement.invoices.manage'), invoiceController.voidInvoice);

module.exports = router;
