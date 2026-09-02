const express = require("express");

const router = express.Router();

const {
  authenticate,
} = require("../middleware/authMiddleware");

const {
  getTaskChallenges,
  createTaskChallenge,
  deleteTaskChallenge,
} = require("../controllers/challengecontroller");

/*
 * Get all challenges for a task.
 *
 * Management roles can read.
 * Assigned Member can read.
 */
router.get(
  "/task/:taskId",
  authenticate,
  getTaskChallenges
);

/*
 * Add a challenge to a task.
 *
 * Backend verifies:
 * - user is Member
 * - Member is the task assignee
 */
router.post(
  "/task/:taskId",
  authenticate,
  createTaskChallenge
);

/*
 * Delete challenge.
 *
 * Owner Member or management can delete.
 */
router.delete(
  "/:challengeId",
  authenticate,
  deleteTaskChallenge
);

module.exports = router;
