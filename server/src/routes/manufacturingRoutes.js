const express = require('express');
const router = express.Router();
const mfg = require('../controllers/manufacturingController');
const costing = require('../controllers/manufacturingCostingController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/manufacturing/settings', requirePermission('manufacturing.settings.manage'), mfg.getManufacturingSettings);
router.put('/manufacturing/settings', requirePermission('manufacturing.settings.manage'), mfg.updateManufacturingSettings);

router.get('/manufacturing/boms', requirePermission('manufacturing.bom.manage'), mfg.listBOMs);
router.get('/manufacturing/boms/:id', requirePermission('manufacturing.bom.manage'), mfg.getBOM);
router.post('/manufacturing/boms', requirePermission('manufacturing.bom.manage'), mfg.createBOM);
router.patch('/manufacturing/boms/:id/costing-method', requirePermission('manufacturing.bom.manage'), costing.setCostingMethod);

router.get('/manufacturing/overhead-rates', requirePermission('manufacturing.overhead_rates.manage'), mfg.listOverheadRates);
router.post('/manufacturing/overhead-rates', requirePermission('manufacturing.overhead_rates.manage'), mfg.createOverheadRate);

router.get('/manufacturing/work-orders', requirePermission('manufacturing.work_orders.manage'), mfg.listWorkOrders);
router.get('/manufacturing/work-orders/:id', requirePermission('manufacturing.work_orders.manage'), mfg.getWorkOrder);
router.post('/manufacturing/work-orders', requirePermission('manufacturing.work_orders.manage'), mfg.createWorkOrder);
router.post('/manufacturing/work-orders/:id/issue-materials', requirePermission('manufacturing.work_orders.manage'), mfg.issueMaterialsForWorkOrder);
router.post('/manufacturing/work-orders/:id/log-labour', requirePermission('manufacturing.work_orders.manage'), mfg.logLabourForWorkOrder);
router.post('/manufacturing/work-orders/:id/apply-overhead', requirePermission('manufacturing.work_orders.manage'), mfg.applyOverheadForWorkOrder);
router.post('/manufacturing/work-orders/:id/complete', requirePermission('manufacturing.work_orders.manage'), mfg.completeWorkOrder);
router.get('/manufacturing/work-orders/:id/standard-variance', requirePermission('manufacturing.costing.manage'), costing.standardVarianceForWorkOrder);
router.get('/manufacturing/work-orders/:id/abc-allocations', requirePermission('manufacturing.costing.manage'), costing.getAbcAllocationsForWorkOrder);
router.post('/manufacturing/work-orders/:id/abc-allocations', requirePermission('manufacturing.costing.manage'), costing.allocateAbcToWorkOrder);

router.get('/manufacturing/cogm-statement', requirePermission('manufacturing.reports.view'), mfg.cogmStatement);
router.get('/manufacturing/manufacturing-account', requirePermission('manufacturing.reports.view'), mfg.manufacturingAccountStatement);
router.get('/manufacturing/overhead-variance', requirePermission('manufacturing.reports.view'), mfg.overheadVariance);
router.post('/manufacturing/overhead-variance/close', requirePermission('manufacturing.reports.view'), mfg.closeOverheadVariance);
router.post('/manufacturing/overhead-actual', requirePermission('manufacturing.work_orders.manage'), mfg.recordOverheadActual);

router.get('/manufacturing/standard-cost-cards', requirePermission('manufacturing.costing.manage'), costing.listStandardCostCards);
router.post('/manufacturing/standard-cost-cards', requirePermission('manufacturing.costing.manage'), costing.createStandardCostCard);
router.patch('/manufacturing/standard-cost-cards/:id', requirePermission('manufacturing.costing.manage'), costing.updateStandardCostCard);
router.delete('/manufacturing/standard-cost-cards/:id', requirePermission('manufacturing.costing.manage'), costing.deleteStandardCostCard);
router.get('/manufacturing/job-cost-report', requirePermission('manufacturing.reports.view'), costing.jobCostReport);
router.get('/manufacturing/process-cost-batches', requirePermission('manufacturing.costing.manage'), costing.listProcessCostBatches);
router.post('/manufacturing/process-cost-batches', requirePermission('manufacturing.costing.manage'), costing.createProcessCostBatch);
router.patch('/manufacturing/process-cost-batches/:id', requirePermission('manufacturing.costing.manage'), costing.updateProcessCostBatch);
router.delete('/manufacturing/process-cost-batches/:id', requirePermission('manufacturing.costing.manage'), costing.deleteProcessCostBatch);
router.get('/manufacturing/abc-activity-pools', requirePermission('manufacturing.costing.manage'), costing.listActivityPools);
router.post('/manufacturing/abc-activity-pools', requirePermission('manufacturing.costing.manage'), costing.createActivityPool);
router.patch('/manufacturing/abc-activity-pools/:id', requirePermission('manufacturing.costing.manage'), costing.updateActivityPool);
router.delete('/manufacturing/abc-activity-pools/:id', requirePermission('manufacturing.costing.manage'), costing.deleteActivityPool);

module.exports = router;
