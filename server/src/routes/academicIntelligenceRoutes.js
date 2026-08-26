const express = require('express');
const router = express.Router();
const academicIntelligenceController = require('../controllers/academicIntelligenceController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const rateLimit = require('express-rate-limit');

router.use(authenticate);

// Same tighter rate limit as every other AI insights endpoint in this
// app — a real, potentially billed external call, not an ordinary read.
const aiInsightsLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

// Gated behind school.view, matching every other School endpoint —
// unlike the cross-module suite dashboards' AI insights, this one is
// genuinely School-specific, so it uses School's own real permission
// rather than the "no single blanket permission" pattern those use.
router.get('/school/academic-insights', requirePermission('school.view'), aiInsightsLimiter, academicIntelligenceController.getAcademicInsights);

// The 12 data-only views — ordinary reads with no external API call,
// so none of these need the AI rate limiter, only the same school.view
// permission every School endpoint already uses.
const view = requirePermission('school.view');
router.get('/school/academic-intelligence/executive-overview', view, academicIntelligenceController.getExecutiveOverview);
router.get('/school/academic-intelligence/students', view, academicIntelligenceController.getStudentIntelligence);
router.get('/school/academic-intelligence/classes', view, academicIntelligenceController.getClassIntelligence);
router.get('/school/academic-intelligence/subjects', view, academicIntelligenceController.getSubjectIntelligence);
router.get('/school/academic-intelligence/teachers', view, academicIntelligenceController.getTeacherIntelligence);
router.get('/school/academic-intelligence/attendance', view, academicIntelligenceController.getAttendanceIntelligence);
router.get('/school/academic-intelligence/assessments', view, academicIntelligenceController.getAssessmentIntelligence);
router.get('/school/academic-intelligence/performance-trends', view, academicIntelligenceController.getPerformanceTrends);
router.get('/school/academic-intelligence/at-risk-students', view, academicIntelligenceController.getAtRiskStudents);
router.get('/school/academic-intelligence/comparative-analysis', view, academicIntelligenceController.getComparativeAnalysis);
router.get('/school/academic-intelligence/alerts', view, academicIntelligenceController.getAcademicAlerts);
router.get('/school/academic-intelligence/kpis', view, academicIntelligenceController.getAcademicKPIs);

module.exports = router;
