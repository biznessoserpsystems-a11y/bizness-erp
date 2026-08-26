const express = require('express');
const router = express.Router();
const currencyController = require('../controllers/currencyController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/currencies', currencyController.listCurrencies);
router.post('/currencies', requirePermission('accounting.coa.manage'), currencyController.createCurrency);
router.patch('/currencies/:code', requirePermission('accounting.coa.manage'), currencyController.updateCurrency);

router.get('/exchange-rates', requirePermission('accounting.coa.manage'), currencyController.listExchangeRates);
router.post('/exchange-rates', requirePermission('accounting.coa.manage'), currencyController.createExchangeRate);
router.delete('/exchange-rates/:id', requirePermission('accounting.coa.manage'), currencyController.deleteExchangeRate);

module.exports = router;
