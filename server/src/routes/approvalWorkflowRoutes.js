const express = require('express');
const router = express.Router();
const workflowController = require('../controllers/approvalWorkflowController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/workflow-definitions', requirePermission('workflows.definitions.manage'), workflowController.listDefinitions);
router.post('/workflow-definitions', requirePermission('workflows.definitions.manage'), workflowController.upsertDefinition);
router.patch('/workflow-definitions/:id/active', requirePermission('workflows.definitions.manage'), workflowController.setDefinitionActive);

router.get('/workflow-instances/my-approvals', workflowController.myPendingApprovals);
router.get('/workflow-instances', requirePermission('workflows.view_all'), workflowController.listAllInstances);
router.get('/workflow-instances/:id', workflowController.getInstance);
router.post('/workflow-instances/:id/action', workflowController.actOnInstance);

module.exports = router;
