const express = require('express');
const router = express.Router();
const svc = require('../controllers/serviceController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/services/workspace-dashboard', requirePermission('services.view'), svc.getWorkspaceDashboard);

router.get('/services/catalog', requirePermission('services.view'), svc.listCatalog);
router.post('/services/catalog', requirePermission('services.manage'), svc.createCatalogItem);
router.patch('/services/catalog/:id', requirePermission('services.manage'), svc.updateCatalogItem);
router.delete('/services/catalog/:id', requirePermission('services.manage'), svc.deleteCatalogItem);

router.get('/services/jobs', requirePermission('services.view'), svc.listJobs);
router.get('/services/jobs/:id', requirePermission('services.view'), svc.getJob);
router.post('/services/jobs', requirePermission('services.manage'), svc.createJob);
router.patch('/services/jobs/:id', requirePermission('services.manage'), svc.updateJob);
router.delete('/services/jobs/:id', requirePermission('services.manage'), svc.deleteJob);
router.post('/services/jobs/:id/generate-invoice', requirePermission('services.manage'), svc.generateJobInvoice);

router.post('/services/jobs/:id/time-entries', requirePermission('services.manage'), svc.addTimeEntry);
router.delete('/services/jobs/:jobId/time-entries/:id', requirePermission('services.manage'), svc.deleteTimeEntry);
router.post('/services/jobs/:id/expenses', requirePermission('services.manage'), svc.addExpense);
router.delete('/services/jobs/:jobId/expenses/:id', requirePermission('services.manage'), svc.deleteExpense);

module.exports = router;
