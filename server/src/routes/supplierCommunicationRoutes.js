const express = require('express');
const router = express.Router();
const supplierCommunicationController = require('../controllers/supplierCommunicationController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/suppliers/:supplierId/communications', supplierCommunicationController.listCommunications);
router.post('/suppliers/:supplierId/communications', requirePermission('procurement.suppliers.manage'), supplierCommunicationController.createCommunication);

module.exports = router;
