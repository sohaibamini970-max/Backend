const express = require("express");

const router = express.Router();

const {

  authenticate,

} = require("../middleware/authMiddleware");

const {

  getProjectTasks,

  getTask,

  createTask,

  updateTask,

  updateTaskStatus,

  deleteTask,

  assignTask,

  getMyTasks,
  getMyProjects

} = require("../controllers/taskcontroller");

// Get all tasks for a project

router.get(

  "/project/:projectId",

  authenticate,

  getProjectTasks

);

// Get single task details

router.get(

  "/:taskId",

  authenticate,

  getTask

);

// Create task in project

router.post(

  "/project/:projectId",

  authenticate,

  createTask

);

// Assign / reassign task

router.patch(

  "/:taskId/assign",

  authenticate,

  assignTask

);

// Update task status

router.patch(

  "/:taskId/status",

  authenticate,

  updateTaskStatus

);

// Update full task details

router.patch(

  "/:taskId",

  authenticate,

  updateTask

);

// Delete task

router.delete(

  "/:taskId",

  authenticate,

  deleteTask

);

// Get current user's assigned tasks
router.get("/my/tasks", authenticate, getMyTasks);

// Get current user's projects (with assigned tasks)
router.get("/my/projects", authenticate, getMyProjects);

module.exports = router;