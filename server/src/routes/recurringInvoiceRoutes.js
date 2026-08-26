const express = require('express');
const router = express.Router();
const recurringInvoiceController = require('../controllers/recurringInvoiceController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/recurring-invoices', requirePermission('sales.recurring_invoices.manage'), recurringInvoiceController.listTemplates);
router.get('/recurring-invoices/:id', requirePermission('sales.recurring_invoices.manage'), recurringInvoiceController.getTemplate);
router.post('/recurring-invoices', requirePermission('sales.recurring_invoices.manage'), recurringInvoiceController.createTemplate);
router.patch('/recurring-invoices/:id/status', requirePermission('sales.recurring_invoices.manage'), recurringInvoiceController.updateStatus);
router.post('/recurring-invoices/:id/run-now', requirePermission('sales.recurring_invoices.manage'), recurringInvoiceController.runNow);

module.exports = router;
