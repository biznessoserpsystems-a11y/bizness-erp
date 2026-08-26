const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const contactController = require('../controllers/contactController');
const activityController = require('../controllers/activityController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

router.use(authenticate);

// Leads
router.get('/leads', leadController.listLeads);
router.get('/leads/:id', leadController.getLead);
router.post('/leads', requirePermission('crm.leads.manage'), leadController.createLead);
router.patch('/leads/:id', requirePermission('crm.leads.manage'), leadController.updateLead);
router.post('/leads/:id/convert', requirePermission('crm.leads.manage'), leadController.convertToCustomer);

// Contacts (shared by customers and leads)
router.get('/contacts', contactController.listContacts);
router.post('/contacts', requirePermission('crm.contacts.manage'), contactController.createContact);
router.patch('/contacts/:id', requirePermission('crm.contacts.manage'), contactController.updateContact);
router.delete('/contacts/:id', requirePermission('crm.contacts.manage'), contactController.deleteContact);

// Activities (shared by customers and leads)
router.get('/activities/follow-ups', activityController.listFollowUps);
router.get('/activities', activityController.listActivities);
router.post('/activities', requirePermission('crm.activities.manage'), activityController.createActivity);
router.patch('/activities/:id', requirePermission('crm.activities.manage'), activityController.updateActivity);

module.exports = router;
