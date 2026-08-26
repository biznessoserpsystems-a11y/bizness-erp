const express = require('express');
const router = express.Router();
const rfqController = require('../controllers/rfqController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/rfqs', requirePermission('procurement.rfq.manage'), rfqController.listRfqs);
router.get('/rfqs/:id', requirePermission('procurement.rfq.manage'), rfqController.getRfq);
router.post('/rfqs', requirePermission('procurement.rfq.manage'), rfqController.createRfq);
router.patch('/rfqs/:id/status', requirePermission('procurement.rfq.manage'), rfqController.updateRfqStatus);
router.post('/rfqs/:id/quotations', requirePermission('procurement.rfq.manage'), rfqController.recordSupplierQuotation);
router.patch('/supplier-quotations/:id/select', requirePermission('procurement.rfq.manage'), rfqController.selectSupplierQuotation);

module.exports = router;
