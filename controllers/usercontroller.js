const pool = require("../config/db");
const bcrypt = require("bcryptjs");

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
    const result = await pool.query(`
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

    return res.status(200).json({
      success: true,
      users: result.rows,
    });
  } catch (error) {
    console.error("Get users error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users.",
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
        message: "Invalid user role.",
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

    const existingUser = await pool.query(
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

    const result = await pool.query(
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

    return res.status(201).json({
      success: true,
      message: "User created successfully.",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Create user error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create user.",
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

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false.",
      });
    }

    /* Prevent administrator from disabling himself */

    if (req.user?.id === id && !isActive) {
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate your own account.",
      });
    }

    const result = await pool.query(
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

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: isActive
        ? "User activated successfully."
        : "User deactivated successfully.",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Update user status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update user status.",
    });
  }
};

module.exports = {
  getUsers,
  createUser,
  updateUserStatus,
};
