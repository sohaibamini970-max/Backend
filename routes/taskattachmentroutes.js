const express = require("express");
const multer = require("multer");

const router = express.Router();

const {
    uploadTaskAttachment,
    getTaskAttachments,
    downloadTaskAttachment,
    previewTaskAttachment,
    deleteTaskAttachment,
} = require("../controllers/taskattachmentcontroller");

const {authenticate} = require("../middleware/authMiddleware");

// IMPORTANT:
// Store uploaded file temporarily in memory.
// Then controller saves buffer into PostgreSQL BYTEA.

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
});

// Upload
router.post(
    "/tasks/:taskId/attachments",
    authenticate,
    upload.single("file"),
    uploadTaskAttachment
);

// List files
router.get(
    "/tasks/:taskId/attachments",
    authenticate,
    getTaskAttachments
);

// Download
router.get(
    "/attachments/:attachmentId/download",
    authenticate,
    downloadTaskAttachment
);

// Preview
router.get(
    "/attachments/:attachmentId/preview",
    authenticate,
    previewTaskAttachment
);

// Delete
router.delete(
    "/attachments/:attachmentId",
    authenticate,
    deleteTaskAttachment
);

module.exports = router;
