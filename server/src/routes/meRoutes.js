const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

router.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});

module.exports = router;
