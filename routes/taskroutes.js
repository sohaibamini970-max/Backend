const express = require("express");
const router = express.Router();

const { authenticate } = require("../middleware/authMiddleware");
const requireSystemAdministrator = require("../middleware/adminMiddleware");

const {
  getProjectTasks,
  getTask,
  getTasks,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  assignTask,
  getMyTasks,
  getMyProjects
} = require("../controllers/taskcontroller");

const {
  createWorkPart,
  getWorkParts,
  updateWorkPartStatus,
  deleteWorkPart
} = require("../controllers/taskWorkPartController");

// =========================================================
// 1. SPECIFIC / NAMED ROUTES (must come first)
// =========================================================

// Get all tasks (with filters)
router.get("/", authenticate, getTasks);

// Get current user's assigned tasks
router.get("/my/tasks", authenticate, getMyTasks);

// Get current user's projects (with assigned tasks)
router.get("/my/projects", authenticate, getMyProjects);

// Get all tasks for a project
router.get("/project/:projectId", authenticate, getProjectTasks);

// =========================================================
// 2. WORK PARTS (specific, before /:taskId)
// =========================================================

router.post("/:taskId/work-parts", authenticate, createWorkPart);
router.get("/:taskId/work-parts", authenticate, getWorkParts);
router.patch("/work-parts/:workPartId/status", authenticate, updateWorkPartStatus);
router.delete("/work-parts/:workPartId", authenticate, deleteWorkPart);

// =========================================================
// 3. TASK-SCOPED ROUTES
// =========================================================

// Create task in project
router.post("/project/:projectId", authenticate, createTask);

// Assign / reassign task
router.patch("/:taskId/assign", authenticate, assignTask);

// Update task status
router.patch("/:taskId/status", authenticate, updateTaskStatus);

// Update full task details
router.patch("/:taskId", authenticate, updateTask);

// Delete task
router.delete(
  "/:taskId",
  authenticate,
  requireSystemAdministrator,
  deleteTask
);

// Get single task details (KEEP LAST among GETs)
router.get("/:taskId", authenticate, getTask);

module.exports = router;
