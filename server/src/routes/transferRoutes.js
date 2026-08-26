const express = require('express');
const router = express.Router();
const transferController = require('../controllers/transferController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/transfers', requirePermission('inventory.transfers.manage'), transferController.listTransfers);
router.post('/transfers', requirePermission('inventory.transfers.manage'), transferController.createTransfer);

module.exports = router;
