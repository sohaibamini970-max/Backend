const express = require("express");
const multer = require("multer");
const { authenticate } = require("../middleware/authMiddleware"); // Your auth middleware
const {
  uploadTaskAttachment,
  getTaskAttachments,
  downloadTaskAttachment,
  previewTaskAttachment,
  deleteTaskAttachment,
} = require("../controllers/taskattachmentcontroller");

const router = express.Router();

// ===========================
// MULTER CONFIGURATION
// ===========================
const storage = multer.memoryStorage(); // Store in memory for direct DB insertion

const fileFilter = (req, file, cb) => {
  // Validate file extension and mime type
  const allowedMimes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ];

  const allowedExtensions = ["pdf", "doc", "docx", "txt"];
  const fileExtension = file.originalname.split(".").pop().toLowerCase();

  if (!allowedExtensions.includes(fileExtension)) {
    return cb(new Error(`Invalid file type: ${fileExtension}`));
  }

  if (!allowedMimes.includes(file.mimetype)) {
    return cb(new Error(`Invalid MIME type: ${file.mimetype}`));
  }

  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
});

// ===========================
// ROUTES
// ===========================

// POST /api/tasks/:taskId/attachments - Upload file
router.post(
  "/tasks/:taskId/attachments",
  authenticate,
  upload.single("file"),
  uploadTaskAttachment
);

// GET /api/tasks/:taskId/attachments - Get all attachments for a task
router.get("/tasks/:taskId/attachments", authenticate, getTaskAttachments);

// GET /api/attachments/:attachmentId/download - Download file
router.get("/attachments/:attachmentId/download", authenticate, downloadTaskAttachment);

// GET /api/attachments/:attachmentId/preview - Preview file (inline)
router.get("/attachments/:attachmentId/preview", authenticate, previewTaskAttachment);

// DELETE /api/attachments/:attachmentId - Delete file
router.delete("/attachments/:attachmentId", authenticate, deleteTaskAttachment);

module.exports = router;
