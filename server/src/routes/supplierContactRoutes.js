const express = require('express');
const router = express.Router();
const supplierContactController = require('../controllers/supplierContactController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/suppliers/:supplierId/contacts', supplierContactController.listContacts);
router.post('/suppliers/:supplierId/contacts', requirePermission('procurement.suppliers.manage'), supplierContactController.createContact);
router.patch('/supplier-contacts/:id', requirePermission('procurement.suppliers.manage'), supplierContactController.updateContact);
router.delete('/supplier-contacts/:id', requirePermission('procurement.suppliers.manage'), supplierContactController.deleteContact);

module.exports = router;
