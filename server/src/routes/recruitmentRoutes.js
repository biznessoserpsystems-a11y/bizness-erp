const express = require('express');
const router = express.Router();
const recruitment = require('../controllers/recruitmentController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/job-postings', requirePermission('hr.recruitment.manage'), recruitment.listJobPostings);
router.post('/job-postings', requirePermission('hr.recruitment.manage'), recruitment.createJobPosting);
router.patch('/job-postings/:id', requirePermission('hr.recruitment.manage'), recruitment.updateJobPosting);

router.get('/candidates', requirePermission('hr.recruitment.manage'), recruitment.listCandidates);
router.get('/candidates/:id', requirePermission('hr.recruitment.manage'), recruitment.getCandidate);
router.post('/candidates', requirePermission('hr.recruitment.manage'), recruitment.createCandidate);
router.patch('/candidates/:id', requirePermission('hr.recruitment.manage'), recruitment.updateCandidate);
router.post('/candidates/:id/interviews', requirePermission('hr.recruitment.manage'), recruitment.addInterview);
router.post('/candidates/:id/hire', requirePermission('hr.recruitment.manage'), recruitment.hireCandidate);

module.exports = router;
