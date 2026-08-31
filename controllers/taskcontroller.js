const pool = require("../config/db");

const getProjectTasks = async (req, res) => {
  try {
    const { projectId } = req.params;

    const result = await pool.query(
      `
      SELECT 
        t.id,
        t.project_id,
        t.name,
        t.description,
        t.status,
        t.priority,
        t.assignee_id,
        t.start_date,
        t.due_date,
        t.created_by,
        t.created_at,
        t.updated_at,
        u.full_name as assignee_name,
        u.email as assignee_email
      FROM tasks t
      LEFT JOIN users u ON t.assignee_id = u.id
      WHERE t.project_id = $1
      ORDER BY t.created_at DESC
      `,
      [projectId]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Get project tasks error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve project tasks."
    });
  }
};

const getTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    const result = await pool.query(
      `
      SELECT 
        t.id,
        t.project_id,
        t.name,
        t.description,
        t.status,
        t.priority,
        t.assignee_id,
        t.start_date,
        t.due_date,
        t.created_by,
        t.created_at,
        t.updated_at,
        u.full_name as assignee_name,
        u.email as assignee_email,
        p.name as project_name
      FROM tasks t
      LEFT JOIN users u ON t.assignee_id = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1
      `,
      [taskId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found."
      });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Get task error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve task."
    });
  }
};

const createTask = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, description, status, priority, assigneeId, startDate, dueDate } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role; // From auth middleware

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Task name is required."
      });
    }

    // Verify project exists
    const projectResult = await pool.query(
      `SELECT id, created_by, project_manager_id FROM projects WHERE id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found."
      });
    }

    const project = projectResult.rows[0];

    // Check project member mapping
    const memberCheck = await pool.query(
      `SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, userId]
    );

    const isExecutive = userRole === 'Executive Manager';
    const isProjectManager = project.project_manager_id === userId || userRole === 'Project Manager';
    const isCreator = project.created_by === userId;
    const isMember = memberCheck.rows.length > 0;

    // Authorization check
    if (!isExecutive && !isProjectManager && !isCreator && !isMember) {
      return res.status(403).json({
        success: false,
        message: "Only project managers, creators, or assigned team members can create tasks."
      });
    }

    // Verify assignee exists if provided
    if (assigneeId) {
      const assigneeResult = await pool.query(
        `SELECT id FROM users WHERE id = $1 AND is_active = TRUE`,
        [assigneeId]
      );

      if (assigneeResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Assignee not found or is inactive."
        });
      }
    }

    const result = await pool.query(
      `
      INSERT INTO tasks (
        project_id,
        name,
        description,
        status,
        priority,
        assignee_id,
        start_date,
        due_date,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING 
        id,
        project_id,
        name,
        description,
        status,
        priority,
        assignee_id,
        start_date,
        due_date,
        created_by,
        created_at,
        updated_at
      `,
      [
        projectId,
        name.trim(),
        description || null,
        status || "To Do",
        priority || "Medium",
        assigneeId || null,
        startDate || null,
        dueDate || null,
        userId
      ]
    );

    const task = result.rows[0];

    // Fetch assignee details if exists
    if (task.assignee_id) {
      const assigneeRes = await pool.query(
        `SELECT full_name, email FROM users WHERE id = $1`,
        [task.assignee_id]
      );

      if (assigneeRes.rows.length > 0) {
        task.assignee_name = assigneeRes.rows[0].full_name;
        task.assignee_email = assigneeRes.rows[0].email;
      }
    }

    // Return created task directly or inside success wrapper
    return res.status(201).json({
      success: true,
      message: "Task created successfully.",
      task: task
    });
  } catch (error) {
    console.error("Create task error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create task."
    });
  }
};

const updateTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { name, description, status, priority, assigneeId, startDate, dueDate } = req.body;
    const userId = req.user.id;

    // Verify task exists and get project info
    const taskResult = await pool.query(
      `SELECT project_id FROM tasks WHERE id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found."
      });
    }

    const projectId = taskResult.rows[0].project_id;

    // Verify user is project creator or manager
    const projectResult = await pool.query(
      `SELECT created_by, project_manager_id FROM projects WHERE id = $1`,
      [projectId]
    );

    const project = projectResult.rows[0];
    if (project.created_by !== userId && project.project_manager_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Only project creator or manager can update tasks."
      });
    }

    // Verify assignee exists if provided
    if (assigneeId) {
      const assigneeResult = await pool.query(
        `SELECT id FROM users WHERE id = $1 AND is_active = TRUE`,
        [assigneeId]
      );

      if (assigneeResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Assignee not found or is inactive."
        });
      }
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(priority);
    }
    if (assigneeId !== undefined) {
      updates.push(`assignee_id = $${paramIndex++}`);
      values.push(assigneeId);
    }
    if (startDate !== undefined) {
      updates.push(`start_date = $${paramIndex++}`);
      values.push(startDate);
    }
    if (dueDate !== undefined) {
      updates.push(`due_date = $${paramIndex++}`);
      values.push(dueDate);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update."
      });
    }

    values.push(taskId);
    const query = `
      UPDATE tasks 
      SET ${updates.join(", ")} 
      WHERE id = $${paramIndex} 
      RETURNING *
    `;

    const result = await pool.query(query, values);
    const task = result.rows[0];

    // Fetch assignee name if exists
    if (task.assignee_id) {
      const assigneeRes = await pool.query(
        `SELECT full_name, email FROM users WHERE id = $1`,
        [task.assignee_id]
      );

      if (assigneeRes.rows.length > 0) {
        task.assignee_name = assigneeRes.rows[0].full_name;
        task.assignee_email = assigneeRes.rows[0].email;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Task updated successfully.",
      task: task
    });
  } catch (error) {
    console.error("Update task error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update task."
    });
  }
};

const updateTaskStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body;

    if (!["To Do", "In Progress", "Done"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'To Do', 'In Progress', or 'Done'."
      });
    }

    const result = await pool.query(
      `
      UPDATE tasks 
      SET status = $1 
      WHERE id = $2 
      RETURNING *
      `,
      [status, taskId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found."
      });
    }

    const task = result.rows[0];

    // Fetch assignee name if exists
    if (task.assignee_id) {
      const assigneeRes = await pool.query(
        `SELECT full_name, email FROM users WHERE id = $1`,
        [task.assignee_id]
      );

      if (assigneeRes.rows.length > 0) {
        task.assignee_name = assigneeRes.rows[0].full_name;
        task.assignee_email = assigneeRes.rows[0].email;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Task status updated successfully.",
      task: task
    });
  } catch (error) {
    console.error("Update task status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update task status."
    });
  }
};

const deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    const userResult = await pool.query(
      `SELECT role FROM users WHERE id = $1 AND is_active = true`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive."
      });
    }

    const userRole = userResult.rows[0].role;

    const allowedRoles = [
      "Project Manager",
      "Executive Manager",
      "System Administrator"
    ];

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "Only Project Manager, Executive Manager, or System Administrator can delete tasks."
      });
    }

    const taskResult = await pool.query(
      `SELECT id FROM tasks WHERE id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found."
      });
    }

    await pool.query(
      `DELETE FROM tasks WHERE id = $1`,
      [taskId]
    );

    return res.status(200).json({
      success: true,
      message: "Task deleted successfully."
    });

  } catch (error) {
    console.error("Delete task error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete task."
    });
  }
};

// FIXED assignTask in taskcontroller.js
const assignTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { assigneeId } = req.body;
    const userId = req.user.id;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Task ID is required.",
      });
    }

    if (!assigneeId) {
      return res.status(400).json({
        success: false,
        message: "Assignee ID is required.",
      });
    }

    // Get task + project info
    const taskResult = await pool.query(
      `
      SELECT
        t.id AS task_id,
        t.name AS task_name,
        t.project_id,
        p.name AS project_name,
        p.project_manager_id,
        p.created_by
      FROM tasks t
      INNER JOIN projects p
        ON p.id = t.project_id
      WHERE t.id = $1
      `,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    const task = taskResult.rows[0];

    // Check authorization
    const userRoleResult = await pool.query(
      `SELECT role FROM users WHERE id = $1 AND is_active = TRUE`,
      [userId]
    );

    if (userRoleResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive.",
      });
    }

    const userRole = userRoleResult.rows[0].role;
    const isProjectManager = task.project_manager_id === userId;
    const isProjectCreator = task.created_by === userId;
    const isAdmin =
      userRole === "System Administrator" ||
      userRole === "Executive Manager";

    if (!isProjectManager && !isProjectCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only the Project Manager or Project Creator can assign tasks.",
      });
    }

    // Verify assignee exists and is active
    const assigneeResult = await pool.query(
      `
      SELECT
        id,
        full_name,
        email,
        role
      FROM users
      WHERE id = $1
        AND is_active = TRUE
      `,
      [assigneeId]
    );

    if (assigneeResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Team member not found or inactive.",
      });
    }

    const assignee = assigneeResult.rows[0];

    // Check if assignee is already a project member
    const projectMemberCheck = await pool.query(
      `
      SELECT user_id FROM project_members 
      WHERE project_id = $1 AND user_id = $2
      `,
      [task.project_id, assigneeId]
    );

    // AUTO-ADD to project_members if not already there
    if (projectMemberCheck.rows.length === 0) {
      try {
        await pool.query(
          `
          INSERT INTO project_members (project_id, user_id, role)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
          `,
          [task.project_id, assigneeId, assignee.role || "Member"]
        );
      } catch (error) {
        console.warn("Could not add user to project members:", error);
        // Don't fail the assignment if this fails
      }
    }

    // Assign the task
    const updateResult = await pool.query(
      `
      UPDATE tasks
      SET
        assignee_id = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING
        id,
        project_id,
        name,
        description,
        status,
        priority,
        assignee_id,
        start_date,
        due_date,
        created_by,
        created_at,
        updated_at
      `,
      [assigneeId, taskId]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Task could not be assigned.",
      });
    }

    const updatedTask = updateResult.rows[0];
    updatedTask.assignee_name = assignee.full_name;
    updatedTask.assignee_email = assignee.email;

    return res.status(200).json({
      success: true,
      message: `Task assigned to ${assignee.full_name} successfully.`,
      task: updatedTask,
    });

  } catch (error) {
    console.error("Assign task error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to assign task.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};


// Get tasks assigned to current user
const getMyTasks = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT 
        t.id,
        t.project_id,
        t.name,
        t.description,
        t.status,
        t.priority,
        t.assignee_id,
        t.start_date,
        t.due_date,
        t.created_by,
        t.created_at,
        t.updated_at,
        u.full_name as assignee_name,
        u.email as assignee_email,
        p.name as project_name,
        p.domain as project_domain
      FROM tasks t
      LEFT JOIN users u ON t.assignee_id = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.assignee_id = $1
      ORDER BY t.created_at DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      tasks: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error("Get my tasks error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve your tasks."
    });
  }
};

// Get projects with tasks assigned to current user
const getMyProjects = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT DISTINCT
        p.id,
        p.name,
        p.domain,
        p.status,
        p.about_title,
        p.about_description,
        p.start_date,
        p.deadline,
        p.priority,
        COUNT(t.id)::int as total_tasks,
        COUNT(CASE WHEN t.assignee_id = $1 THEN 1 END)::int as my_tasks
      FROM projects p
      LEFT JOIN tasks t ON p.id = t.project_id
      WHERE t.assignee_id = $1
      GROUP BY p.id
      ORDER BY p.name
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      projects: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error("Get my projects error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve your projects."
    });
  }
};

module.exports = {
  getProjectTasks,
  getTask,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  assignTask,
  getMyTasks,
  getMyProjects
};

// module.exports = {
//   getProjectTasks,
//   getTask,
//   createTask,
//   updateTask,
//   updateTaskStatus,
//   deleteTask,
//   assignTask
// };