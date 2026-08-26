const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/supplier-groups', supplierController.listSupplierGroups);
router.post('/supplier-groups', requirePermission('procurement.suppliers.manage'), supplierController.createSupplierGroup);
router.patch('/supplier-groups/:id', requirePermission('procurement.suppliers.manage'), supplierController.updateSupplierGroup);

router.get('/suppliers', supplierController.listSuppliers);
router.get('/suppliers/:id', supplierController.getSupplier);
router.get('/suppliers/:id/ledger', supplierController.getSupplierLedger);
router.get('/suppliers/:id/scorecard', supplierController.getSupplierScorecard);
router.post('/suppliers', requirePermission('procurement.suppliers.manage'), supplierController.createSupplier);
router.patch('/suppliers/:id', requirePermission('procurement.suppliers.manage'), supplierController.updateSupplier);

module.exports = router;
