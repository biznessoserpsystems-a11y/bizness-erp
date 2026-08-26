const express = require('express');
const router = express.Router();
const procurementSettingsController = require('../controllers/procurementSettingsController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/procurement/settings', requirePermission('procurement.settings.manage'), procurementSettingsController.getProcurementSettings);
router.put('/procurement/settings', requirePermission('procurement.settings.manage'), procurementSettingsController.updateProcurementSettings);

module.exports = router;
