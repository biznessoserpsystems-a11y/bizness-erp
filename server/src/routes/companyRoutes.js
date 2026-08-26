const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/company', companyController.getCompany); // any authenticated user can view
router.patch('/company', requirePermission('system.company.manage'), companyController.updateCompany);
router.get('/company/document-numbering', requirePermission('system.company.manage'), companyController.listDocumentNumbering);

router.get('/branches', companyController.listBranches);
router.post('/branches', requirePermission('system.company.manage'), companyController.createBranch);
router.patch('/branches/:id', requirePermission('system.company.manage'), companyController.updateBranch);

module.exports = router;
