const express = require('express');
const router = express.Router();
const requisitionController = require('../controllers/requisitionController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/requisitions', requirePermission('procurement.requisitions.manage'), requisitionController.listRequisitions);
router.get('/requisitions/:id', requirePermission('procurement.requisitions.manage'), requisitionController.getRequisition);
router.post('/requisitions', requirePermission('procurement.requisitions.manage'), requisitionController.createRequisition);
router.patch('/requisitions/:id/status', requirePermission('procurement.requisitions.manage'), requisitionController.updateRequisitionStatus);

module.exports = router;
