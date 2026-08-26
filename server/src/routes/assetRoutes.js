const express = require('express');
const router = express.Router();
const assetController = require('../controllers/assetController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/asset-categories', assetController.listCategories);
router.post('/asset-categories', requirePermission('assets.categories.manage'), assetController.createCategory);
router.patch('/asset-categories/:id', requirePermission('assets.categories.manage'), assetController.updateCategory);

router.get('/fixed-assets', assetController.listAssets);
router.get('/fixed-assets/:id', assetController.getAsset);
router.get('/fixed-assets/:id/assignments', assetController.getAssetAssignmentHistory);
router.post('/fixed-assets', requirePermission('assets.register.manage'), assetController.createAsset);
router.patch('/fixed-assets/:id', requirePermission('assets.register.manage'), assetController.updateAsset);

router.post('/fixed-assets/depreciation-run', requirePermission('assets.depreciation.run'), assetController.runDepreciationBatch);
router.post('/fixed-assets/:id/revalue', requirePermission('assets.revaluation.manage'), assetController.revalueAsset);
router.post('/fixed-assets/:id/impair', requirePermission('assets.revaluation.manage'), assetController.assessImpairment);
router.post('/fixed-assets/:id/dispose', requirePermission('assets.disposals.manage'), assetController.disposeAsset);

router.get('/asset-reports/register', requirePermission('assets.reports.view'), assetController.assetRegisterReport);
router.get('/asset-reports/depreciation-history', requirePermission('assets.reports.view'), assetController.depreciationHistoryReport);
router.get('/asset-reports/disposals', requirePermission('assets.reports.view'), assetController.disposalsReport);
router.get('/asset-reports/assignment-summary', requirePermission('assets.reports.view'), assetController.assignmentSummaryReport);

router.get('/asset-assignments', assetController.listAllAssetAssignments);
router.post('/asset-assignments/:id/transfer', requirePermission('assets.register.manage'), assetController.transferAssetAssignment);

module.exports = router;
