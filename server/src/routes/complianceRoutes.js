const express = require('express');
const router = express.Router();
const compliance = require('../controllers/complianceController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/compliance-documents', compliance.listComplianceDocuments);
router.post('/compliance-documents', requirePermission('hr.compliance.manage'), compliance.createComplianceDocument);
router.patch('/compliance-documents/:id', requirePermission('hr.compliance.manage'), compliance.updateComplianceDocument);

router.get('/company-policies', compliance.listPolicies);
router.post('/company-policies', requirePermission('hr.compliance.manage'), compliance.createPolicy);
router.post('/company-policies/:id/acknowledge', compliance.acknowledgePolicy);
router.get('/company-policies/:id/acknowledgments', requirePermission('hr.compliance.manage'), compliance.listAcknowledgments);

router.get('/compliance-incidents', compliance.listIncidents);
router.post('/compliance-incidents', requirePermission('hr.compliance.manage'), compliance.createIncident);
router.patch('/compliance-incidents/:id', requirePermission('hr.compliance.manage'), compliance.updateIncident);

router.get('/hr-reports/compliance-summary', requirePermission('hr.compliance.manage'), compliance.getComplianceSummary);

module.exports = router;
