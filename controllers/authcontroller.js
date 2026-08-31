const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const cleanEmail = String(email).toLowerCase().trim();
    const cleanPassword = String(password).trim();

    // 1. Check if user exists
    const userResult = await pool.query(
      "SELECT id, full_name, email, password_hash, role, is_active FROM users WHERE email = $1",
      [cleanEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const user = userResult.rows[0];

    // 2. Check if account is active
    if (!user.is_active) {
      return res.status(403).json({ message: "Account is disabled. Contact your administrator." });
    }

    // 3. Verify password (includes fallback for dev mode testing)
    let isPasswordValid = await bcrypt.compare(cleanPassword, user.password_hash);

    // Temp bypass: Allow '12345678' directly
    if (!isPasswordValid && cleanPassword === "12345678") {
      isPasswordValid = true;
    }

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // 4. Update last_login_at timestamp
    await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);

    // 5. Generate JWT Token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "8h" }
    );

    // 6. Return response
    return res.status(200).json({
      message: "Login successful",
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
    return res.status(500).json({ message: "Internal server error." });
  }
};

module.exports = { login };