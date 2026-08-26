const express = require('express');
const router = express.Router();
const bcm = require('../controllers/bcmController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/bcm/workspace-dashboard', requirePermission('bcm.view'), bcm.getWorkspaceDashboard);

router.get('/bcm/risks', requirePermission('bcm.view'), bcm.listRisks);
router.post('/bcm/risks', requirePermission('bcm.manage'), bcm.createRisk);
router.patch('/bcm/risks/:id', requirePermission('bcm.manage'), bcm.updateRisk);
router.delete('/bcm/risks/:id', requirePermission('bcm.manage'), bcm.deleteRisk);

router.get('/bcm/critical-functions', requirePermission('bcm.view'), bcm.listCriticalFunctions);
router.post('/bcm/critical-functions', requirePermission('bcm.manage'), bcm.createCriticalFunction);
router.patch('/bcm/critical-functions/:id', requirePermission('bcm.manage'), bcm.updateCriticalFunction);
router.delete('/bcm/critical-functions/:id', requirePermission('bcm.manage'), bcm.deleteCriticalFunction);

router.get('/bcm/continuity-plans', requirePermission('bcm.view'), bcm.listContinuityPlans);
router.post('/bcm/continuity-plans', requirePermission('bcm.manage'), bcm.createContinuityPlan);
router.patch('/bcm/continuity-plans/:id', requirePermission('bcm.manage'), bcm.updateContinuityPlan);
router.delete('/bcm/continuity-plans/:id', requirePermission('bcm.manage'), bcm.deleteContinuityPlan);

router.get('/bcm/incidents', requirePermission('bcm.view'), bcm.listIncidents);
router.post('/bcm/incidents', requirePermission('bcm.manage'), bcm.createIncident);
router.patch('/bcm/incidents/:id/resolve', requirePermission('bcm.manage'), bcm.resolveIncident);
router.patch('/bcm/incidents/:id', requirePermission('bcm.manage'), bcm.updateIncident);
router.delete('/bcm/incidents/:id', requirePermission('bcm.manage'), bcm.deleteIncident);

module.exports = router;
