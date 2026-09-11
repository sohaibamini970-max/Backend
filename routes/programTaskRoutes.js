// routes/programTaskRoutes.js
const express = require("express");
const multer = require("multer");
const router = express.Router();

const { authenticate } = require("../middleware/authMiddleware");

const {
    createProgramTask,
    getProgramProjectTasks,
    getMyProgramTasks,
    getAllProgramTasks,
    getProgramTaskById,
    updateProgramTaskStatus,
    markProgramTaskDone,
    deleteProgramTask,
    uploadInstructionFile,
    getInstructionFiles,
    downloadInstructionFile,
    previewInstructionFile,
    deleteInstructionFile,
    assignProgramProjectMembers,
    getProgramProjectMembers,
    getMyProgramProjects,
    getMyProgramProjectTasks,
} = require("../controllers/programTaskController");

const {
    getProgramTaskChallenges,
    createProgramTaskChallenge,
    deleteProgramTaskChallenge,
    uploadProgramTaskAttachment,
    getProgramTaskAttachments,
    downloadProgramTaskAttachment,
    previewProgramTaskAttachment,
    deleteProgramTaskAttachment,
    getProgramTaskWorkParts,
    createProgramTaskWorkPart,
    updateProgramTaskWorkPartStatus,
    deleteProgramTaskWorkPart,
    getProgramTaskSubmissions,
    createProgramTaskSubmission,
    deleteProgramTaskSubmission,
} = require("../controllers/programTaskChildControllers");

const upload = multer({ storage: multer.memoryStorage() });

/* =========================================================
   PROGRAM TASK CORE
========================================================= */

router.post("/program-project/:programProjectId", authenticate, createProgramTask);
router.get("/program-project/:programProjectId", authenticate, getProgramProjectTasks);
router.get("/my/tasks", authenticate, getMyProgramTasks);
router.get("/all", authenticate, getAllProgramTasks);
router.get("/:taskId", authenticate, getProgramTaskById);
router.patch("/:taskId/status", authenticate, updateProgramTaskStatus);
router.patch("/:taskId/mark-done", authenticate, markProgramTaskDone);
router.delete("/:taskId", authenticate, deleteProgramTask);

// Members management
router.post("/program-project/:programProjectId/members", authenticate, assignProgramProjectMembers);
router.get("/program-project/:programProjectId/members", authenticate, getProgramProjectMembers);

// Member self-service
router.get("/my/program-projects", authenticate, getMyProgramProjects);
router.get("/my/program-project/:programProjectId/tasks", authenticate, getMyProgramProjectTasks);

/* =========================================================
   INSTRUCTION FILES
========================================================= */

router.post("/:taskId/instructions", authenticate, upload.single("file"), uploadInstructionFile);
router.get("/:taskId/instructions", authenticate, getInstructionFiles);
router.get("/instructions/:instructionId/preview", authenticate, previewInstructionFile);
router.get("/instructions/:instructionId/download", authenticate, downloadInstructionFile);
router.delete("/instructions/:instructionId", authenticate, deleteInstructionFile);

/* =========================================================
   CHALLENGES
========================================================= */

router.get("/:taskId/challenges", authenticate, getProgramTaskChallenges);
router.post("/:taskId/challenges", authenticate, createProgramTaskChallenge);
router.delete("/challenges/:challengeId", authenticate, deleteProgramTaskChallenge);

/* =========================================================
   ATTACHMENTS
========================================================= */

router.post("/:taskId/attachments", authenticate, upload.single("file"), uploadProgramTaskAttachment);
router.get("/:taskId/attachments", authenticate, getProgramTaskAttachments);
router.get("/attachments/:attachmentId/preview", authenticate, previewProgramTaskAttachment);
router.get("/attachments/:attachmentId/download", authenticate, downloadProgramTaskAttachment);
router.delete("/attachments/:attachmentId", authenticate, deleteProgramTaskAttachment);

/* =========================================================
   WORK PARTS
========================================================= */

router.get("/:taskId/work-parts", authenticate, getProgramTaskWorkParts);
router.post("/:taskId/work-parts", authenticate, createProgramTaskWorkPart);
router.patch("/work-parts/:workPartId/status", authenticate, updateProgramTaskWorkPartStatus);
router.delete("/work-parts/:workPartId", authenticate, deleteProgramTaskWorkPart);

/* =========================================================
   SUBMISSIONS
========================================================= */

router.get("/:taskId/submissions", authenticate, getProgramTaskSubmissions);
router.post("/:taskId/submissions", authenticate, createProgramTaskSubmission);
router.delete("/submissions/:submissionId", authenticate, deleteProgramTaskSubmission);

module.exports = router;
