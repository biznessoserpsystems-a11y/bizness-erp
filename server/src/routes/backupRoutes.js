const express = require('express');
const multer = require('multer');
const router = express.Router();
const backupController = require('../controllers/backupController');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const ApiError = require('../utils/ApiError');

// A backup file for a real database can legitimately run into the hundreds
// of MB — much larger than the 20MB cap on ordinary document attachments —
// so this gets its own multer instance rather than reusing attachmentRoutes'.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new ApiError(400, 'Backup file is too large (max 500MB)'));
      return next(new ApiError(400, err.message));
    }
    if (err) return next(err);
    next();
  });
}

router.use(authenticate);

router.get('/settings/backup', requirePermission('system.backup.manage'), backupController.createBackup);
router.post('/settings/restore', requirePermission('system.backup.manage'), handleUpload, backupController.restoreBackup);
router.get('/settings/backup-logs', requirePermission('system.backup.manage'), backupController.listBackupLogs);

module.exports = router;
