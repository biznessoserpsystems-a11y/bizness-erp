const express = require('express');
const router = express.Router();
const controller = require('../controllers/procurementRecordsController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireProcurementControl } = require('../middleware/procurementControls');

router.use(authenticate);

const canEdit = [
  requirePermission('procurement.records.edit'),
  requireProcurementControl('allow_record_edit', 'Editing procurement records is turned off. Enable it under Procurement > Settings.'),
];
const canDelete = [
  requirePermission('procurement.records.delete'),
  requireProcurementControl('allow_record_delete', 'Deleting procurement records is turned off. Enable it under Procurement > Settings.'),
];

router.get('/procurement/record-controls', requirePermission(
  'procurement.requisitions.manage', 'procurement.rfq.manage', 'procurement.orders.manage', 'procurement.receiving.manage',
  'procurement.invoices.manage', 'procurement.payments.manage', 'procurement.settings.manage'
), controller.getControls);

router.put('/requisitions/:id', ...canEdit, controller.updateRequisition);
router.delete('/requisitions/:id', ...canDelete, controller.deleteRequisition);
router.put('/rfqs/:id', ...canEdit, controller.updateRfq);
router.delete('/rfqs/:id', ...canDelete, controller.deleteRfq);
router.put('/purchase-orders/:id', ...canEdit, controller.updatePurchaseOrder);
router.delete('/purchase-orders/:id', ...canDelete, controller.deletePurchaseOrder);
router.put('/grns/:id', ...canEdit, controller.updateGrn);
router.delete('/grns/:id', ...canDelete, controller.deleteGrn);
router.put('/purchase-invoices/:id', ...canEdit, controller.updateInvoice);
router.delete('/purchase-invoices/:id', ...canDelete, controller.deleteInvoice);
router.put('/supplier-payments/:id', ...canEdit, controller.updatePayment);
router.delete('/supplier-payments/:id', ...canDelete, controller.deletePayment);

module.exports = router;
