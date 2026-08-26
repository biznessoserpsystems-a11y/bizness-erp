const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/contracts', requirePermission('procurement.contracts.manage'), contractController.listContracts);
router.post('/contracts', requirePermission('procurement.contracts.manage'), contractController.createContract);
router.patch('/contracts/:id/status', requirePermission('procurement.contracts.manage'), contractController.updateContractStatus);

module.exports = router;
