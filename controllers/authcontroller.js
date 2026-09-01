const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

/* =========================================================
   LOGIN
========================================================= */

const login = async (req, res) => {
  const { email, password } = req.body;

  /* ---------------------------------------------------------
     BASIC VALIDATION
  --------------------------------------------------------- */

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required.",
    });
  }

  try {
    const cleanEmail = String(email).toLowerCase().trim();
    const cleanPassword = String(password).trim();

    /* ---------------------------------------------------------
       FIND USER
    --------------------------------------------------------- */

    const userResult = await pool.query(
      `
      SELECT
        id,
        full_name,
        email,
        password_hash,
        role,
        is_active
      FROM users
      WHERE LOWER(email) = $1
      LIMIT 1
      `,
      [cleanEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    const user = userResult.rows[0];

    /* ---------------------------------------------------------
       CHECK ACCOUNT STATUS
    --------------------------------------------------------- */

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message:
          "Account is disabled. Contact your administrator.",
      });
    }

    /* ---------------------------------------------------------
       VERIFY PASSWORD
       
       IMPORTANT:
       There is NO hardcoded password here.
       
       12345678 will work only if the database contains
       the bcrypt hash of 12345678.
    --------------------------------------------------------- */

    const isPasswordValid = await bcrypt.compare(
      cleanPassword,
      user.password_hash
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    /* ---------------------------------------------------------
       UPDATE LAST LOGIN
    --------------------------------------------------------- */

    await pool.query(
      `
      UPDATE users
      SET last_login_at = NOW()
      WHERE id = $1
      `,
      [user.id]
    );

    /* ---------------------------------------------------------
       JWT SECRET CHECK
    --------------------------------------------------------- */

    if (!process.env.JWT_SECRET) {
      console.error(
        "JWT_SECRET is not configured."
      );

      return res.status(500).json({
        success: false,
        message: "Server authentication configuration error.",
      });
    }

    /* ---------------------------------------------------------
       CREATE JWT
    --------------------------------------------------------- */

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "8h",
      }
    );

    /* ---------------------------------------------------------
       RESPONSE
    --------------------------------------------------------- */

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
      },
    });

  } catch (error) {
    console.error("Login Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};


/* =========================================================
   CHANGE PASSWORD
========================================================= */

const changePassword = async (req, res) => {
  try {
    /* ---------------------------------------------------------
       GET AUTHENTICATED USER
       
       The user ID comes from the JWT middleware.
       
       DO NOT accept userId from req.body.
       Otherwise one user could potentially change another
       user's password.
    --------------------------------------------------------- */

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    /* ---------------------------------------------------------
       GET PASSWORDS
    --------------------------------------------------------- */

    const {
      password,
      confirmPassword,
    } = req.body;

    /* ---------------------------------------------------------
       REQUIRED FIELDS
    --------------------------------------------------------- */

    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message:
          "New password and confirm password are required.",
      });
    }

    /* ---------------------------------------------------------
       CONVERT TO STRING
    --------------------------------------------------------- */

    const newPassword = String(password);
    const newConfirmPassword = String(
      confirmPassword
    );

    /* ---------------------------------------------------------
       PASSWORD MATCH
    --------------------------------------------------------- */

    if (newPassword !== newConfirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match.",
      });
    }

    /* ---------------------------------------------------------
       PASSWORD LENGTH
    --------------------------------------------------------- */

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters long.",
      });
    }

    /* ---------------------------------------------------------
       GET CURRENT USER
    --------------------------------------------------------- */

    const userResult = await pool.query(
      `
      SELECT
        id,
        password_hash,
        is_active
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = userResult.rows[0];

    /* ---------------------------------------------------------
       CHECK ACCOUNT
    --------------------------------------------------------- */

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message:
          "Your account is disabled.",
      });
    }

    /* ---------------------------------------------------------
       PREVENT SAME PASSWORD
       
       This is optional but recommended.
       
       If the user enters the same password they already use,
       don't create another hash unnecessarily.
    --------------------------------------------------------- */

    const isSamePassword = await bcrypt.compare(
      newPassword,
      user.password_hash
    );

    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be different from your current password.",
      });
    }

    /* ---------------------------------------------------------
       HASH NEW PASSWORD
       
       bcryptjs automatically creates a new salt.
       
       The resulting hash will be stored in password_hash.
    --------------------------------------------------------- */

    const newPasswordHash = await bcrypt.hash(
      newPassword,
      12
    );

    /* ---------------------------------------------------------
       UPDATE PASSWORD
    --------------------------------------------------------- */

    const updateResult = await pool.query(
      `
      UPDATE users
      SET password_hash = $1
      WHERE id = $2
      RETURNING id
      `,
      [
        newPasswordHash,
        userId,
      ]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });

  } catch (error) {
    console.error(
      "Change Password Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

module.exports = {
  login,
  changePassword,
};
