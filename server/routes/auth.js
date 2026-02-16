import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import validator from "validator";
import nodemailer from "nodemailer";
import { authenticateToken } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { registerValidator, loginValidator } from "../middleware/validators.js";

const router = Router();
const saltRounds = 10;

/**
 * Helper: Generate access + refresh tokens for a user
 */
const generateTokens = async (userId, db) => {
  const accessToken = jwt.sign(
    { sub: userId, type: "access" },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );

  const { rows } = await db.query(
    `INSERT INTO app2.tokens (user_id, type, expires_at, used)
     VALUES ($1, 'refresh', NOW() + interval '7 days', false)
     RETURNING id`,
    [userId]
  );
  const tokenId = rows[0].id;

  const refreshToken = jwt.sign(
    { sub: userId, jti: tokenId, type: "refresh" },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );

  return { accessToken, refreshToken };
};

/**
 * Helper: Create email transporter
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

/**
 * POST /api/register
 * Create new user account + send verification email
 */
router.post("/register", authLimiter, registerValidator, async (req, res) => {
  const { first_name, last_name, email, password, confirmPassword } = req.body;
  const db = req.app.locals.db;

  try {
    // Validation
    if (!first_name || !last_name || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password too short" });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    // Check if email already exists
    const existingUser = await db.query(
      "SELECT * FROM app2.users WHERE email = $1",
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "Email already in use" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Store user data in token data field (pending verification)
    const tokenData = JSON.stringify({
      first_name,
      last_name,
      email,
      password_hash: hashedPassword,
    });

    const { rows } = await db.query(
      "INSERT INTO app2.tokens (user_id, type, expires_at, used, data) VALUES (NULL, 'email_verify', NOW() + interval '15 minutes', false, $1) RETURNING id",
      [tokenData]
    );
    const tokenId = rows[0].id;

    // Create JWT verification token
    const token = jwt.sign(
      { type: "email_verify", jti: tokenId },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    const verifyLink = `http://localhost:${process.env.PORT}/api/verify-email?token=${encodeURIComponent(token)}`;

    // Send verification email
    if (process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_HOST) {
      try {
        const transporter = createTransporter();
        await transporter.sendMail({
          from: `"SmartCart" <${process.env.SMTP_USER}>`,
          to: email,
          subject: "Verify your email",
          html: `<p>Click <a href="${verifyLink}">here</a> to verify your email</p>`,
        });
      } catch (emailErr) {
        console.error("Email sending error:", emailErr);
        await db.query("DELETE FROM app2.tokens WHERE id = $1", [tokenId]);
        return res.status(500).json({ message: "Error sending verification email" });
      }
    } else {
      console.warn("SMTP not configured. Using verification link:", verifyLink);
      if (process.env.NODE_ENV !== "production") {
        return res.status(201).json({
          message: "Registration successful (DEV MODE)",
          verifyLink,
        });
      }
    }

    return res.status(201).json({
      message: "Registration successful, please check your email to verify account",
    });
  } catch (err) {
    console.error("Registration error:", err);
    return res.status(500).json({ message: "Error registering user" });
  }
});

/**
 * GET /api/verify-email
 * Verify email and create user account
 */
router.get("/verify-email", async (req, res) => {
  const token = req.query.token;
  const db = req.app.locals.db;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.type !== "email_verify") {
      return res.status(400).json({ message: "Invalid token type" });
    }

    const result = await db.query(
      "SELECT * FROM app2.tokens WHERE id = $1 AND type = 'email_verify' AND expires_at > NOW();",
      [payload.jti]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ message: "Token not found or expired" });
    }

    const tokenRow = result.rows[0];

    if (tokenRow.used) {
      return res.status(400).json({ message: "Token already used" });
    }

    if (!tokenRow.data) {
      return res.status(400).json({ message: "Invalid token data" });
    }

    const userData = JSON.parse(tokenRow.data);
    const { first_name, last_name, email, password_hash } = userData;

    // Create user account
    const userResult = await db.query(
      `INSERT INTO app2.users 
       (first_name, last_name, email, password_hash, email_verified_at) 
       VALUES ($1, $2, $3, $4, NOW()) 
       ON CONFLICT (email) DO NOTHING
       RETURNING id, first_name, last_name, email`,
      [first_name, last_name, email, password_hash]
    );

    if (userResult.rowCount === 0) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const user = userResult.rows[0];

    // Mark token as used
    await db.query("UPDATE app2.tokens SET used = true WHERE id = $1", [payload.jti]);

    // Generate access + refresh tokens
    const { accessToken, refreshToken } = await generateTokens(user.id, db);

    // Set refresh token cookie
    // Use sameSite: "none" for cross-origin (Tailscale) support on mobile
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: false, // Changed for HTTP (Tailscale) // Required for sameSite: "none" and mobile Safari
      sameSite: "none", // Allow cross-origin cookies (Tailscale IP)
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.redirect("http://localhost:5173/verification-confirmed");
  } catch (err) {
    console.error("JWT Verification Detail:", err.message);

    if (err.name === "JsonWebTokenError") {
      return res.status(400).json({ message: "Invalid token signature" });
    }
    if (err.name === "TokenExpiredError") {
      return res.status(400).json({ message: "Token expired - please register again" });
    }

    return res.status(400).json({ message: "Invalid or expired token" });
  }
});

/**
 * POST /api/login
 * Login with email/username + password
 */
router.post("/login", authLimiter, loginValidator, async (req, res) => {
  const { email, username, password } = req.body;
  const db = req.app.locals.db;

  if ((!email && !username) || !password) {
    return res.status(400).json({ message: "Email/username and password are required" });
  }

  try {
    let results;
    if (email) {
      results = await db.query("SELECT * FROM app2.users WHERE email = $1", [email]);
    } else {
      results = await db.query("SELECT * FROM app2.users WHERE username = $1", [username]);
    }

    if (results.rows.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const user = results.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const { accessToken, refreshToken } = await generateTokens(user.id, db);

    // Use sameSite: "none" for cross-origin (Tailscale) support on mobile
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: false, // Changed for HTTP (Tailscale) // Required for sameSite: "none" and mobile Safari
      sameSite: "none", // Allow cross-origin cookies (Tailscale IP)
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      user: {
        id: user.id,
        first_name: user.first_name,
        email: user.email,
        username: user.username,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Error logging in" });
  }
});

/**
 * POST /api/refresh
 * Refresh access token using refresh token
 */
router.post("/refresh", async (req, res) => {
  const incomingToken = req.cookies.refreshToken || req.body.refreshToken;
  const db = req.app.locals.db;

  if (!incomingToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(incomingToken, process.env.JWT_REFRESH_SECRET);

    if (payload.type !== "refresh") {
      return res.status(403).json({ message: "Invalid token type" });
    }

    const { rows } = await db.query(
      "SELECT * FROM app2.tokens WHERE id = $1 AND user_id = $2 AND type = 'refresh'",
      [payload.jti, payload.sub]
    );

    if (rows.length === 0) {
      // Reuse detected - delete all refresh tokens
      await db.query(
        "DELETE FROM app2.tokens WHERE user_id = $1 AND type = 'refresh'",
        [payload.sub]
      );
      return res.status(403).json({ message: "Token reuse detected" });
    }

    // Delete current token
    await db.query("DELETE FROM app2.tokens WHERE id = $1", [payload.jti]);

    // Generate new tokens
    const { accessToken, refreshToken } = await generateTokens(payload.sub, db);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: false, // Changed for HTTP (Tailscale) // Required for sameSite: "none" and mobile Safari
      sameSite: "none", // Allow cross-origin cookies (Tailscale IP)
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ accessToken, refreshToken });
  } catch (err) {
    console.error("Refresh error:", err);
    return res.status(403).json({ message: "Invalid refresh token" });
  }
});

/**
 * GET /api/me
 * Get current user info
 */
router.get("/me", authenticateToken, async (req, res) => {
  const db = req.app.locals.db;

  try {
    const results = await db.query(
      "SELECT id, first_name, last_name, email, username, parent_id FROM app2.users WHERE id = $1",
      [req.userId]
    );

    if (results.rows.length === 0) {
      return res.status(404).json({ user: null });
    }

    return res.status(200).json({ user: results.rows[0] });
  } catch (err) {
    console.error("Get user error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/logout
 * Logout current session
 */
router.post("/logout", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  const db = req.app.locals.db;

  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      if (payload?.jti && payload?.sub) {
        await db.query(
          "DELETE FROM app2.tokens WHERE id = $1 AND user_id = $2 AND type = 'refresh'",
          [payload.jti, payload.sub]
        );
      }
    } catch (e) {
      console.log("Logout token verification failed:", e.message);
    }
  }

  res.clearCookie("refreshToken", { path: "/" });
  return res.status(200).json({ message: "Logged out" });
});

/**
 * POST /api/logout-all
 * Logout from all devices
 */
router.post("/logout-all", authenticateToken, async (req, res) => {
  const db = req.app.locals.db;

  try {
    await db.query(
      "DELETE FROM app2.tokens WHERE user_id = $1 AND type = 'refresh'",
      [req.userId]
    );

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: false, // Changed for HTTP (Tailscale)
      sameSite: "none",
      path: "/",
    });

    return res.status(200).json({ message: "Logged out from all devices" });
  } catch (err) {
    console.error("Logout all error:", err);
    return res.status(500).json({ message: "Error logging out from all devices" });
  }
});

/**
 * PUT /api/user/password
 * Change password (requires current password)
 */
router.put("/user/password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword, confirmNewPassword } = req.body;
  const db = req.app.locals.db;

  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return res.status(400).json({ message: "Missing fields" });
  }

  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ message: "Password too weak" });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ message: "New password must differ from current" });
  }

  try {
    const { rows } = await db.query(
      "SELECT password_hash FROM app2.users WHERE id = $1",
      [req.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid current password" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    await db.query(
      "UPDATE app2.users SET password_hash = $1 WHERE id = $2",
      [hashedPassword, req.userId]
    );

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Password change error:", err);
    return res.status(500).json({ message: "Error updating password" });
  }
});

/**
 * POST /api/forgot-password
 * Send password reset email
 */
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const db = req.app.locals.db;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  try {
    const results = await db.query(
      "SELECT id FROM app2.users WHERE email = $1",
      [email]
    );

    if (results.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const userId = results.rows[0].id;
    const { rows } = await db.query(
      `INSERT INTO app2.tokens (user_id, type, expires_at, used, data)
       VALUES ($1, 'reset_password', NOW() + interval '15 minutes', false, NULL)
       RETURNING id`,
      [userId]
    );

    const tokenId = rows[0].id;
    const token = jwt.sign(
      { sub: userId, jti: tokenId, type: "reset_password" },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    const resetUrl = `http://localhost:5173/reset-password?token=${token}`;

    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"SmartCart" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Reset your password",
      html: `<p>Click <a href="${resetUrl}">here</a> to reset your password</p>`,
    });

    return res.status(200).json({ message: "Password reset email sent" });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ message: "Error sending reset email" });
  }
});

/**
 * POST /api/reset-password
 * Reset password with token
 */
router.post("/reset-password", async (req, res) => {
  const { token, newPassword, confirmNewPassword } = req.body;
  const db = req.app.locals.db;

  if (!token || !newPassword || !confirmNewPassword) {
    return res.status(400).json({ message: "Missing fields" });
  }

  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ message: "Password too weak" });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decodedToken.sub;

    const { rows } = await db.query(
      `SELECT expires_at, used FROM app2.tokens
       WHERE user_id = $1 AND type = 'reset_password' AND id = $2 AND expires_at > NOW()`,
      [userId, decodedToken.jti]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Token not found or expired" });
    }

    const tokenData = rows[0];

    if (tokenData.used) {
      return res.status(400).json({ message: "Token already used" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const results = await db.query(
      `SELECT password_hash FROM app2.users WHERE id = $1`,
      [userId]
    );

    if (results.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const oldPassword = results.rows[0].password_hash;
    const isSame = await bcrypt.compare(newPassword, oldPassword);

    if (isSame) {
      return res.status(400).json({ message: "New password must differ from current" });
    }

    await db.query(
      `UPDATE app2.users SET password_hash = $1 WHERE id = $2`,
      [hashedPassword, userId]
    );

    await db.query(
      `UPDATE app2.tokens SET used = true WHERE id = $1`,
      [decodedToken.jti]
    );

    return res.status(200).json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ message: "Error resetting password" });
  }
});

export default router;
