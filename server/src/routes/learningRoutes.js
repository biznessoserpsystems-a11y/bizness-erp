const express = require('express');
const router = express.Router();
const learning = require('../controllers/learningController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

// Courses — catalog is viewable by anyone, managed by hr.training.manage
router.get('/training-courses', learning.listCourses);
router.post('/training-courses', requirePermission('hr.training.manage'), learning.createCourse);
router.patch('/training-courses/:id', requirePermission('hr.training.manage'), learning.updateCourse);

// Sessions (Training Calendar) — viewable by anyone, managed by hr.training.manage
router.get('/training-sessions', learning.listSessions);
router.post('/training-sessions', requirePermission('hr.training.manage'), learning.createSession);
router.patch('/training-sessions/:id', requirePermission('hr.training.manage'), learning.updateSession);
router.get('/training-sessions/:id/enrollments', requirePermission('hr.training.manage'), learning.listSessionEnrollments);
router.post('/training-sessions/:id/enroll', learning.enrollInSession);

// Enrollments — self-cancel or hr.training.manage enforced in the controller
router.patch('/training-enrollments/:id', learning.updateEnrollment);

// Learning history — self or hr.training.manage enforced in the controller
router.get('/employees/:id/learning-history', learning.getLearningHistory);

// Training needs assessment
router.get('/training-needs', requirePermission('hr.training.manage'), learning.listTrainingNeeds);
router.post('/training-needs', requirePermission('hr.training.manage'), learning.createTrainingNeed);
router.patch('/training-needs/:id', requirePermission('hr.training.manage'), learning.updateTrainingNeed);

// Reports
router.get('/hr-reports/training-costs', requirePermission('hr.reports.view'), learning.getTrainingCostsReport);
router.get('/hr-reports/certification-expiry', requirePermission('hr.training.manage'), learning.getCertificationExpiryReport);

module.exports = router;
