const express = require('express');
const router = express.Router();
const coa = require('../controllers/chartOfAccountsController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/chart-of-accounts', requirePermission('accounting.ledger.view', 'accounting.coa.manage'), coa.listAccounts);
router.post('/chart-of-accounts', requirePermission('accounting.coa.manage'), coa.createAccount);
router.patch('/chart-of-accounts/:id', requirePermission('accounting.coa.manage'), coa.updateAccount);

router.get('/gl-mappings', requirePermission('accounting.coa.manage'), coa.listMappings);
router.put('/gl-mappings/:mappingKey', requirePermission('accounting.coa.manage'), coa.setMapping);

router.post('/accounting/setup-defaults', requirePermission('accounting.coa.manage'), coa.setupDefaults);

module.exports = router;
