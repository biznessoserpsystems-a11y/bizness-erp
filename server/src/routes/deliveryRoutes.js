const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/deliveries', requirePermission('sales.deliveries.manage'), deliveryController.listDeliveryNotes);
router.post('/deliveries', requirePermission('sales.deliveries.manage'), deliveryController.createDeliveryNote);

module.exports = router;
