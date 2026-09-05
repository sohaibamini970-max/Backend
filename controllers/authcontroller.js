// controllers/authcontroller.js
const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

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
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/* =========================================================
   LOGIN
========================================================= */

const login = async (req, res) => {
    const { email, password } = req.body;

    console.log('🔍 Login attempt for:', email);

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
           FIND USER - Using safeQuery to auto-release connection
        --------------------------------------------------------- */

        const userResult = await safeQuery(
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
            console.log('❌ User not found:', cleanEmail);
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
            console.log('❌ Account disabled:', cleanEmail);
            return res.status(403).json({
                success: false,
                message: "Account is disabled. Contact your administrator.",
            });
        }

        /* ---------------------------------------------------------
           VERIFY PASSWORD
        --------------------------------------------------------- */

        const isPasswordValid = await bcrypt.compare(
            cleanPassword,
            user.password_hash
        );

        if (!isPasswordValid) {
            console.log('❌ Invalid password for:', cleanEmail);
            return res.status(401).json({
                success: false,
                message: "Invalid credentials.",
            });
        }

        /* ---------------------------------------------------------
           UPDATE LAST LOGIN - Using safeQuery
        --------------------------------------------------------- */

        await safeQuery(
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
            console.error("❌ JWT_SECRET is not configured.");
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
                full_name: user.full_name,
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "8h",
            }
        );

        console.log('✅ Login successful for:', cleanEmail);

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
        console.error("❌ Login Error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Internal server error.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
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
        --------------------------------------------------------- */

        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
        }

        console.log('🔍 Password change request for user:', userId);

        /* ---------------------------------------------------------
           GET PASSWORDS
        --------------------------------------------------------- */

        const { password, confirmPassword } = req.body;

        /* ---------------------------------------------------------
           REQUIRED FIELDS
        --------------------------------------------------------- */

        if (!password || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "New password and confirm password are required.",
            });
        }

        /* ---------------------------------------------------------
           CONVERT TO STRING
        --------------------------------------------------------- */

        const newPassword = String(password);
        const newConfirmPassword = String(confirmPassword);

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
                message: "Password must be at least 8 characters long.",
            });
        }

        /* ---------------------------------------------------------
           GET CURRENT USER - Using safeQuery
        --------------------------------------------------------- */

        const userResult = await safeQuery(
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
                message: "Your account is disabled.",
            });
        }

        /* ---------------------------------------------------------
           PREVENT SAME PASSWORD
        --------------------------------------------------------- */

        const isSamePassword = await bcrypt.compare(
            newPassword,
            user.password_hash
        );

        if (isSamePassword) {
            return res.status(400).json({
                success: false,
                message: "New password must be different from your current password.",
            });
        }

        /* ---------------------------------------------------------
           HASH NEW PASSWORD
        --------------------------------------------------------- */

        const newPasswordHash = await bcrypt.hash(newPassword, 12);

        /* ---------------------------------------------------------
           UPDATE PASSWORD - Using safeQuery
        --------------------------------------------------------- */

        const updateResult = await safeQuery(
            `
            UPDATE users
            SET 
                password_hash = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING id
            `,
            [newPasswordHash, userId]
        );

        if (updateResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        console.log('✅ Password changed for user:', userId);

        return res.status(200).json({
            success: true,
            message: "Password changed successfully.",
        });

    } catch (error) {
        console.error("❌ Change Password Error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Internal server error.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

/* =========================================================
   GET CURRENT USER (Optional helper)
========================================================= */

const getCurrentUser = async (req, res) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
        }

        const result = await safeQuery(
            `
            SELECT
                id,
                full_name,
                email,
                role,
                is_active,
                created_at,
                last_login_at
            FROM users
            WHERE id = $1
            `,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        return res.status(200).json({
            success: true,
            user: result.rows[0],
        });

    } catch (error) {
        console.error("❌ Get current user error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error.",
        });
    }
};

/* =========================================================
   LOGOUT (Optional - JWT is stateless)
========================================================= */

const logout = async (req, res) => {
    // JWT is stateless, so logout is handled client-side
    // by removing the token from localStorage
    return res.status(200).json({
        success: true,
        message: "Logged out successfully.",
    });
};

module.exports = {
    login,
    changePassword,
    getCurrentUser,
    logout,
};
