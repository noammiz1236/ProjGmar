import express from "express";
import morgan from "morgan";
import { config } from "dotenv";
import cron from "node-cron";
import { processAllFiles } from "./db/sortfolder.js";
import bcrypt from "bcrypt";
import cors from "cors";
import validator from "validator";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import pg from "pg";

config();
const port = 3000;
const app = express();
const saltRounds = 10;

const { Pool } = pg;
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// --- Middleware לאימות טוקן (מוגדר בחוץ כדי שיהיה זמין לכולם) ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Access token required" });

  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err)
      return res.status(403).json({ message: "Invalid or expired token" });
    req.userId = payload.userId;
    next();
  });
};

// --- פונקציה ליצירת טוקנים ---
const generateTokens = async (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  });

  const { rows } = await db.query(
    "INSERT INTO app.refresh_tokens (user_id, expires_at) VALUES ($1, NOW() + interval '7 days') RETURNING id",
    [userId],
  );
  const tokenId = rows[0].id;

  const refreshToken = jwt.sign(
    { userId, jti: tokenId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d" },
  );

  return { accessToken, refreshToken };
};

// Middleware הגדרות כלליות
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

// ROUTES

// REGISTER
app.post("/api/register", async (req, res) => {
  const { first_name, last_name, email, password } = req.body;
  try {
    if (!validator.isEmail(email))
      return res.status(400).json({ message: "Invalid email format" });
    if (password.length < 8)
      return res.status(400).json({ message: "Password too short" });

    const existingUser = await db.query(
      "SELECT * FROM app.users WHERE email = $1",
      [email],
    );
    if (existingUser.rows.length > 0)
      return res.status(400).json({ message: "Email already in use" });

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const result = await db.query(
      "INSERT INTO app.users (first_name, last_name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, first_name, last_name, email",
      [first_name, last_name, email, hashedPassword],
    );

    const user = result.rows[0];
    const { accessToken, refreshToken } = await generateTokens(user.id);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/refresh",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({ user, accessToken });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error registering user" });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const results = await db.query("SELECT * FROM app.users WHERE email = $1", [
      email,
    ]);
    if (results.rows.length === 0)
      return res.status(400).json({ message: "Invalid credentials" });

    const user = results.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const { accessToken, refreshToken } = await generateTokens(user.id);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/refresh",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      user: { id: user.id, first_name: user.first_name, email: user.email },
      accessToken,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error logging in" });
  }
});

// REFRESH
app.post("/api/refresh", async (req, res) => {
  const incomingToken = req.cookies.refreshToken;
  if (!incomingToken) return res.status(401).json({ message: "Unauthorized" });

  try {
    const payload = jwt.verify(incomingToken, process.env.JWT_REFRESH_SECRET);
    const { rows } = await db.query(
      "SELECT * FROM app.refresh_tokens WHERE id = $1 AND user_id = $2",
      [payload.jti, payload.userId],
    );
    console.log("Payload data:", payload);
    console.log("Rows data:", rows);

    if (rows.length === 0) {
      await db.query("DELETE FROM app.refresh_tokens WHERE user_id = $1", [
        payload.userId,
      ]);
      return res.status(403).json({ message: "Token reuse detected" });
    }

    await db.query("DELETE FROM app.refresh_tokens WHERE id = $1", [
      payload.jti,
    ]);
    const { accessToken, refreshToken } = await generateTokens(payload.userId);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/refresh",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ accessToken });
  } catch (err) {
    return res.status(403).json({ message: "Invalid refresh token" });
  }
});

// ME (שימוש ב-Middleware החדש)
app.get("/api/me", authenticateToken, async (req, res) => {
  try {
    const results = await db.query(
      "SELECT id, first_name, last_name, email FROM app.users WHERE id = $1",
      [req.userId],
    );

    if (results.rows.length === 0) return res.status(404).json({ user: null });

    return res.status(200).json({ user: results.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// LOGOUT
app.post("/api/logout", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (refreshToken) {
    try {
      const payload = jwt.decode(refreshToken);
      if (payload?.jti) {
        await db.query("DELETE FROM app.refresh_tokens WHERE id = $1", [
          payload.jti,
        ]);
      }
    } catch (e) {}
  }
  res.clearCookie("refreshToken", { path: "/api/refresh" });
  return res.status(200).json({ message: "Logged out" });
});

// Logout מכל המכשירים
app.post("/api/logout-all", authenticateToken, async (req, res) => {
  const userId = req.userId; // מזהה המשתמש מ־JWT

  try {
    // מוחק את כל ה-refresh tokens של המשתמש מה־DB
    await db.query("DELETE FROM app.refresh_tokens WHERE user_id = $1", [
      userId,
    ]);

    // מנקה את ה-cookie בצד הלקוח
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      path: "/",
    });

    return res.status(200).json({ message: "Logged out from all devices" });
  } catch (err) {
    console.error("Error logging out from all devices:", err);
    return res
      .status(500)
      .json({ message: "Error logging out from all devices" });
  }
});

// STORE (דוגמה לאבטחת ה-Route במידת הצורך - הוסף authenticateToken אם תרצה)
app.get("/api/store", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;
    const offset = parseInt(req.query.offset) || 0;

    const results = await db.query(
      `SELECT DISTINCT ON (i.id, c.id)
            i.id AS item_id, i.name AS item_name, p.price AS price,
            c.id AS chain_id, c.name AS chain_name
         FROM app.items i
         JOIN app.prices p ON i.id = p.item_id
         JOIN app.branches b ON p.branch_id = b.id
         JOIN app.chains c ON b.chain_id = c.id
         ORDER BY i.id, c.id, p.price
         LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const products = results.rows;
    return res.status(200).json({
      products,
      hasMore: products.length === limit,
      nextOffset: offset + products.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching products" });
  }
});

app.put("/api/user/password", authenticateToken, async (req, res) => {
  const userId = req.userId;
  const { currentPassword, newPassword, confirmNewPassword } = req.body;

  // 1️⃣ בדיקות בסיסיות
  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return res.status(400).json({ message: "Missing fields" });
  }
  if (currentPassword.length < 8) {
    return res.status(400).json({ message: "Password too weak" });
  }
  if (currentPassword === newPassword) {
    return res
      .status(400)
      .json({ message: "New password must differ from current" });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ message: "Password too weak" });
  }

  try {
    const { rows } = await db.query(
      "SELECT password_hash FROM app.users WHERE id = $1",
      [userId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    const user = rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid current password" });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE app.users SET password_hash = $1 WHERE id = $2", [
      hashedPassword,
      userId,
    ]);
    return res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error updating password" });
  }
});

app.listen(port, () => {
  console.log(`SmartCart Server running on port : ${port}`);
});
