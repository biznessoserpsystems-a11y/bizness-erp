const express = require('express');
const router = express.Router();
const quotationController = require('../controllers/quotationController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/quotations', requirePermission('sales.quotations.manage'), quotationController.listQuotations);
router.get('/quotations/:id', requirePermission('sales.quotations.manage'), quotationController.getQuotation);
router.post('/quotations', requirePermission('sales.quotations.manage'), quotationController.createQuotation);
router.patch('/quotations/:id/status', requirePermission('sales.quotations.manage'), quotationController.updateQuotationStatus);
router.post('/quotations/:id/convert', requirePermission('sales.quotations.manage'), quotationController.convertToSalesOrder);

module.exports = router;
