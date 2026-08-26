const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/customers', customerController.listCustomers);
router.get('/customers/:id', customerController.getCustomer);
router.get('/customers/:id/ledger', customerController.getCustomerLedger);
router.post('/customers', requirePermission('sales.customers.manage'), customerController.createCustomer);
router.patch('/customers/:id', requirePermission('sales.customers.manage'), customerController.updateCustomer);

module.exports = router;
