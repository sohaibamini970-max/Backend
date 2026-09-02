const pool = require("../config/db");

const MANAGEMENT_ROLES = [
  "Project Manager",
  "Executive Manager",
  "System Administrator",
];

/*
 * Get task and verify whether the logged-in user
 * is the task assignee.
 */
const getTaskForAuthorization = async (taskId) => {
  const result = await pool.query(
    `
    SELECT
      id,
      assignee_id
    FROM tasks
    WHERE id = $1
    LIMIT 1
    `,
    [taskId]
  );

  return result.rows[0] || null;
};

/*
 * ============================================================
 * GET CHALLENGES
 * ============================================================
 *
 * Management:
 *   Project Manager
 *   Executive Manager
 *   System Administrator
 *
 * can read challenges.
 *
 * Member:
 *   Can only read challenges for a task assigned to himself.
 */
const getTaskChallenges = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const task = await getTaskForAuthorization(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    const isManagementRole =
      MANAGEMENT_ROLES.includes(req.user.role);

    const isTaskAssignee =
      String(task.assignee_id || "") ===
      String(req.user.id);

    if (!isManagementRole && !isTaskAssignee) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to view challenges for this task.",
      });
    }

    const result = await pool.query(
      `
      SELECT
        tc.id,
        tc.task_id,
        tc.user_id,
        tc.challenge,
        tc.created_at,
        tc.updated_at,
        u.full_name AS author_name,
        u.email AS author_email
      FROM task_challenges tc
      LEFT JOIN users u
        ON u.id = tc.user_id
      WHERE tc.task_id = $1
      ORDER BY tc.created_at ASC
      `,
      [taskId]
    );

    return res.status(200).json({
      success: true,
      challenges: result.rows,
    });
  } catch (error) {
    console.error(
      "Get Task Challenges Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch task challenges.",
    });
  }
};

/*
 * ============================================================
 * ADD CHALLENGE
 * ============================================================
 *
 * ONLY the Member who is assigned to the task can add it.
 *
 * The user_id comes from req.user.id.
 * We NEVER trust a user_id sent by the frontend.
 */
const createTaskChallenge = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { challenge } = req.body;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (req.user.role !== "Member") {
      return res.status(403).json({
        success: false,
        message:
          "Only Members can add task challenges.",
      });
    }

    if (!challenge || !challenge.trim()) {
      return res.status(400).json({
        success: false,
        message: "Challenge text is required.",
      });
    }

    const task = await getTaskForAuthorization(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    /*
     * IMPORTANT:
     *
     * Only the actual task assignee can submit
     * challenges for that task.
     */
    if (
      String(task.assignee_id || "") !==
      String(req.user.id)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You can only add challenges to tasks assigned to you.",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO task_challenges (
        task_id,
        user_id,
        challenge
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        task_id,
        user_id,
        challenge,
        created_at,
        updated_at
      `,
      [
        taskId,
        req.user.id,
        challenge.trim(),
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Challenge added successfully.",
      challenge: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Create Task Challenge Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to add task challenge.",
    });
  }
};

/*
 * ============================================================
 * DELETE CHALLENGE
 * ============================================================
 *
 * Optional but recommended.
 *
 * Member can delete his own challenge.
 * Management can delete any challenge.
 */
const deleteTaskChallenge = async (req, res) => {
  try {
    const { challengeId } = req.params;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        user_id
      FROM task_challenges
      WHERE id = $1
      LIMIT 1
      `,
      [challengeId]
    );

    const challenge = result.rows[0];

    if (!challenge) {
      return res.status(404).json({
        success: false,
        message: "Challenge not found.",
      });
    }

    const isManagementRole =
      MANAGEMENT_ROLES.includes(req.user.role);

    const isOwner =
      String(challenge.user_id) ===
      String(req.user.id);

    if (!isManagementRole && !isOwner) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to delete this challenge.",
      });
    }

    await pool.query(
      `
      DELETE FROM task_challenges
      WHERE id = $1
      `,
      [challengeId]
    );

    return res.status(200).json({
      success: true,
      message: "Challenge deleted successfully.",
    });
  } catch (error) {
    console.error(
      "Delete Task Challenge Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to delete challenge.",
    });
  }
};

module.exports = {
  getTaskChallenges,
  createTaskChallenge,
  deleteTaskChallenge,
};
