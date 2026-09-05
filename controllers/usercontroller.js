// controllers/usercontroller.js
const pool = require("../config/db");
const bcrypt = require("bcryptjs");

/* =========================================================
   HELPER: SAFE DATABASE QUERY WITH CONNECTION RELEASE
========================================================= */

const safeQuery = async (text, params) => {
    const client = await pool.connect();
    try {
        const result = await client.query(text, params);
        return result;
    } finally {
        client.release(); // ✅ Always release connection back to pool
    }
};

const safeTransaction = async (callback) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } finally {
        client.release();
    }
};

/* =========================================================
   ALLOWED ROLES
========================================================= */

const ALLOWED_ROLES = [
  "System Administrator",
  "Executive Manager",
  "Project Manager",
  "Member",
];

/* =========================================================
   GET ALL USERS
   GET /api/users
========================================================= */

const getUsers = async (req, res) => {
  try {
    console.log('🔍 Fetching all users for user:', req.user?.id);

    const result = await safeQuery(`
      SELECT
        id,
        email,
        full_name,
        role,
        is_active,
        last_login_at,
        created_at,
        updated_at,
        job_title
      FROM users
      ORDER BY created_at DESC
    `);

    console.log(`✅ Found ${result.rows.length} users`);

    return res.status(200).json({
      success: true,
      users: result.rows,
    });

  } catch (error) {
    console.error("❌ Get users error:", error);
    console.error("Stack:", error.stack);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users.",
      ...(process.env.NODE_ENV !== 'production' && { error: error.message })
    });
  }
};

/* =========================================================
   GET USER BY ID
   GET /api/users/:id
========================================================= */

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🔍 Fetching user by ID:', { id, user: req.user?.id });

    const result = await safeQuery(
      `
      SELECT
        id,
        email,
        full_name,
        role,
        is_active,
        last_login_at,
        created_at,
        updated_at,
        job_title
      FROM users
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    console.log('✅ User found:', id);

    return res.status(200).json({
      success: true,
      user: result.rows[0],
    });

  } catch (error) {
    console.error("❌ Get user by ID error:", error);
    console.error("Stack:", error.stack);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch user.",
      ...(process.env.NODE_ENV !== 'production' && { error: error.message })
    });
  }
};

/* =========================================================
   CREATE USER
   POST /api/users
========================================================= */

const createUser = async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      role,
      jobTitle,
    } = req.body;

    console.log('🔍 Creating user:', { email, role, jobTitle, user: req.user?.id });

    /* -----------------------------------------------------
       VALIDATION
    ----------------------------------------------------- */

    if (!fullName || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, password and role are required.",
      });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user role. Allowed roles: " + ALLOWED_ROLES.join(", "),
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    /* -----------------------------------------------------
       CHECK EXISTING EMAIL
    ----------------------------------------------------- */

    const existingUser = await safeQuery(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists.",
      });
    }

    /* -----------------------------------------------------
       HASH PASSWORD
    ----------------------------------------------------- */

    const passwordHash = await bcrypt.hash(password, 10);

    /* -----------------------------------------------------
       INSERT USER
    ----------------------------------------------------- */

    const result = await safeQuery(
      `
      INSERT INTO users (
        email,
        password_hash,
        full_name,
        role,
        is_active,
        job_title
      )
      VALUES ($1, $2, $3, $4, true, $5)
      RETURNING
        id,
        email,
        full_name,
        role,
        is_active,
        last_login_at,
        created_at,
        updated_at,
        job_title
      `,
      [
        normalizedEmail,
        passwordHash,
        fullName.trim(),
        role,
        jobTitle?.trim() || null,
      ]
    );

    console.log('✅ User created:', result.rows[0].id);

    return res.status(201).json({
      success: true,
      message: "User created successfully.",
      user: result.rows[0],
    });

  } catch (error) {
    console.error("❌ Create user error:", error);
    console.error("Stack:", error.stack);

    return res.status(500).json({
      success: false,
      message: "Failed to create user.",
      ...(process.env.NODE_ENV !== 'production' && { error: error.message })
    });
  }
};

/* =========================================================
   UPDATE USER
   PATCH /api/users/:id
========================================================= */

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, role, jobTitle, email } = req.body;

    console.log('🔍 Updating user:', { id, fullName, role, email, user: req.user?.id });

    /* -----------------------------------------------------
       VALIDATION
    ----------------------------------------------------- */

    if (!fullName && !role && !jobTitle && !email) {
      return res.status(400).json({
        success: false,
        message: "At least one field is required to update.",
      });
    }

    if (role && !ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user role. Allowed roles: " + ALLOWED_ROLES.join(", "),
      });
    }

    /* -----------------------------------------------------
       CHECK USER EXISTS
    ----------------------------------------------------- */

    const existingUser = await safeQuery(
      `SELECT id, email FROM users WHERE id = $1`,
      [id]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (fullName) {
      updates.push(`full_name = $${paramIndex}`);
      values.push(fullName.trim());
      paramIndex++;
    }

    if (role) {
      updates.push(`role = $${paramIndex}`);
      values.push(role);
      paramIndex++;
    }

    if (jobTitle !== undefined) {
      updates.push(`job_title = $${paramIndex}`);
      values.push(jobTitle?.trim() || null);
      paramIndex++;
    }

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      
      // Check if email is already taken by another user
      const emailCheck = await safeQuery(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2`,
        [normalizedEmail, id]
      );

      if (emailCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "This email is already in use by another user.",
        });
      }

      updates.push(`email = $${paramIndex}`);
      values.push(normalizedEmail);
      paramIndex++;
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE users
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING
        id,
        email,
        full_name,
        role,
        is_active,
        last_login_at,
        created_at,
        updated_at,
        job_title
    `;

    const result = await safeQuery(query, values);

    console.log('✅ User updated:', id);

    return res.status(200).json({
      success: true,
      message: "User updated successfully.",
      user: result.rows[0],
    });

  } catch (error) {
    console.error("❌ Update user error:", error);
    console.error("Stack:", error.stack);

    return res.status(500).json({
      success: false,
      message: "Failed to update user.",
      ...(process.env.NODE_ENV !== 'production' && { error: error.message })
    });
  }
};

/* =========================================================
   ACTIVATE / DEACTIVATE USER
   PATCH /api/users/:id/status
========================================================= */

const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    console.log('🔍 Updating user status:', { id, isActive, user: req.user?.id });

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false.",
      });
    }

    /* -----------------------------------------------------
       Prevent administrator from disabling himself
    ----------------------------------------------------- */
    if (req.user?.id === id && !isActive) {
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate your own account.",
      });
    }

    /* -----------------------------------------------------
       Check user exists
    ----------------------------------------------------- */
    const userCheck = await safeQuery(
      `SELECT id FROM users WHERE id = $1`,
      [id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    /* -----------------------------------------------------
       Update user status
    ----------------------------------------------------- */
    const result = await safeQuery(
      `
      UPDATE users
      SET
        is_active = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        email,
        full_name,
        role,
        is_active,
        last_login_at,
        created_at,
        updated_at,
        job_title
      `,
      [isActive, id]
    );

    console.log(`✅ User ${isActive ? 'activated' : 'deactivated'}:`, id);

    return res.status(200).json({
      success: true,
      message: isActive
        ? "User activated successfully."
        : "User deactivated successfully.",
      user: result.rows[0],
    });

  } catch (error) {
    console.error("❌ Update user status error:", error);
    console.error("Stack:", error.stack);

    return res.status(500).json({
      success: false,
      message: "Failed to update user status.",
      ...(process.env.NODE_ENV !== 'production' && { error: error.message })
    });
  }
};

/* =========================================================
   DELETE USER
   DELETE /api/users/:id
========================================================= */

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🔍 Deleting user:', { id, user: req.user?.id });

    /* -----------------------------------------------------
       Prevent administrator from deleting himself
    ----------------------------------------------------- */
    if (req.user?.id === id) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account.",
      });
    }

    /* -----------------------------------------------------
       Check if user exists
    ----------------------------------------------------- */
    const userCheck = await safeQuery(
      `SELECT id, full_name FROM users WHERE id = $1`,
      [id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    /* -----------------------------------------------------
       Check if user has assigned projects or tasks
    ----------------------------------------------------- */
    const projectCheck = await safeQuery(
      `
      SELECT 
        (SELECT COUNT(*) FROM projects WHERE project_manager_id = $1) as managed_projects,
        (SELECT COUNT(*) FROM tasks WHERE assignee_id = $1) as assigned_tasks,
        (SELECT COUNT(*) FROM project_reports WHERE submitted_by = $1) as submitted_reports
      `,
      [id]
    );

    const hasAssociations = 
      parseInt(projectCheck.rows[0].managed_projects) > 0 ||
      parseInt(projectCheck.rows[0].assigned_tasks) > 0 ||
      parseInt(projectCheck.rows[0].submitted_reports) > 0;

    if (hasAssociations) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete user. They have assigned projects, tasks, or reports.",
        details: {
          managedProjects: parseInt(projectCheck.rows[0].managed_projects),
          assignedTasks: parseInt(projectCheck.rows[0].assigned_tasks),
          submittedReports: parseInt(projectCheck.rows[0].submitted_reports),
        },
      });
    }

    /* -----------------------------------------------------
       Delete user
    ----------------------------------------------------- */
    await safeQuery(
      `DELETE FROM users WHERE id = $1`,
      [id]
    );

    console.log('✅ User deleted:', id);

    return res.status(200).json({
      success: true,
      message: "User deleted successfully.",
    });

  } catch (error) {
    console.error("❌ Delete user error:", error);
    console.error("Stack:", error.stack);

    return res.status(500).json({
      success: false,
      message: "Failed to delete user.",
      ...(process.env.NODE_ENV !== 'production' && { error: error.message })
    });
  }
};

/* =========================================================
   GET USER STATS
   GET /api/users/stats
========================================================= */

const getUserStats = async (req, res) => {
  try {
    console.log('🔍 Fetching user stats');

    const result = await safeQuery(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
        COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_users,
        COUNT(CASE WHEN role = 'System Administrator' THEN 1 END) as system_admins,
        COUNT(CASE WHEN role = 'Executive Manager' THEN 1 END) as executive_managers,
        COUNT(CASE WHEN role = 'Project Manager' THEN 1 END) as project_managers,
        COUNT(CASE WHEN role = 'Member' THEN 1 END) as members
      FROM users
    `);

    console.log('✅ User stats fetched');

    return res.status(200).json({
      success: true,
      stats: result.rows[0],
    });

  } catch (error) {
    console.error("❌ Get user stats error:", error);
    console.error("Stack:", error.stack);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch user stats.",
      ...(process.env.NODE_ENV !== 'production' && { error: error.message })
    });
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
  deleteUser,
  getUserStats,
};
