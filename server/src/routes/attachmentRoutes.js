const express = require('express');
const multer = require('multer');
const router = express.Router();
const attachmentController = require('../controllers/attachmentController');
const { authenticate } = require('../middleware/auth');
const ApiError = require('../utils/ApiError');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: attachmentController.MAX_FILE_SIZE },
});

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new ApiError(400, 'File is too large (max 20MB)'));
      return next(new ApiError(400, err.message));
    }
    if (err) return next(err);
    next();
  });
}

router.use(authenticate);

router.get('/attachments', attachmentController.listAttachments);
router.post('/attachments', handleUpload, attachmentController.uploadAttachment);
router.get('/attachments/:id/download', attachmentController.downloadAttachment);
router.delete('/attachments/:id', attachmentController.deleteAttachment);

module.exports = router;
