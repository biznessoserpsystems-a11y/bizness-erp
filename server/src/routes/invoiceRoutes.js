const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/invoices', requirePermission('sales.invoices.manage'), invoiceController.listInvoices);
router.get('/invoices/:id', requirePermission('sales.invoices.manage'), invoiceController.getInvoice);
router.post('/invoices', requirePermission('sales.invoices.manage'), invoiceController.createInvoice);
router.patch('/invoices/:id/void', requirePermission('sales.invoices.manage'), invoiceController.voidInvoice);

module.exports = router;
