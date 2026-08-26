const express = require('express');
const router = express.Router();
const school = require('../controllers/schoolController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

router.get('/school/workspace-dashboard', requirePermission('school.view'), school.getWorkspaceDashboard);

router.get('/school/classes', requirePermission('school.view'), school.listClasses);
router.post('/school/classes', requirePermission('school.manage'), school.createClass);
router.patch('/school/classes/:id', requirePermission('school.manage'), school.updateClass);
router.delete('/school/classes/:id', requirePermission('school.manage'), school.deleteClass);

router.get('/school/guardians', requirePermission('school.view'), school.listGuardians);
router.post('/school/guardians', requirePermission('school.manage'), school.createGuardian);
router.patch('/school/guardians/:id', requirePermission('school.manage'), school.updateGuardian);
router.delete('/school/guardians/:id', requirePermission('school.manage'), school.deleteGuardian);

router.get('/school/students', requirePermission('school.view'), school.listStudents);
router.get('/school/students/:id', requirePermission('school.view'), school.getStudent);
router.post('/school/students', requirePermission('school.manage'), school.createStudent);
router.patch('/school/students/:id', requirePermission('school.manage'), school.updateStudent);
router.delete('/school/students/:id', requirePermission('school.manage'), school.deleteStudent);
router.post('/school/students/:id/guardians', requirePermission('school.manage'), school.linkGuardian);
router.delete('/school/students/:studentId/guardians/:guardianId', requirePermission('school.manage'), school.unlinkGuardian);

router.get('/school/admissions', requirePermission('school.view'), school.listAdmissions);
router.post('/school/admissions', requirePermission('school.manage'), school.createAdmission);
router.patch('/school/admissions/:id', requirePermission('school.manage'), school.updateAdmission);
router.delete('/school/admissions/:id', requirePermission('school.manage'), school.deleteAdmission);
router.post('/school/admissions/:id/enroll', requirePermission('school.manage'), school.enrollApplication);

router.get('/school/attendance/register', requirePermission('school.view'), school.getClassRegister);
router.post('/school/attendance/bulk', requirePermission('school.manage'), school.bulkMarkAttendance);
router.get('/school/attendance/student/:id', requirePermission('school.view'), school.getStudentAttendanceSummary);
router.get('/school/attendance/class/:classId', requirePermission('school.view'), school.getClassAttendanceHistory);

router.get('/school/subjects', requirePermission('school.view'), school.listSubjects);
router.post('/school/subjects', requirePermission('school.manage'), school.createSubject);
router.patch('/school/subjects/:id', requirePermission('school.manage'), school.updateSubject);
router.delete('/school/subjects/:id', requirePermission('school.manage'), school.deleteSubject);

router.get('/school/grading-scale', requirePermission('school.view'), school.listGradingScale);
router.put('/school/grading-scale', requirePermission('school.manage'), school.replaceGradingScale);

router.get('/school/exams', requirePermission('school.view'), school.listExams);
router.get('/school/exams/:id', requirePermission('school.view'), school.getExam);
router.post('/school/exams', requirePermission('school.manage'), school.createExam);
router.patch('/school/exams/:id', requirePermission('school.manage'), school.updateExam);
router.delete('/school/exams/:id', requirePermission('school.manage'), school.deleteExam);
router.post('/school/exams/:id/subjects', requirePermission('school.manage'), school.addExamSubject);
router.get('/school/exams/:id/marks-sheet', requirePermission('school.view'), school.getMarksSheet);
router.post('/school/exams/:id/marks/bulk', requirePermission('school.manage'), school.bulkEnterMarks);

router.get('/school/students/:id/report-card', requirePermission('school.view'), school.getReportCard);
router.get('/school/students/:id/skill-assessments', requirePermission('school.view'), school.listSkillAssessments);
router.post('/school/students/:id/skill-assessments', requirePermission('school.manage'), school.recordSkillAssessment);

router.get('/school/fee-categories', requirePermission('school.view'), school.listFeeCategories);
router.post('/school/fee-categories', requirePermission('school.manage'), school.createFeeCategory);
router.patch('/school/fee-categories/:id', requirePermission('school.manage'), school.updateFeeCategory);
router.delete('/school/fee-categories/:id', requirePermission('school.manage'), school.deleteFeeCategory);

router.get('/school/fee-structures', requirePermission('school.view'), school.listFeeStructures);
router.get('/school/fee-structures/:id', requirePermission('school.view'), school.getFeeStructure);
router.post('/school/fee-structures', requirePermission('school.manage'), school.createFeeStructure);
router.patch('/school/fee-structures/:id', requirePermission('school.manage'), school.updateFeeStructure);
router.delete('/school/fee-structures/:id', requirePermission('school.manage'), school.deleteFeeStructure);
router.post('/school/fee-structures/:id/generate-invoice', requirePermission('school.manage'), school.generateFeeInvoice);
router.post('/school/fee-structures/:id/generate-invoices-bulk', requirePermission('school.manage'), school.generateFeeInvoicesBulk);

router.get('/school/students/:id/fee-invoices', requirePermission('school.view'), school.listStudentFeeInvoices);
router.get('/school/fee-invoices/:id', requirePermission('school.view'), school.getFeeInvoice);
router.post('/school/fee-invoices/:id/payments', requirePermission('school.manage'), school.recordFeePayment);

router.get('/school/fees/summary', requirePermission('school.view'), school.getFeesSummary);

router.get('/school/periods', requirePermission('school.view'), school.listPeriods);
router.post('/school/periods', requirePermission('school.manage'), school.createPeriod);
router.patch('/school/periods/:id', requirePermission('school.manage'), school.updatePeriod);
router.delete('/school/periods/:id', requirePermission('school.manage'), school.deletePeriod);

router.get('/school/timetable', requirePermission('school.view'), school.getClassTimetable);
router.get('/school/timetable/teacher/:teacherId', requirePermission('school.view'), school.getTeacherTimetable);
router.post('/school/timetable', requirePermission('school.manage'), school.createTimetableEntry);
router.patch('/school/timetable/:id', requirePermission('school.manage'), school.updateTimetableEntry);
router.delete('/school/timetable/:id', requirePermission('school.manage'), school.deleteTimetableEntry);

router.get('/school/library/settings', requirePermission('school.view'), school.getLibrarySettings);
router.patch('/school/library/settings', requirePermission('school.manage'), school.updateLibrarySettings);

router.get('/school/library/books', requirePermission('school.view'), school.listLibraryBooks);
router.post('/school/library/books', requirePermission('school.manage'), school.createLibraryBook);
router.patch('/school/library/books/:id', requirePermission('school.manage'), school.updateLibraryBook);
router.delete('/school/library/books/:id', requirePermission('school.manage'), school.deleteLibraryBook);

router.get('/school/library/loans', requirePermission('school.view'), school.listLibraryLoans);
router.post('/school/library/loans', requirePermission('school.manage'), school.issueBook);
router.post('/school/library/loans/:id/return', requirePermission('school.manage'), school.returnBook);
router.post('/school/library/loans/:id/mark-lost', requirePermission('school.manage'), school.markBookLost);
router.patch('/school/library/loans/:id/fine-paid', requirePermission('school.manage'), school.markFinePaid);

router.get('/school/transport/vehicles', requirePermission('school.view'), school.listVehicles);
router.post('/school/transport/vehicles', requirePermission('school.manage'), school.createVehicle);
router.patch('/school/transport/vehicles/:id', requirePermission('school.manage'), school.updateVehicle);
router.delete('/school/transport/vehicles/:id', requirePermission('school.manage'), school.deleteVehicle);

router.get('/school/transport/routes', requirePermission('school.view'), school.listRoutes);
router.get('/school/transport/routes/:id', requirePermission('school.view'), school.getRoute);
router.post('/school/transport/routes', requirePermission('school.manage'), school.createRoute);
router.patch('/school/transport/routes/:id', requirePermission('school.manage'), school.updateRoute);
router.delete('/school/transport/routes/:id', requirePermission('school.manage'), school.deleteRoute);
router.post('/school/transport/routes/:id/stops', requirePermission('school.manage'), school.addStop);
router.patch('/school/transport/stops/:id', requirePermission('school.manage'), school.updateStop);
router.delete('/school/transport/stops/:id', requirePermission('school.manage'), school.deleteStop);
router.post('/school/transport/routes/:id/assign', requirePermission('school.manage'), school.assignStudentToRoute);
router.delete('/school/transport/routes/:routeId/students/:studentId', requirePermission('school.manage'), school.unassignStudentFromRoute);

router.get('/school/study-materials', requirePermission('school.view'), school.listStudyMaterials);
router.post('/school/study-materials', requirePermission('school.manage'), school.createStudyMaterial);
router.patch('/school/study-materials/:id', requirePermission('school.manage'), school.updateStudyMaterial);
router.delete('/school/study-materials/:id', requirePermission('school.manage'), school.deleteStudyMaterial);

router.get('/school/assignments', requirePermission('school.view'), school.listAssignmentsForClass);
router.get('/school/assignments/:id', requirePermission('school.view'), school.getAssignment);
router.post('/school/assignments', requirePermission('school.manage'), school.createAssignment);
router.patch('/school/assignments/:id', requirePermission('school.manage'), school.updateAssignment);
router.delete('/school/assignments/:id', requirePermission('school.manage'), school.deleteAssignment);
router.post('/school/assignments/:id/submissions', requirePermission('school.manage'), school.submitAssignment);
router.patch('/school/submissions/:id', requirePermission('school.manage'), school.gradeSubmission);

router.get('/school/students/:id/assignments', requirePermission('school.view'), school.listStudentAssignments);

router.get('/school/academic-terms', requirePermission('school.view'), school.listAcademicTerms);
router.post('/school/academic-terms', requirePermission('school.manage'), school.createAcademicTerm);
router.patch('/school/academic-terms/:id', requirePermission('school.manage'), school.updateAcademicTerm);
router.delete('/school/academic-terms/:id', requirePermission('school.manage'), school.deleteAcademicTerm);

router.get('/school/promotions', requirePermission('school.view'), school.listPromotionBatches);
router.get('/school/promotions/:id', requirePermission('school.view'), school.getPromotionBatch);
router.post('/school/promotions/generate', requirePermission('school.manage'), school.generatePromotionBatch);
router.post('/school/promotions/:id/apply', requirePermission('school.manage'), school.applyPromotionBatch);
router.patch('/school/promotions/candidates/:id', requirePermission('school.manage'), school.reviewPromotionCandidate);

router.get('/school/departments', requirePermission('school.view'), school.listDepartments);
router.post('/school/departments', requirePermission('school.manage'), school.createDepartment);
router.patch('/school/departments/:id', requirePermission('school.manage'), school.updateDepartment);
router.delete('/school/departments/:id', requirePermission('school.manage'), school.deleteDepartment);

router.get('/school/grade-levels', requirePermission('school.view'), school.listGradeLevels);
router.post('/school/grade-levels', requirePermission('school.manage'), school.createGradeLevel);
router.patch('/school/grade-levels/:id', requirePermission('school.manage'), school.updateGradeLevel);
router.delete('/school/grade-levels/:id', requirePermission('school.manage'), school.deleteGradeLevel);

router.get('/school/houses', requirePermission('school.view'), school.listHouses);
router.post('/school/houses', requirePermission('school.manage'), school.createHouse);
router.patch('/school/houses/:id', requirePermission('school.manage'), school.updateHouse);
router.delete('/school/houses/:id', requirePermission('school.manage'), school.deleteHouse);

router.get('/school/shop/items', requirePermission('school.view'), school.listShopItems);
router.post('/school/shop/items', requirePermission('school.manage'), school.createShopItem);
router.patch('/school/shop/items/:id', requirePermission('school.manage'), school.updateShopItem);
router.delete('/school/shop/items/:id', requirePermission('school.manage'), school.deleteShopItem);

router.get('/school/shop/purchases', requirePermission('school.view'), school.listShopPurchases);
router.get('/school/shop/purchases/:id', requirePermission('school.view'), school.getShopPurchase);
router.post('/school/shop/purchases', requirePermission('school.manage'), school.createShopPurchase);

router.get('/school/shop/sales', requirePermission('school.view'), school.listShopSales);
router.get('/school/shop/sales/:id', requirePermission('school.view'), school.getShopSale);
router.post('/school/shop/sales', requirePermission('school.manage'), school.createShopSale);

router.get('/school/staff', requirePermission('school.view'), school.listSchoolStaff);
router.post('/school/staff', requirePermission('school.manage'), school.createSchoolStaff);
router.patch('/school/staff/:id', requirePermission('school.manage'), school.updateSchoolStaff);
router.delete('/school/staff/:id', requirePermission('school.manage'), school.deleteSchoolStaff);

router.get('/school/bank-accounts', requirePermission('school.view'), school.listSchoolBankAccounts);
router.post('/school/bank-accounts', requirePermission('school.manage'), school.createSchoolBankAccount);
router.delete('/school/bank-accounts/:id', requirePermission('school.manage'), school.deleteSchoolBankAccount);

router.get('/school/finance/trial-balance', requirePermission('school.view'), school.getSchoolTrialBalance);
router.get('/school/finance/income-statement', requirePermission('school.view'), school.getSchoolIncomeStatement);
router.get('/school/finance/statement-of-financial-position', requirePermission('school.view'), school.getSchoolStatementOfFinancialPosition);
router.get('/school/finance/statement-of-cash-flows', requirePermission('school.view'), school.getSchoolStatementOfCashFlows);

router.get('/school/reports/outstanding-fees', requirePermission('school.view'), school.getOutstandingFeesReport);
router.get('/school/reports/class-roster', requirePermission('school.view'), school.getClassRosterReport);
router.get('/school/reports/attendance-summary', requirePermission('school.view'), school.getSchoolAttendanceSummaryReport);

module.exports = router;
