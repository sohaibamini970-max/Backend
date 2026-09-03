const pool = require("../config/db");

// ===========================
// FILE SIZE LIMITS
// ===========================
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "txt"];

// ===========================
// UPLOAD FILE ATTACHMENT
// ===========================
const uploadTaskAttachment = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check user permissions (only Project Managers and Admins can upload)
    const isManagement =
      userRole === "System Administrator" ||
      userRole === "Executive Manager" ||
      userRole === "Project Manager";

    if (!isManagement) {
      return res.status(403).json({
        success: false,
        message: "Only managers can upload task attachments.",
      });
    }

    // Check if file is provided
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file provided.",
      });
    }

    // Validate file
    const { originalname, buffer, size, mimetype } = req.file;

    if (size > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        message: `File size must not exceed 10 MB. Current size: ${(size / (1024 * 1024)).toFixed(2)} MB`,
      });
    }

    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
      return res.status(400).json({
        success: false,
        message: `File type not allowed. Allowed types: PDF, DOC, DOCX, TXT`,
      });
    }

    // Verify task exists
    const taskCheck = await pool.query(
      "SELECT id FROM tasks WHERE id = $1",
      [taskId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    // Extract file extension and type
    const fileExtension = originalname.split(".").pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return res.status(400).json({
        success: false,
        message: `Invalid file extension. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
      });
    }

    // Insert attachment into database
    const result = await pool.query(
      `
      INSERT INTO task_attachments (
        task_id,
        file_name,
        file_type,
        mime_type,
        file_size,
        file_content,
        uploaded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING 
        id,
        task_id,
        file_name,
        file_type,
        mime_type,
        file_size,
        uploaded_by,
        created_at
      `,
      [
        taskId,
        originalname,
        fileExtension,
        mimetype,
        size,
        buffer, // Binary data
        userId,
      ]
    );

    const attachment = result.rows[0];

    return res.status(201).json({
      success: true,
      message: "File uploaded successfully.",
      attachment: {
        id: attachment.id,
        taskId: attachment.task_id,
        fileName: attachment.file_name,
        fileType: attachment.file_type,
        fileSize: attachment.file_size,
        uploadedBy: attachment.uploaded_by,
        createdAt: attachment.created_at,
      },
    });
  } catch (error) {
    console.error("Upload attachment error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload file.",
    });
  }
};

// ===========================
// GET TASK ATTACHMENTS
// ===========================
const getTaskAttachments = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Verify task exists
    const taskCheck = await pool.query(
      "SELECT * FROM tasks WHERE id = $1",
      [taskId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    const task = taskCheck.rows[0];

    // Authorization: Only assigned member, managers, or creator can view
    const isManagement =
      userRole === "System Administrator" ||
      userRole === "Executive Manager" ||
      userRole === "Project Manager";
    const isAssigned = String(task.assignee_id) === String(userId);

    if (!isManagement && !isAssigned) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this task's attachments.",
      });
    }

    // Get attachments (without file content for list view)
    const result = await pool.query(
      `
      SELECT 
        id,
        task_id,
        file_name,
        file_type,
        mime_type,
        file_size,
        uploaded_by,
        created_at,
        u.full_name as uploader_name
      FROM task_attachments
      LEFT JOIN users u ON task_attachments.uploaded_by = u.id
      WHERE task_id = $1
      ORDER BY created_at DESC
      `,
      [taskId]
    );

    return res.status(200).json({
      success: true,
      attachments: result.rows,
    });
  } catch (error) {
    console.error("Get attachments error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve attachments.",
    });
  }
};

// ===========================
// DOWNLOAD FILE ATTACHMENT
// ===========================
const downloadTaskAttachment = async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get attachment with file content
    const result = await pool.query(
      `
      SELECT 
        ta.id,
        ta.task_id,
        ta.file_name,
        ta.mime_type,
        ta.file_content,
        t.assignee_id
      FROM task_attachments ta
      JOIN tasks t ON ta.task_id = t.id
      WHERE ta.id = $1
      `,
      [attachmentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found.",
      });
    }

    const attachment = result.rows[0];

    // Authorization check
    const isManagement =
      userRole === "System Administrator" ||
      userRole === "Executive Manager" ||
      userRole === "Project Manager";
    const isAssigned = String(attachment.assignee_id) === String(userId);

    if (!isManagement && !isAssigned) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to download this file.",
      });
    }

    // Send file
    res.setHeader("Content-Type", attachment.mime_type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${attachment.file_name}"`
    );
    res.setHeader("Content-Length", attachment.file_content.length);

    return res.send(attachment.file_content);
  } catch (error) {
    console.error("Download attachment error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to download file.",
    });
  }
};

// ===========================
// PREVIEW FILE ATTACHMENT (For inline viewing)
// ===========================
const previewTaskAttachment = async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get attachment with file content
    const result = await pool.query(
      `
      SELECT 
        ta.id,
        ta.task_id,
        ta.file_name,
        ta.mime_type,
        ta.file_type,
        ta.file_content,
        t.assignee_id
      FROM task_attachments ta
      JOIN tasks t ON ta.task_id = t.id
      WHERE ta.id = $1
      `,
      [attachmentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found.",
      });
    }

    const attachment = result.rows[0];

    // Authorization check
    const isManagement =
      userRole === "System Administrator" ||
      userRole === "Executive Manager" ||
      userRole === "Project Manager";
    const isAssigned = String(attachment.assignee_id) === String(userId);

    if (!isManagement && !isAssigned) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this file.",
      });
    }

    // For inline viewing (not as attachment)
    res.setHeader("Content-Type", attachment.mime_type);
    res.setHeader("Content-Disposition", `inline; filename="${attachment.file_name}"`);
    res.setHeader("Content-Length", attachment.file_content.length);

    return res.send(attachment.file_content);
  } catch (error) {
    console.error("Preview attachment error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to preview file.",
    });
  }
};

// ===========================
// DELETE FILE ATTACHMENT
// ===========================
const deleteTaskAttachment = async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get attachment to verify ownership
    const getResult = await pool.query(
      `
      SELECT id, uploaded_by FROM task_attachments WHERE id = $1
      `,
      [attachmentId]
    );

    if (getResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found.",
      });
    }

    const attachment = getResult.rows[0];

    // Authorization: Only uploader, PM, or Admin can delete
    const isManagement =
      userRole === "System Administrator" ||
      userRole === "Executive Manager" ||
      userRole === "Project Manager";
    const isUploader = String(attachment.uploaded_by) === String(userId);

    if (!isManagement && !isUploader) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this file.",
      });
    }

    // Delete attachment
    const deleteResult = await pool.query(
      "DELETE FROM task_attachments WHERE id = $1 RETURNING id",
      [attachmentId]
    );

    return res.status(200).json({
      success: true,
      message: "File deleted successfully.",
    });
  } catch (error) {
    console.error("Delete attachment error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete file.",
    });
  }
};

module.exports = {
  uploadTaskAttachment,
  getTaskAttachments,
  downloadTaskAttachment,
  previewTaskAttachment,
  deleteTaskAttachment,
};
