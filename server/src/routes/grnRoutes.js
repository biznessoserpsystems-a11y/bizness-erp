const express = require('express');
const router = express.Router();
const grnController = require('../controllers/grnController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/grns', requirePermission('procurement.receiving.manage'), grnController.listGrns);
router.post('/grns', requirePermission('procurement.receiving.manage'), grnController.createGrn);

module.exports = router;
