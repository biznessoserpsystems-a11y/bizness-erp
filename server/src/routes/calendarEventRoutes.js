const express = require('express');
const router = express.Router();
const calendarEventController = require('../controllers/calendarEventController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/calendar-events', calendarEventController.listEvents);
router.post('/calendar-events', calendarEventController.createEvent);
router.patch('/calendar-events/:id', calendarEventController.updateEvent);
router.delete('/calendar-events/:id', calendarEventController.deleteEvent);

module.exports = router;
