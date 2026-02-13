import express, { json } from "express";
import morgan from "morgan";
import { config } from "dotenv";
import bcrypt from "bcrypt";
import cors from "cors";
import validator from "validator";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import http from "http";
import pg from "pg";
import nodemailer from "nodemailer";
import cron from "node-cron";
import Tesseract from "tesseract.js";

config();
const port = process.env.PORT;
const app = express();
const server = http.createServer(app);
const saltRounds = 10;

const io = new Server(server, {
  cors: {
    origin: process.env.HOST_ALLOWED || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});
const { Pool } = pg;
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// --- Middleware לאימות טוקן (מוגדר בחוץ כדי שיהיה זמין לכולם) ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Access token required" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // וידוא שזה access token
    if (payload.type !== "access") {
      return res.status(403).json({ message: "Invalid token type" });
    }

    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

// --- פונקציה ליצירת טוקנים ---
const generateTokens = async (userId) => {
  const accessToken = jwt.sign(
    {
      sub: userId,
      type: "access",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "15m",
    },
  );

  const { rows } = await db.query(
    `INSERT INTO app2.tokens (user_id, type, expires_at, used)
   VALUES ($1, 'refresh', NOW() + interval '7 days', false)
   RETURNING id`,
    [userId],
  );
  const tokenId = rows[0].id;

  const refreshToken = jwt.sign(
    {
      sub: userId,
      jti: tokenId,
      type: "refresh",
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: "7d",
    },
  );

  return { accessToken, refreshToken };
};

const createTransporter = () => {
  return nodemailer.createTransport({
    // creating shaliah (transporter)
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

// Middleware הגדרות כלליות
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: ["http://localhost:5173", "http://100.115.197.11:5173"],
    credentials: true,
  }),
);

db.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log("PostgreSQL (israel_shopping_db)");
  }
});

// Create template_schedules table if it doesn't exist
db.query(`CREATE TABLE IF NOT EXISTS app.template_schedules (
  id SERIAL PRIMARY KEY,
  template_id INT NOT NULL,
  user_id INT NOT NULL,
  frequency VARCHAR(20) NOT NULL DEFAULT 'weekly',
  next_run TIMESTAMPTZ,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`);

// Create push_tokens table if it doesn't exist
db.query(`CREATE TABLE IF NOT EXISTS app.push_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  platform VARCHAR(10) DEFAULT 'android',
  created_at TIMESTAMPTZ DEFAULT NOW()
)`);

// === NEW TABLES ===

// Chat per list
db.query(`CREATE TABLE IF NOT EXISTS app.list_chat (
  id SERIAL PRIMARY KEY,
  list_id INT NOT NULL,
  user_id INT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`);

// Activity log
db.query(`CREATE TABLE IF NOT EXISTS app.activity_log (
  id SERIAL PRIMARY KEY,
  list_id INT,
  user_id INT,
  action VARCHAR(50) NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`);

// Shopping assignment - add column to existing list_items
db.query(`ALTER TABLE app.list_items ADD COLUMN IF NOT EXISTS assigned_to INT`);

// Sort order for manual reordering
db.query(`ALTER TABLE app.list_items ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0`);

// Track who checked/bought an item
db.query(`ALTER TABLE app.list_items ADD COLUMN IF NOT EXISTS checked_by INT`);

// Price alerts
db.query(`CREATE TABLE IF NOT EXISTS app.price_alerts (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  item_id INT NOT NULL,
  target_price DECIMAL NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`);

// Gamification - user points
db.query(`CREATE TABLE IF NOT EXISTS app.user_points (
  id SERIAL PRIMARY KEY,
  user_id INT UNIQUE NOT NULL,
  points INT DEFAULT 0,
  streak_days INT DEFAULT 0,
  last_active DATE
)`);

// Gamification - user badges
db.query(`CREATE TABLE IF NOT EXISTS app.user_badges (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  badge_name VARCHAR(50) NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT NOW()
)`);

// Recipes
db.query(`CREATE TABLE IF NOT EXISTS app.recipes (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  ingredients JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`);

// Meal plans
db.query(`CREATE TABLE IF NOT EXISTS app.meal_plans (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  date DATE NOT NULL,
  meal_type VARCHAR(20) NOT NULL,
  recipe_id INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`);

// Pantry items (expiration tracker)
db.query(`CREATE TABLE IF NOT EXISTS app.pantry_items (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  item_name VARCHAR(200) NOT NULL,
  expiry_date DATE NOT NULL,
  quantity INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`);

app.get("/api/items/barcode/:barcode", async (req, res) => {
  const { barcode } = req.params;
  if (!barcode) return res.json({ item: null });
  try {
    const itemResult = await db.query(
      `SELECT id, name, barcode, item_code, image_url FROM app.items WHERE barcode = $1 LIMIT 1`,
      [barcode],
    );
    if (itemResult.rows.length === 0) {
      return res.json({ item: null });
    }
    const item = itemResult.rows[0];
    const pricesResult = await db.query(
      `SELECT p.price, c.name as chain_name, b.branch_name
       FROM app.prices p
       JOIN app.branches b ON b.id = p.branch_id
       JOIN app.chains c ON c.id = b.chain_id
       WHERE p.item_id = $1
       ORDER BY p.price ASC`,
      [item.id],
    );
    return res.json({ item, prices: pricesResult.rows });
  } catch (e) {
    console.error("Barcode lookup error:", e.message);
    return res.status(500).json({ item: null });
  }
});

app.get("/api/suggestions", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT itemname, COUNT(*) as freq, MAX(price) as price, MAX(quantity) as quantity
       FROM app.list_items li
       JOIN app.list_members lm ON lm.list_id = li.listid
       WHERE lm.user_id = $1
       GROUP BY itemname
       ORDER BY freq DESC
       LIMIT 10`,
      [req.userId],
    );
    return res.json(result.rows);
  } catch (e) {
    console.error("Suggestions error:", e.message);
    return res.status(500).json([]);
  }
});

// === PUSH NOTIFICATIONS ===

// Helper: send Expo push notifications
async function sendPushNotifications(userIds, title, body, data = {}) {
  try {
    if (!userIds || userIds.length === 0) return;
    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(",");
    const result = await db.query(
      `SELECT token FROM app.push_tokens WHERE user_id IN (${placeholders})`,
      userIds,
    );
    const tokens = result.rows.map((r) => r.token).filter((t) => t.startsWith("ExponentPushToken"));
    if (tokens.length === 0) return;

    const messages = tokens.map((token) => ({
      to: token,
      sound: "default",
      title,
      body,
      data,
    }));

    // Send in chunks of 100 (Expo limit)
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });
    }
  } catch (err) {
    console.error("Error sending push notifications:", err);
  }
}

// === ACTIVITY LOG HELPER ===
async function logActivity(listId, userId, action, details) {
  try {
    await db.query(
      `INSERT INTO app.activity_log (list_id, user_id, action, details) VALUES ($1, $2, $3, $4)`,
      [listId, userId, action, details],
    );
  } catch (err) {
    console.error("Error logging activity:", err);
  }
}

// === GAMIFICATION HELPERS ===
async function awardPoints(userId, amount, reason) {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Upsert user points and update streak
    const existing = await db.query(
      `SELECT points, streak_days, last_active FROM app.user_points WHERE user_id = $1`,
      [userId],
    );

    if (existing.rows.length === 0) {
      await db.query(
        `INSERT INTO app.user_points (user_id, points, streak_days, last_active) VALUES ($1, $2, 1, $3)`,
        [userId, amount, today],
      );
    } else {
      const row = existing.rows[0];
      let newStreak = row.streak_days;
      if (row.last_active) {
        const lastActive = new Date(row.last_active);
        const todayDate = new Date(today);
        const diffDays = Math.floor((todayDate - lastActive) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          newStreak = row.streak_days + 1;
        } else if (diffDays > 1) {
          newStreak = 1;
        }
      }
      await db.query(
        `UPDATE app.user_points SET points = points + $1, streak_days = $2, last_active = $3 WHERE user_id = $4`,
        [amount, newStreak, today, userId],
      );
    }

    // Check badge milestones
    const updatedPoints = await db.query(
      `SELECT points, streak_days FROM app.user_points WHERE user_id = $1`,
      [userId],
    );
    const currentPoints = updatedPoints.rows[0];

    // Badge: first_item
    if (reason === "item_added") {
      const itemCount = await db.query(
        `SELECT COUNT(*) as cnt FROM app.list_items WHERE addby = $1`,
        [userId],
      );
      if (parseInt(itemCount.rows[0].cnt) === 1) {
        const hasBadge = await db.query(
          `SELECT id FROM app.user_badges WHERE user_id = $1 AND badge_name = 'first_item'`,
          [userId],
        );
        if (hasBadge.rows.length === 0) {
          await db.query(
            `INSERT INTO app.user_badges (user_id, badge_name) VALUES ($1, 'first_item')`,
            [userId],
          );
        }
      }
    }

    // Badge: shopper_10 (10 items paid)
    if (reason === "item_paid") {
      const paidCount = await db.query(
        `SELECT COUNT(*) as cnt FROM app.list_items WHERE paid_by = $1`,
        [userId],
      );
      if (parseInt(paidCount.rows[0].cnt) >= 10) {
        const hasBadge = await db.query(
          `SELECT id FROM app.user_badges WHERE user_id = $1 AND badge_name = 'shopper_10'`,
          [userId],
        );
        if (hasBadge.rows.length === 0) {
          await db.query(
            `INSERT INTO app.user_badges (user_id, badge_name) VALUES ($1, 'shopper_10')`,
            [userId],
          );
        }
      }
    }

    // Badge: streak_7 (7 day streak)
    if (currentPoints && currentPoints.streak_days >= 7) {
      const hasBadge = await db.query(
        `SELECT id FROM app.user_badges WHERE user_id = $1 AND badge_name = 'streak_7'`,
        [userId],
      );
      if (hasBadge.rows.length === 0) {
        await db.query(
          `INSERT INTO app.user_badges (user_id, badge_name) VALUES ($1, 'streak_7')`,
          [userId],
        );
      }
    }
  } catch (err) {
    console.error("Error awarding points:", err);
  }
}

// Save push token
app.post("/api/push-token", authenticateToken, async (req, res) => {
  const { token, platform } = req.body;
  if (!token) return res.status(400).json({ message: "Token required" });
  try {
    await db.query(
      `INSERT INTO app.push_tokens (user_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = $1, platform = $3`,
      [req.userId, token, platform || "android"],
    );
    return res.json({ success: true });
  } catch (err) {
    console.error("Error saving push token:", err);
    return res.status(500).json({ message: "Error saving token" });
  }
});

// Remove push token (on logout)
app.delete("/api/push-token", authenticateToken, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ message: "Token required" });
  try {
    await db.query("DELETE FROM app.push_tokens WHERE token = $1 AND user_id = $2", [token, req.userId]);
    return res.json({ success: true });
  } catch (err) {
    console.error("Error removing push token:", err);
    return res.status(500).json({ message: "Error removing token" });
  }
});

// === RECEIPT SCANNER (OCR) ===

// Parse receipt text into items
function parseReceiptText(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 1);
  const items = [];
  // Israeli receipt patterns: item name followed by price
  // Common patterns: "פריט   12.90", "פריט x2  25.80", "2 x פריט  12.90"
  const pricePattern = /(\d+[.,]\d{2})\s*$/;
  const qtyPattern = /[xX×]\s*(\d+)|(\d+)\s*[xX×]/;

  for (const line of lines) {
    // Skip header/footer lines (dates, addresses, totals, tax, etc.)
    if (/סה["\u05F4]?כ|מע["\u05F4]?מ|תאריך|כתובת|טלפון|מזומן|אשראי|עודף|ח\.פ|ע\.מ|מספר קבלה/i.test(line)) continue;
    if (/^\d{2}[/.-]\d{2}[/.-]\d{2,4}$/.test(line)) continue;
    if (/^[-=*_]{3,}$/.test(line)) continue;

    const priceMatch = line.match(pricePattern);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1].replace(",", "."));
      let name = line.slice(0, priceMatch.index).trim();
      let quantity = 1;

      // Check for quantity
      const qtyMatch = name.match(qtyPattern);
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1] || qtyMatch[2], 10) || 1;
        name = name.replace(qtyPattern, "").trim();
      }

      // Clean up name
      name = name.replace(/\s+/g, " ").trim();
      if (name.length >= 2 && price > 0 && price < 10000) {
        items.push({ name, price, quantity });
      }
    }
  }
  return items;
}

app.post("/api/receipt/scan", authenticateToken, async (req, res) => {
  const { image } = req.body;
  if (!image) return res.status(400).json({ message: "Image required" });

  try {
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(image, "base64");

    // Run OCR with Tesseract (Hebrew + English)
    const result = await Tesseract.recognize(imageBuffer, "heb+eng", {
      logger: () => {},
    });

    const text = result.data.text;
    const items = parseReceiptText(text);

    return res.json({ items, rawText: text });
  } catch (err) {
    console.error("Receipt OCR error:", err);
    return res.status(500).json({ message: "Error processing receipt", items: [] });
  }
});

app.get("/api/search", async (req, res) => {
  const search = req.query.q;
  if (!search) return res.json([]);
  try {
    const searchTerm = `%${search}%`;
    const reply = await db.query(
      `SELECT DISTINCT ON (i.id)
       i.id as item_id,
       i.name as item_name,
       i.barcode,
       i.item_code,
       i.image_url,
       p.price,
       c.id as chain_id,
       c.name as chain_name,
       b.branch_name
       FROM app.items i
       LEFT JOIN app.prices p ON p.item_id = i.id
       LEFT JOIN app.branches b ON b.id = p.branch_id
       LEFT JOIN app.chains c ON c.id = b.chain_id
       WHERE i.name ILIKE $1
       ORDER BY i.id, p.price DESC NULLS LAST
       LIMIT 15`,
      [searchTerm],
    );
    res.json(reply.rows);
  } catch (e) {
    console.error("Search error:", e.message);
    return res.status(500).json([]);
  }
});

// ROUTES
// REGISTER
app.post("/api/register", async (req, res) => {
  const { first_name, last_name, email, password, confirmPassword } = req.body;

  try {
    // בדיקות בסיסיות
    if (!first_name || !last_name || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (!validator.isEmail(email))
      return res.status(400).json({ message: "Invalid email format" });
    if (password.length < 8)
      return res.status(400).json({ message: "Password too short" });
    if (password !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match" });

    // בדיקה אם המשתמש כבר קיים
    const existingUser = await db.query(
      "SELECT * FROM app2.users WHERE email = $1",
      [email],
    );
    if (existingUser.rows.length > 0)
      return res.status(400).json({ message: "Email already in use" });

    // יצירת hashed password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // יצירת token אימות במערכת ושמירת הנתונים בטבלה
    const tokenData = JSON.stringify({
      first_name,
      last_name,
      email,
      password_hash: hashedPassword,
    });

    const { rows } = await db.query(
      "INSERT INTO app2.tokens (user_id, type, expires_at, used, data) VALUES (NULL, 'email_verify', NOW() + interval '15 minutes', false, $1) RETURNING id",
      [tokenData],
    );
    const tokenId = rows[0].id;

    // יצירת JWT אימות (ללא מידע רגיש!)
    const token = jwt.sign(
      // this token is sent to the client to try to register
      {
        type: "email_verify",
        jti: tokenId,
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" },
    );

    const verifyLink = `http://localhost:${port}/api/verify-email?token=${encodeURIComponent(token)}`;

    // שליחת מייל למשתמש (רק אם הוגדרו credentials)
    if (
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_HOST
    ) {
      try {
        const transporter = nodemailer.createTransport({
          // creating shaliah (transporter)
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        await transporter.sendMail({
          // sending email to the user
          from: `"SmartCart" <${process.env.SMTP_USER}>`,
          to: email,
          subject: "Verify your email",
          html: `<p>Click <a href="${verifyLink}">here</a> to verify your email</p>`,
        });
      } catch (emailErr) {
        console.error("Email sending error:", emailErr);
        // אם המייל נכשל, מוחקים את הטוקן
        await db.query("DELETE FROM app2.tokens WHERE id = $1", [tokenId]);
        return res
          .status(500)
          .json({ message: "Error sending verification email" });
      }
    } else {
      console.warn("SMTP not configured. Using verification link:", verifyLink);
      // במצב פיתוח, אפשר להחזיר את הלינק בתגובה
      if (process.env.NODE_ENV !== "production") {
        return res.status(201).json({
          message: "Registration successful (DEV MODE)",
          verifyLink, // רק לפיתוח!
        });
      }
    }

    // מחזיר תגובה ללקוח
    return res.status(201).json({
      message:
        "Registration successful, please check your email to verify account",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error registering user" });
  }
});

app.get("/api/verify-email", async (req, res) => {
  const token = req.query.token;
  try {
    // בדיקת JWT
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.type !== "email_verify") {
      return res.status(400).json({ message: "Invalid token type" });
    }

    // בדיקה בטבלת tokens
    const result = await db.query(
      "SELECT * FROM app2.tokens WHERE id = $1 AND type = 'email_verify' AND expires_at > NOW();",
      [payload.jti],
    );

    if (result.rowCount === 0)
      return res.status(400).json({ message: "Token not found" });

    const tokenRow = result.rows[0];

    if (tokenRow.used)
      return res.status(400).json({ message: "Token already used" });

    // שליפת נתוני המשתמש מהטבלה (במקום מה-JWT)
    if (!tokenRow.data) {
      return res.status(400).json({ message: "Invalid token data" });
    }

    const userData = JSON.parse(tokenRow.data);
    const { first_name, last_name, email, password_hash } = userData;

    // יוצר את המשתמש ב-DB (עם בדיקה למניעת כפילויות)
    const userResult = await db.query(
      `INSERT INTO app2.users 
   (first_name, last_name, email, password_hash, email_verified_at) 
   VALUES ($1, $2, $3, $4, NOW()) 
   ON CONFLICT (email) DO NOTHING
   RETURNING id, first_name, last_name, email`, // הועבר לסוף
      [first_name, last_name, email, password_hash],
    );

    // אם המייל כבר קיים (race condition)
    if (userResult.rowCount === 0) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const user = userResult.rows[0];

    // מסמן את הטוקן כ-used (רק אחרי שהמשתמש נוצר בהצלחה)
    await db.query("UPDATE app2.tokens SET used = true WHERE id = $1", [
      payload.jti,
    ]);

    // יצירת access + refresh tokens
    const { accessToken, refreshToken } = await generateTokens(user.id);

    // הגדרת cookie ל-refresh token
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ימים במילישניות
    });

    return res.redirect("http://localhost:5173/verification-confirmed"); // will need to check for debuggiing
  } catch (err) {
    // לוג שיעזור לך להבין בזמן אמת מה קרה
    console.error("JWT Verification Detail:", err.message);

    if (err.name === "JsonWebTokenError") {
      return res.status(400).json({ message: "Invalid token signature" });
    }
    if (err.name === "TokenExpiredError") {
      return res
        .status(400)
        .json({ message: "Token expired - please register again" });
    }

    return res.status(400).json({ message: "Invalid or expired token" });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  const { email, username, password } = req.body;

  // בדיקות בסיסיות - need either email or username
  if ((!email && !username) || !password) {
    return res
      .status(400)
      .json({ message: "Email/username and password are required" });
  }

  try {
    // Check if logging in with email or username
    let results;
    if (email) {
      // Parent login with email
      results = await db.query("SELECT * FROM app2.users WHERE email = $1", [
        email,
      ]);
    } else {
      // Child login with username
      results = await db.query("SELECT * FROM app2.users WHERE username = $1", [
        username,
      ]);
    }

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
      sameSite: "lax",
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
    console.error(err);
    return res.status(500).json({ message: "Error logging in" });
  }
});

// REFRESH
app.post("/api/refresh", async (req, res) => {
  // Accept refresh token from cookie (web) OR body (mobile app)
  const incomingToken = req.cookies.refreshToken || req.body.refreshToken;
  if (!incomingToken) return res.status(401).json({ message: "Unauthorized" });

  try {
    // אימות מלא של הטוקן
    const payload = jwt.verify(incomingToken, process.env.JWT_REFRESH_SECRET);

    // בדיקה שזה refresh token
    if (payload.type !== "refresh") {
      return res.status(403).json({ message: "Invalid token type" });
    }

    // בדיקה ב-DB
    const { rows } = await db.query(
      "SELECT * FROM app2.tokens WHERE id = $1 AND user_id = $2 AND type = 'refresh'",
      [payload.jti, payload.sub],
    );

    if (rows.length === 0) {
      // Reuse detected — מוחק את כל ה-refresh tokens של המשתמש
      await db.query(
        "DELETE FROM app2.tokens WHERE user_id = $1 AND type = 'refresh'",
        [payload.sub],
      );
      return res.status(403).json({ message: "Token reuse detected" });
    }

    // מחיקת הטוקן הנוכחי מה-DB
    await db.query("DELETE FROM app2.tokens WHERE id = $1", [payload.jti]);

    // יצירת tokens חדשים
    const { accessToken, refreshToken } = await generateTokens(payload.sub);

    // Cookie (for web)
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Return both tokens (mobile app needs refreshToken in body)
    return res.json({ accessToken, refreshToken });
  } catch (err) {
    return res.status(403).json({ message: "Invalid refresh token" });
  }
});

// ME (שימוש ב-Middleware החדש)
app.get("/api/me", authenticateToken, async (req, res) => {
  try {
    const results = await db.query(
      "SELECT id, first_name, last_name, email, username, parent_id FROM app2.users WHERE id = $1",
      [req.userId],
    );

    if (results.rows.length === 0) return res.status(404).json({ user: null });

    return res.status(200).json({ user: results.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/family/create-child - create child account
app.post("/api/family/create-child", authenticateToken, async (req, res) => {
  const { firstName, username, password } = req.body;

  try {
    // Validate inputs
    if (!firstName || !username || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    // Check if requesting user is a child account (prevent grandchildren)
    const requestingUser = await db.query(
      "SELECT parent_id FROM app2.users WHERE id = $1",
      [req.userId],
    );
    if (requestingUser.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    if (requestingUser.rows[0].parent_id !== null) {
      return res
        .status(403)
        .json({ message: "Child accounts cannot create other children" });
    }

    // Check if username already exists
    const existing = await db.query(
      "SELECT id FROM app2.users WHERE username = $1",
      [username],
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "Username already taken" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create child account
    const result = await db.query(
      `INSERT INTO app2.users (first_name, username, password_hash, parent_id, email)
       VALUES ($1, $2, $3, $4, NULL)
       RETURNING id, first_name, username`,
      [firstName, username, hashedPassword, req.userId],
    );

    return res.status(201).json({ child: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error creating child account" });
  }
});

// GET /api/family/children - get parent's children
app.get("/api/family/children", authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, first_name, username, created_at
       FROM app2.users
       WHERE parent_id = $1
       ORDER BY created_at DESC`,
      [req.userId],
    );
    return res.json({ children: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching children" });
  }
});

// DELETE /api/family/delete-child/:childId - delete child account
app.delete(
  "/api/family/delete-child/:childId",
  authenticateToken,
  async (req, res) => {
    const childId = req.params.childId;

    try {
      // Verify the child belongs to this parent
      const child = await db.query(
        "SELECT id FROM app2.users WHERE id = $1 AND parent_id = $2",
        [childId, req.userId],
      );

      if (child.rows.length === 0) {
        return res
          .status(403)
          .json({ message: "Unauthorized or child not found" });
      }

      // Delete the child account (cascade will handle related data)
      await db.query("DELETE FROM app2.users WHERE id = $1", [childId]);

      return res.json({ message: "Child account deleted" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Error deleting child account" });
    }
  },
);

// LOGOUT
app.post("/api/logout", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      if (payload?.jti && payload?.sub) {
        await db.query(
          "DELETE FROM app2.tokens WHERE id = $1 AND user_id = $2 AND type = 'refresh'",
          [payload.jti, payload.sub],
        );
      }
    } catch (e) {
      console.log(e);
    }
  }
  res.clearCookie("refreshToken", { path: "/" });
  return res.status(200).json({ message: "Logged out" });
});

// Logout מכל המכשירים
app.post("/api/logout-all", authenticateToken, async (req, res) => {
  const userId = req.userId; // מזהה המשתמש מ־JWT

  try {
    // מוחק את כל ה-refresh tokens של המשתמש מה־DB
    await db.query(
      "DELETE FROM app2.tokens WHERE user_id = $1 AND type = 'refresh'",
      [userId],
    );

    // מנקה את ה-cookie בצד הלקוח
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
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

// password change only if user logged in!!!!
app.put("/api/user/password", authenticateToken, async (req, res) => {
  const userId = req.userId;
  const { currentPassword, newPassword, confirmNewPassword } = req.body;

  //  בדיקות בסיסיות
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
    return res
      .status(400)
      .json({ message: "New password must differ from current" });
  }

  try {
    const { rows } = await db.query(
      "SELECT password_hash FROM app2.users WHERE id = $1",
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
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    await db.query("UPDATE app2.users SET password_hash = $1 WHERE id = $2", [
      hashedPassword,
      userId,
    ]);
    return res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error updating password" });
  }
});

app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }
  if (!validator.isEmail(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }
  try {
    const results = await db.query(
      "SELECT id FROM app2.users WHERE email = $1",
      [email],
    );
    if (results.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    const userId = results.rows[0].id;
    const { rows } = await db.query(
      `INSERT INTO app2.tokens
      (user_id,type,expires_at,used,data)
      VALUES($1,'reset_password',NOW() + interval '15 minutes',false,NULL) RETURNING ID`,
      [userId],
    );
    const tokenId = rows[0].id;
    const token = jwt.sign(
      {
        sub: userId,
        jti: tokenId,
        type: "reset_password",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "15m",
      },
    );
    const resetUrl = `http://localhost:5173/reset-password?token=${token}`;
    // send email
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"SmartCart" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Reset your password",
      html: `<p>Click <a href="${resetUrl}">here</a> to reset your password</p>`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error resetting password" });
  }
});

app.post("/api/reset-password", async (req, res) => {
  const { token, newPassword, confirmNewPassword } = req.body;
  console.log(token);
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
      `SELECT expires_at, used
   FROM app2.tokens
   WHERE user_id = $1 AND type = 'reset_password' AND id = $2 AND expires_at > NOW()`,
      [userId, decodedToken.jti],
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Token not found" });
    }
    const tokenData = rows[0];

    if (tokenData.used) {
      return res.status(400).json({ message: "Token already used" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const results = await db.query(
      `SELECT password_hash FROM app2.users WHERE id = $1`,
      [userId],
    );
    if (results.rows.length === 0) {
      return res.status(404).json({ message: "Token not found" });
    }

    const oldPassword = results.rows[0].password_hash;
    if (oldPassword === hashedPassword) {
      return res
        .status(400)
        .json({ message: "New password must differ from current" });
    }

    await db.query(`UPDATE app2.users SET password_hash = $1 WHERE id = $2`, [
      hashedPassword,
      userId,
    ]);

    await db.query(`UPDATE app2.tokens SET used = true WHERE id = $1`, [
      decodedToken.jti,
    ]);

    return res.status(200).json({ message: "Password reset successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error resetting password" });
  }
});

// פונקציה לניקוי טוקנים שפג תוקפם (רצה פעם ביום)
// const cleanupExpiredTokens = async () => {
//   try {
//     const result = await db.query(
//       "DELETE FROM app2.tokens WHERE expires_at < NOW() AND type IN ('refresh', 'email_verify')",
//     );
//     console.log(`Cleaned up ${result.rowCount} expired tokens`);
//   } catch (err) {
//     console.error("Error cleaning up tokens:", err);
//   }
// };

// // ריצת ניקוי כל 24 שעות
// setInterval(cleanupExpiredTokens, 24 * 60 * 60 * 1000);
// // ריצת ניקוי ראשוני בהפעלה
// cleanupExpiredTokens();

// === PRICE HISTORY ===

// GET /api/products/:id/price-history — price history for a product
app.get("/api/products/:id/price-history", authenticateToken, async (req, res) => {
  const itemId = req.params.id;
  try {
    const result = await db.query(
      `SELECT p.price, p.updated_at, c.name as chain_name, b.branch_name
       FROM app.prices p
       JOIN app.branches b ON b.id = p.branch_id
       JOIN app.chains c ON c.id = b.chain_id
       WHERE p.item_id = $1
       ORDER BY p.updated_at DESC`,
      [itemId],
    );
    return res.json({ priceHistory: result.rows });
  } catch (err) {
    console.error("Error fetching price history:", err);
    return res.status(500).json({ message: "Error fetching price history" });
  }
});

// === TEMPLATE SCHEDULES ===

// POST /api/templates/:id/schedule — save a recurring schedule for a template
app.post("/api/templates/:id/schedule", authenticateToken, async (req, res) => {
  const templateId = req.params.id;
  const { frequency } = req.body;

  if (!frequency || !["weekly", "biweekly", "monthly"].includes(frequency)) {
    return res.status(400).json({ message: "Invalid frequency. Must be weekly, biweekly, or monthly." });
  }

  try {
    // Verify the template belongs to this user
    const templateCheck = await db.query(
      "SELECT id FROM app.list_templates WHERE id = $1 AND user_id = $2",
      [templateId, req.userId],
    );
    if (templateCheck.rows.length === 0) {
      return res.status(404).json({ message: "Template not found or not yours" });
    }

    // Calculate next_run based on frequency
    let intervalExpression;
    if (frequency === "weekly") {
      intervalExpression = "7 days";
    } else if (frequency === "biweekly") {
      intervalExpression = "14 days";
    } else {
      intervalExpression = "1 month";
    }

    // Upsert: if a schedule already exists for this template+user, update it
    const result = await db.query(
      `INSERT INTO app.template_schedules (template_id, user_id, frequency, next_run, active)
       VALUES ($1, $2, $3, NOW() + interval '${intervalExpression}', true)
       ON CONFLICT (template_id, user_id) DO UPDATE
       SET frequency = $3, next_run = NOW() + interval '${intervalExpression}', active = true
       RETURNING *`,
      [templateId, req.userId, frequency],
    );

    // If ON CONFLICT doesn't work (no unique constraint yet), fallback: check + insert/update
    if (result.rows.length === 0) {
      const existing = await db.query(
        "SELECT id FROM app.template_schedules WHERE template_id = $1 AND user_id = $2",
        [templateId, req.userId],
      );
      if (existing.rows.length > 0) {
        const updateResult = await db.query(
          `UPDATE app.template_schedules SET frequency = $1, next_run = NOW() + interval '${intervalExpression}', active = true
           WHERE template_id = $2 AND user_id = $3 RETURNING *`,
          [frequency, templateId, req.userId],
        );
        return res.json({ schedule: updateResult.rows[0] });
      } else {
        const insertResult = await db.query(
          `INSERT INTO app.template_schedules (template_id, user_id, frequency, next_run, active)
           VALUES ($1, $2, $3, NOW() + interval '${intervalExpression}', true) RETURNING *`,
          [templateId, req.userId, frequency],
        );
        return res.json({ schedule: insertResult.rows[0] });
      }
    }

    return res.json({ schedule: result.rows[0] });
  } catch (err) {
    // Handle case where ON CONFLICT fails due to missing unique constraint
    if (err.code === "42P10" || err.message.includes("ON CONFLICT")) {
      try {
        const existing = await db.query(
          "SELECT id FROM app.template_schedules WHERE template_id = $1 AND user_id = $2",
          [templateId, req.userId],
        );
        let intervalExpression;
        if (frequency === "weekly") intervalExpression = "7 days";
        else if (frequency === "biweekly") intervalExpression = "14 days";
        else intervalExpression = "1 month";

        if (existing.rows.length > 0) {
          const updateResult = await db.query(
            `UPDATE app.template_schedules SET frequency = $1, next_run = NOW() + interval '${intervalExpression}', active = true
             WHERE template_id = $2 AND user_id = $3 RETURNING *`,
            [frequency, templateId, req.userId],
          );
          return res.json({ schedule: updateResult.rows[0] });
        } else {
          const insertResult = await db.query(
            `INSERT INTO app.template_schedules (template_id, user_id, frequency, next_run, active)
             VALUES ($1, $2, $3, NOW() + interval '${intervalExpression}', true) RETURNING *`,
            [templateId, req.userId, frequency],
          );
          return res.json({ schedule: insertResult.rows[0] });
        }
      } catch (innerErr) {
        console.error("Error saving schedule (fallback):", innerErr);
        return res.status(500).json({ message: "Error saving schedule" });
      }
    }
    console.error("Error saving schedule:", err);
    return res.status(500).json({ message: "Error saving schedule" });
  }
});

// === LIST ROUTES ===

// GET /api/lists — all lists for the authenticated user
app.get("/api/lists", authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT l.id, l.list_name, l.status, l.created_at, l.updated_at, lm.status AS role
       FROM app.list l
       JOIN app.list_members lm ON lm.list_id = l.id
       WHERE lm.user_id = $1
       ORDER BY l.updated_at DESC`,
      [req.userId],
    );
    return res.json({ lists: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching lists" });
  }
});

// GET /api/lists/:id/items — list detail + items + members + user role
app.get("/api/lists/:id/items", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  try {
    // Check membership
    const membership = await db.query(
      "SELECT status FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId],
    );
    if (membership.rows.length === 0) {
      return res.status(403).json({ message: "Not a member of this list" });
    }

    const listRes = await db.query("SELECT * FROM app.list WHERE id = $1", [
      listId,
    ]);
    if (listRes.rows.length === 0)
      return res.status(404).json({ message: "List not found" });

    const itemsRes = await db.query(
      `SELECT li.*, u.first_name AS paid_by_name, u2.first_name AS note_by_name,
              u3.first_name AS added_by_name, u4.first_name AS checked_by_name,
              u5.first_name AS assigned_to_name
       FROM app.list_items li
       LEFT JOIN app2.users u ON li.paid_by = u.id
       LEFT JOIN app2.users u2 ON li.note_by = u2.id
       LEFT JOIN app2.users u3 ON li.addby = u3.id
       LEFT JOIN app2.users u4 ON li.checked_by = u4.id
       LEFT JOIN app2.users u5 ON li.assigned_to = u5.id
       WHERE li.listid = $1
       ORDER BY CASE WHEN li.sort_order > 0 THEN li.sort_order ELSE 999999 END ASC, li.addat DESC`,
      [listId],
    );

    const membersRes = await db.query(
      `SELECT u.id, u.first_name, u.last_name, lm.status AS role
       FROM app.list_members lm
       JOIN app2.users u ON lm.user_id = u.id
       WHERE lm.list_id = $1`,
      [listId],
    );

    return res.json({
      list: listRes.rows[0],
      items: itemsRes.rows,
      members: membersRes.rows,
      userRole: membership.rows[0].status,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching list details" });
  }
});

// DELETE /api/lists/:id — delete a list (admin only)
app.delete("/api/lists/:id", authenticateToken, async (req, res) => {
  const listId = req.params.id;

  try {
    // Check if user is admin of this list
    const membership = await db.query(
      "SELECT status FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId],
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({ message: "Not a member of this list" });
    }

    if (membership.rows[0].status !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admin can delete the list" });
    }

    // Delete the list (CASCADE will delete list_items and list_members)
    await db.query("DELETE FROM app.list WHERE id = $1", [listId]);

    return res.json({ success: true, message: "List deleted successfully" });
  } catch (err) {
    console.error("Error deleting list:", err);
    return res.status(500).json({ message: "Error deleting list" });
  }
});

// POST /api/lists/:id/leave — leave a list (members only, not admin)
app.post("/api/lists/:id/leave", authenticateToken, async (req, res) => {
  const listId = req.params.id;

  try {
    // Check if user is a member of this list
    const membership = await db.query(
      "SELECT status FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId],
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({ message: "Not a member of this list" });
    }

    if (membership.rows[0].status === "admin") {
      return res.status(403).json({
        message:
          "Admin cannot leave the list. Delete it or transfer admin role first.",
      });
    }

    // Remove user from list
    await db.query(
      "DELETE FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId],
    );

    return res.json({ success: true, message: "Left list successfully" });
  } catch (err) {
    console.error("Error leaving list:", err);
    return res.status(500).json({ message: "Error leaving list" });
  }
});

// GET /api/lists/:id/compare — price comparison across chains
app.get("/api/lists/:id/compare", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  try {
    // Get all list items
    const itemsRes = await db.query(
      `SELECT li.id, li.itemname, li.quantity, li.product_id, li.price AS user_price
       FROM app.list_items li
       WHERE li.listid = $1`,
      [listId],
    );
    const allItems = itemsRes.rows;
    if (allItems.length === 0) {
      return res.json({ chains: [], bestMix: null, totalItems: 0 });
    }

    // 1) Items with product_id → direct price lookup
    const linkedItems = allItems.filter((i) => i.product_id);
    const unlinkedItems = allItems.filter((i) => !i.product_id);
    const productIds = linkedItems.map((i) => i.product_id);

    // Get prices for linked items
    let priceRows = [];
    if (productIds.length > 0) {
      const pricesRes = await db.query(
        `SELECT DISTINCT ON (c.id, p.item_id)
                c.id AS chain_id, c.name AS chain_name,
                p.item_id AS product_id, p.price
         FROM app.prices p
         JOIN app.branches b ON p.branch_id = b.id
         JOIN app.chains c ON b.chain_id = c.id
         WHERE p.item_id = ANY($1)
         ORDER BY c.id, p.item_id, p.price ASC`,
        [productIds],
      );
      priceRows = pricesRes.rows;
    }

    // 2) Items without product_id → fuzzy name match
    let nameMatchRows = [];
    if (unlinkedItems.length > 0) {
      const namePatterns = unlinkedItems.map((i) => `%${i.itemname}%`);
      const placeholders = namePatterns.map((_, idx) => `i.name ILIKE $${idx + 1}`).join(" OR ");
      if (placeholders) {
        try {
          const fuzzyRes = await db.query(
            `SELECT DISTINCT ON (c.id, i.id)
                    c.id AS chain_id, c.name AS chain_name,
                    i.id AS product_id, i.name AS product_name, p.price
             FROM app.prices p
             JOIN app.items i ON p.item_id = i.id
             JOIN app.branches b ON p.branch_id = b.id
             JOIN app.chains c ON b.chain_id = c.id
             WHERE ${placeholders}
             ORDER BY c.id, i.id, p.price ASC`,
            namePatterns,
          );
          nameMatchRows = fuzzyRes.rows;
        } catch (e) {
          // Name matching is best-effort
        }
      }
    }

    // Map unlinked item names to best-matching product_ids
    const nameToProduct = {};
    for (const row of nameMatchRows) {
      for (const item of unlinkedItems) {
        if (row.product_name && row.product_name.toLowerCase().includes(item.itemname.toLowerCase())) {
          if (!nameToProduct[item.id]) {
            nameToProduct[item.id] = row.product_id;
          }
        }
      }
    }

    // Combine all matchable items
    const matchableItems = [
      ...linkedItems,
      ...unlinkedItems.filter((i) => nameToProduct[i.id]).map((i) => ({
        ...i,
        product_id: nameToProduct[i.id],
      })),
    ];
    const unmatchedItems = unlinkedItems.filter((i) => !nameToProduct[i.id]);
    const allPriceRows = [...priceRows, ...nameMatchRows];

    // Group by chain
    const chainMap = {};
    for (const row of allPriceRows) {
      if (!chainMap[row.chain_id]) {
        chainMap[row.chain_id] = {
          chain_id: row.chain_id,
          chain_name: row.chain_name,
          prices: {},
        };
      }
      const pid = row.product_id;
      const price = parseFloat(row.price);
      if (!chainMap[row.chain_id].prices[pid] || price < chainMap[row.chain_id].prices[pid]) {
        chainMap[row.chain_id].prices[pid] = price;
      }
    }

    // Build per-chain comparison
    const chains = Object.values(chainMap).map((chain) => {
      let total = 0;
      const missing = [];
      const items = matchableItems.map((li) => {
        const price = chain.prices[li.product_id];
        const qty = parseFloat(li.quantity) || 1;
        if (price !== undefined) {
          const subtotal = price * qty;
          total += subtotal;
          return { item_name: li.itemname, price, quantity: qty, subtotal, available: true };
        } else {
          missing.push(li.itemname);
          return { item_name: li.itemname, price: 0, quantity: qty, subtotal: 0, available: false };
        }
      });
      return {
        chain_id: chain.chain_id,
        chain_name: chain.chain_name,
        total,
        items: items.filter((i) => i.available),
        missing,
        missingCount: missing.length,
        itemCount: items.filter((i) => i.available).length,
      };
    });

    chains.sort((a, b) => a.total - b.total);

    // Cheapest single store
    const cheapest = chains.length > 0 ? { chain_name: chains[0].chain_name, total: chains[0].total } : null;
    const mostExpensive = chains.length > 1 ? chains[chains.length - 1].total : null;

    // 3) Best Mix — cheapest per item across all stores
    const bestMixItems = [];
    let bestMixTotal = 0;
    const bestMixStores = new Set();
    for (const li of matchableItems) {
      let bestPrice = Infinity;
      let bestChain = null;
      for (const chain of Object.values(chainMap)) {
        const p = chain.prices[li.product_id];
        if (p !== undefined && p < bestPrice) {
          bestPrice = p;
          bestChain = chain.chain_name;
        }
      }
      const qty = parseFloat(li.quantity) || 1;
      if (bestChain) {
        bestMixItems.push({ item_name: li.itemname, price: bestPrice, quantity: qty, subtotal: bestPrice * qty, store: bestChain });
        bestMixTotal += bestPrice * qty;
        bestMixStores.add(bestChain);
      }
    }

    const bestMix = bestMixItems.length > 0 ? {
      total: bestMixTotal,
      items: bestMixItems,
      storeCount: bestMixStores.size,
      stores: [...bestMixStores],
    } : null;

    // Savings calculation
    const savings = cheapest && mostExpensive ? mostExpensive - cheapest.total : 0;
    const bestMixSavings = bestMix && mostExpensive ? mostExpensive - bestMix.total : 0;

    return res.json({
      chains,
      cheapest,
      bestMix,
      totalItems: allItems.length,
      matchedItems: matchableItems.length,
      unmatchedItems: unmatchedItems.length,
      savings: parseFloat(savings.toFixed(2)),
      bestMixSavings: parseFloat(bestMixSavings.toFixed(2)),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error comparing prices" });
  }
});

// POST /api/lists/:id/invite — generate invite link
app.post("/api/lists/:id/invite", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  try {
    const membership = await db.query(
      "SELECT status FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId],
    );
    if (membership.rows.length === 0 || membership.rows[0].status !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admins can create invites" });
    }

    const crypto = await import("crypto");
    const inviteCode = crypto.randomBytes(16).toString("hex");

    await db.query(
      `INSERT INTO app.list_invites (list_id, invite_code, created_by, expires_at)
       VALUES ($1, $2, $3, NOW() + interval '7 days')`,
      [listId, inviteCode, req.userId],
    );

    const host =
      process.env.host_allowed?.split(",")[0] || "http://localhost:5173";
    return res.json({ inviteLink: `${host}/invite/${inviteCode}` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error creating invite" });
  }
});

// POST /api/lists/:id/items — add item to list
app.post("/api/lists/:id/items", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  console.log("=== ADD ITEM DEBUG ===");
  console.log("Request body:", JSON.stringify(req.body, null, 2));
  const { itemName, price, storeName, quantity, productId } = req.body;

  if (!itemName || itemName.trim() === "") {
    return res.status(400).json({ message: "Item name is required" });
  }

  try {
    // Check user has access to this list
    const membership = await db.query(
      "SELECT id FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId],
    );
    if (membership.rows.length === 0) {
      return res.status(403).json({ message: "Not a member of this list" });
    }

    // Insert item (Note: table uses camelCase for listId, itemName, storeName!)
    const result = await db.query(
      `INSERT INTO app.list_items (listId, itemName, price, storeName, quantity, addby, addat, updatedat, product_id)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7)
       RETURNING *`,
      [
        listId,
        itemName,
        price || null,
        storeName || null,
        quantity || 1,
        req.userId,
        productId || null,
      ],
    );

    const newItem = result.rows[0];

    // Emit to socket.io room for real-time updates
    io.to(String(listId)).emit("receive_item", newItem);

    return res.status(201).json({ item: newItem });
  } catch (err) {
    console.error("Error adding item to list:", err.message);
    console.error("Stack:", err.stack);
    return res
      .status(500)
      .json({ message: "Error adding item", error: err.message });
  }
});

// GET /api/family/children — get all children for parent
app.get("/api/family/children", authenticateToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, first_name, username, created_at
       FROM app2.users
       WHERE parent_id = $1
       ORDER BY created_at DESC`,
      [req.userId],
    );
    return res.json({ children: rows });
  } catch (err) {
    console.error("Error fetching children:", err);
    return res.status(500).json({ message: "Error fetching children" });
  }
});

// POST /api/family/create-child — create child account
app.post("/api/family/create-child", authenticateToken, async (req, res) => {
  const { firstName, username, password } = req.body;

  if (!firstName || !username || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (password.length < 4) {
    return res
      .status(400)
      .json({ message: "Password must be at least 4 characters" });
  }

  try {
    // Prevent children from creating other children
    const requestingUser = await db.query(
      "SELECT parent_id FROM app2.users WHERE id = $1",
      [req.userId],
    );

    if (requestingUser.rows[0].parent_id !== null) {
      return res
        .status(403)
        .json({ message: "Child accounts cannot create other children" });
    }

    const existingUser = await db.query(
      "SELECT id FROM app2.users WHERE username = $1",
      [username],
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "Username already taken" });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const result = await db.query(
      `INSERT INTO app2.users (first_name, username, password, parent_id, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, first_name, username`,
      [firstName, username, hashedPassword, req.userId],
    );

    const child = result.rows[0];

    return res.status(201).json({
      message: "Child account created successfully",
      child: child,
    });
  } catch (err) {
    console.error("Error creating child account:", err);
    return res.status(500).json({ message: "Error creating child account" });
  }
});

// DELETE /api/family/delete-child/:childId — delete child account
app.delete(
  "/api/family/delete-child/:childId",
  authenticateToken,
  async (req, res) => {
    const { childId } = req.params;

    try {
      const child = await db.query(
        "SELECT id FROM app2.users WHERE id = $1 AND parent_id = $2",
        [childId, req.userId],
      );

      if (child.rows.length === 0) {
        return res.status(403).json({ message: "Not your child account" });
      }

      await db.query("DELETE FROM app2.users WHERE id = $1", [childId]);

      return res.json({
        success: true,
        message: "Child account deleted successfully",
      });
    } catch (err) {
      console.error("Error deleting child account:", err);
      return res.status(500).json({ message: "Error deleting child account" });
    }
  },
);

// GET /api/lists/:id/children — get parent's children with membership status
app.get("/api/lists/:id/children", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.first_name, u.username,
              CASE WHEN lm.id IS NOT NULL THEN true ELSE false END AS is_member
       FROM app2.users u
       LEFT JOIN app.list_members lm ON lm.list_id = $1 AND lm.user_id = u.id
       WHERE u.parent_id = $2`,
      [listId, req.userId],
    );
    return res.json({ children: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching children" });
  }
});

// POST /api/lists/:id/children/:childId — add child to list
app.post(
  "/api/lists/:id/children/:childId",
  authenticateToken,
  async (req, res) => {
    const { id: listId, childId } = req.params;
    try {
      // Verify child belongs to this parent
      const child = await db.query(
        "SELECT id FROM app2.users WHERE id = $1 AND parent_id = $2",
        [childId, req.userId],
      );
      if (child.rows.length === 0)
        return res.status(403).json({ message: "Not your child" });

      await db.query(
        `INSERT INTO app.list_members (list_id, user_id, status) VALUES ($1, $2, 'member')
       ON CONFLICT (list_id, user_id) DO NOTHING`,
        [listId, childId],
      );
      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Error adding child" });
    }
  },
);

// DELETE /api/lists/:id/children/:childId — remove child from list
app.delete(
  "/api/lists/:id/children/:childId",
  authenticateToken,
  async (req, res) => {
    const { id: listId, childId } = req.params;
    try {
      const child = await db.query(
        "SELECT id FROM app2.users WHERE id = $1 AND parent_id = $2",
        [childId, req.userId],
      );
      if (child.rows.length === 0)
        return res.status(403).json({ message: "Not your child" });

      await db.query(
        "DELETE FROM app.list_members WHERE list_id = $1 AND user_id = $2",
        [listId, childId],
      );
      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Error removing child" });
    }
  },
);

// GET /api/kid-requests/pending — get pending requests for parent
app.get("/api/kid-requests/pending", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        kr.id,
        kr.item_name,
        kr.price,
        kr.quantity,
        kr.product_id,
        kr.created_at,
        u.first_name as child_first_name,
        l.list_name
       FROM app2.kid_requests kr
       JOIN app2.users u ON u.id = kr.child_id
       JOIN app.list l ON l.id = kr.list_id
       WHERE kr.parent_id = $1 AND kr.status = 'pending'
       ORDER BY kr.created_at DESC`,
      [req.userId],
    );
    return res.json({ requests: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching requests" });
  }
});

// GET /api/kid-requests/my — get child's own request history
app.get("/api/kid-requests/my", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        kr.id,
        kr.item_name,
        kr.price,
        kr.quantity,
        kr.status,
        kr.created_at,
        kr.product_id,
        l.list_name
       FROM app2.kid_requests kr
       LEFT JOIN app.list l ON l.id = kr.list_id
       WHERE kr.child_id = $1
       ORDER BY kr.created_at DESC`,
      [req.userId],
    );
    return res.json({ requests: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching requests" });
  }
});

// POST /api/kid-requests — child requests to add item
app.post("/api/kid-requests", authenticateToken, async (req, res) => {
  const { listId, itemName, price, storeName, quantity, productId } = req.body;
  try {
    // Get the child's parent and child info
    const userRes = await db.query(
      "SELECT parent_id, first_name FROM app2.users WHERE id = $1",
      [req.userId],
    );
    if (userRes.rows.length === 0 || !userRes.rows[0].parent_id) {
      return res.status(403).json({ message: "Not a child account" });
    }
    const parentId = userRes.rows[0].parent_id;
    const childName = userRes.rows[0].first_name;

    // Get list name
    const listRes = await db.query(
      "SELECT list_name FROM app.list WHERE id = $1",
      [listId],
    );
    const listName = listRes.rows[0]?.list_name || "רשימה";

    const result = await db.query(
      `INSERT INTO app2.kid_requests (child_id, parent_id, list_id, item_name, price, store_name, quantity, product_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        req.userId,
        parentId,
        listId,
        itemName,
        price,
        storeName,
        quantity || 1,
        productId || null,
      ],
    );

    // Emit real-time notification to parent
    const requestId = result.rows[0].id;
    io.to(`user_${parentId}`).emit("new_kid_request", {
      id: requestId,
      requestId: requestId,
      childName: childName,
      child_first_name: childName,
      itemName: itemName,
      item_name: itemName,
      listName: listName,
      list_name: listName,
      quantity: quantity || 1,
      price: price,
      productId: productId,
      product_id: productId,
    });

    // Push notification to parent
    sendPushNotifications(
      [parentId],
      "בקשה מהילד/ה",
      `${childName} רוצה להוסיף ${itemName} לרשימה ${listName}`,
      { type: "kid_request", requestId },
    );

    return res.status(201).json({ message: "Request sent" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error creating request" });
  }
});

// POST /api/kid-requests/:id/resolve — approve or reject child request
app.post(
  "/api/kid-requests/:id/resolve",
  authenticateToken,
  async (req, res) => {
    const requestId = req.params.id;
    const { action } = req.body; // "approve" or "reject"

    if (action !== "approve" && action !== "reject") {
      return res.status(400).json({ message: "Invalid action" });
    }

    try {
      // Get the request and verify it belongs to this parent
      const requestResult = await db.query(
        `SELECT kr.*, u.first_name as child_first_name
       FROM app2.kid_requests kr
       JOIN app2.users u ON u.id = kr.child_id
       WHERE kr.id = $1 AND kr.parent_id = $2`,
        [requestId, req.userId],
      );

      if (requestResult.rows.length === 0) {
        return res.status(403).json({ message: "Not your child's request" });
      }

      const request = requestResult.rows[0];
      const newStatus = action === "approve" ? "approved" : "rejected";

      // Update request status
      await db.query("UPDATE app2.kid_requests SET status = $1 WHERE id = $2", [
        newStatus,
        requestId,
      ]);

      // If approved, add the item to the list
      if (action === "approve") {
        const itemResult = await db.query(
          `INSERT INTO app.list_items (listId, itemName, price, storeName, quantity, addby, addat, updatedat, product_id)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7)
         RETURNING *`,
          [
            request.list_id,
            request.item_name,
            request.price || null,
            request.store_name || null,
            request.quantity || 1,
            request.child_id, // Item added by the child
            request.product_id || null,
          ],
        );

        // Emit to list room so all members see the new item
        io.to(String(request.list_id)).emit("receive_item", itemResult.rows[0]);
      }

      // Notify the child that their request was resolved
      io.to(`user_${request.child_id}`).emit("request_resolved", {
        requestId: requestId,
        status: newStatus,
      });

      return res.json({
        success: true,
        message: action === "approve" ? "Request approved" : "Request rejected",
      });
    } catch (err) {
      console.error("Error resolving request:", err);
      return res.status(500).json({ message: "Error resolving request" });
    }
  },
);

// GET comments for an item
app.get(
  "/api/lists/:listId/items/:itemId/comments",
  authenticateToken,
  async (req, res) => {
    const { listId, itemId } = req.params;

    try {
      const result = await db.query(
        `SELECT c.id, c.item_id, c.user_id, c.comment, c.created_at, u.first_name
       FROM app.list_item_comments c
       JOIN app2.users u ON c.user_id = u.id
       WHERE c.item_id = $1
       ORDER BY c.created_at ASC`,
        [itemId],
      );

      res.json({ comments: result.rows });
    } catch (err) {
      console.error("Error fetching comments:", err);
      res.status(500).json({ message: "Error fetching comments" });
    }
  },
);

// === LIST CHAT ENDPOINT ===
app.get("/api/lists/:id/chat", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  try {
    const result = await db.query(
      `SELECT lc.id, lc.list_id AS "listId", lc.user_id AS "userId", u.first_name AS "firstName",
              lc.message, lc.created_at AS "createdAt"
       FROM app.list_chat lc
       JOIN app2.users u ON lc.user_id = u.id
       WHERE lc.list_id = $1
       ORDER BY lc.created_at DESC
       LIMIT 50`,
      [listId],
    );
    return res.json({ messages: result.rows.reverse() });
  } catch (err) {
    console.error("Error fetching chat messages:", err);
    return res.status(500).json({ message: "Error fetching chat messages" });
  }
});

// === ACTIVITY LOG ENDPOINT ===
app.get("/api/lists/:id/activity", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  try {
    const result = await db.query(
      `SELECT al.id, al.list_id, al.user_id, al.action, al.details, al.created_at,
              u.first_name
       FROM app.activity_log al
       LEFT JOIN app2.users u ON al.user_id = u.id
       WHERE al.list_id = $1
       ORDER BY al.created_at DESC
       LIMIT 50`,
      [listId],
    );
    return res.json({ activities: result.rows });
  } catch (err) {
    console.error("Error fetching activity log:", err);
    return res.status(500).json({ message: "Error fetching activity log" });
  }
});

// === DELIVERY PROVIDERS ===
const DELIVERY_PROVIDERS = [
  { id: 1, chain_name: 'רמי לוי', website_url: 'https://www.rami-levy.co.il/he/online', icon: 'cart-outline' },
  { id: 2, chain_name: 'שופרסל', website_url: 'https://www.shufersal.co.il/online/he/default', icon: 'storefront-outline' },
  { id: 3, chain_name: 'יוחננוף', website_url: 'https://yochananof.co.il/', icon: 'basket-outline' },
  { id: 4, chain_name: 'ויקטורי', website_url: 'https://www.victoryonline.co.il/', icon: 'bag-outline' },
  { id: 5, chain_name: 'אושר עד', website_url: 'https://osherad.co.il/', icon: 'pricetag-outline' },
];

app.get("/api/delivery/providers", authenticateToken, (req, res) => {
  res.json({ providers: DELIVERY_PROVIDERS });
});

// === REORDER LIST ITEMS ===
app.put("/api/lists/:id/reorder", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  const { items } = req.body; // Array of { itemId, sortOrder }
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ message: "items array is required" });
  }
  try {
    const membership = await db.query(
      "SELECT status FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId]
    );
    if (membership.rows.length === 0) {
      return res.status(403).json({ message: "Not a member of this list" });
    }
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      for (const item of items) {
        await client.query(
          "UPDATE app.list_items SET sort_order = $1 WHERE id = $2 AND listid = $3",
          [item.sortOrder, item.itemId, listId]
        );
      }
      await client.query("COMMIT");
      res.json({ success: true });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error reordering items:", err);
    return res.status(500).json({ message: "Error reordering items" });
  }
});

// === ACTIVITY FEED (CROSS-LIST) ===
app.get("/api/activity/feed", authenticateToken, async (req, res) => {
  const userId = req.userId;
  const { action, from, to, limit = 50, offset = 0 } = req.query;
  try {
    const result = await db.query(
      `SELECT al.id, al.list_id, al.user_id, al.action, al.details, al.created_at,
              u.first_name AS user_name,
              l.list_name
       FROM app.activity_log al
       JOIN app.list_members lm ON lm.list_id = al.list_id AND lm.user_id = $1
       LEFT JOIN app2.users u ON al.user_id = u.id
       LEFT JOIN app.list l ON al.list_id = l.id
       WHERE ($2::VARCHAR IS NULL OR al.action = $2)
         AND ($3::TIMESTAMPTZ IS NULL OR al.created_at >= $3::TIMESTAMPTZ)
         AND ($4::TIMESTAMPTZ IS NULL OR al.created_at <= $4::TIMESTAMPTZ)
       ORDER BY al.created_at DESC
       LIMIT $5 OFFSET $6`,
      [userId, action || null, from || null, to || null, parseInt(limit), parseInt(offset)]
    );
    return res.json({ activities: result.rows });
  } catch (err) {
    console.error("Error fetching activity feed:", err);
    return res.status(500).json({ message: "Error fetching activity feed" });
  }
});

// === PRICE ALERTS ENDPOINTS ===
app.post("/api/price-alerts", authenticateToken, async (req, res) => {
  const { itemId, targetPrice } = req.body;
  if (!itemId || !targetPrice) {
    return res.status(400).json({ message: "itemId and targetPrice are required" });
  }
  try {
    const result = await db.query(
      `INSERT INTO app.price_alerts (user_id, item_id, target_price) VALUES ($1, $2, $3) RETURNING *`,
      [req.userId, itemId, targetPrice],
    );
    return res.status(201).json({ alert: result.rows[0] });
  } catch (err) {
    console.error("Error creating price alert:", err);
    return res.status(500).json({ message: "Error creating price alert" });
  }
});

app.get("/api/price-alerts", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT pa.id, pa.item_id, pa.target_price, pa.created_at, i.name AS item_name
       FROM app.price_alerts pa
       JOIN app.items i ON pa.item_id = i.id
       WHERE pa.user_id = $1 AND pa.active = true
       ORDER BY pa.created_at DESC`,
      [req.userId],
    );
    return res.json({ alerts: result.rows });
  } catch (err) {
    console.error("Error fetching price alerts:", err);
    return res.status(500).json({ message: "Error fetching price alerts" });
  }
});

app.delete("/api/price-alerts/:id", authenticateToken, async (req, res) => {
  const alertId = req.params.id;
  try {
    await db.query(
      `UPDATE app.price_alerts SET active = false WHERE id = $1 AND user_id = $2`,
      [alertId, req.userId],
    );
    return res.json({ success: true });
  } catch (err) {
    console.error("Error deactivating price alert:", err);
    return res.status(500).json({ message: "Error deactivating price alert" });
  }
});

// === GAMIFICATION ENDPOINTS ===
app.get("/api/gamification/stats", authenticateToken, async (req, res) => {
  try {
    const pointsResult = await db.query(
      `SELECT points, streak_days, last_active FROM app.user_points WHERE user_id = $1`,
      [req.userId],
    );
    const badgesResult = await db.query(
      `SELECT badge_name, earned_at FROM app.user_badges WHERE user_id = $1 ORDER BY earned_at DESC`,
      [req.userId],
    );
    const stats = pointsResult.rows.length > 0
      ? pointsResult.rows[0]
      : { points: 0, streak_days: 0, last_active: null };
    return res.json({ ...stats, badges: badgesResult.rows });
  } catch (err) {
    console.error("Error fetching gamification stats:", err);
    return res.status(500).json({ message: "Error fetching gamification stats" });
  }
});

// === SMART QUANTITY PREDICTION ===
app.get("/api/predict-quantity/:itemName", authenticateToken, async (req, res) => {
  const itemName = decodeURIComponent(req.params.itemName);
  try {
    const result = await db.query(
      `SELECT quantity FROM app.list_items li
       JOIN app.list_members lm ON lm.list_id = li.listid
       WHERE lm.user_id = $1 AND li.itemname ILIKE $2`,
      [req.userId, itemName],
    );
    if (result.rows.length === 0) {
      return res.json({ suggestedQuantity: 1, avgQuantity: 1, timesOrdered: 0 });
    }
    const quantities = result.rows.map((r) => parseFloat(r.quantity) || 1);
    const avg = quantities.reduce((a, b) => a + b, 0) / quantities.length;
    const suggested = Math.round(avg);
    return res.json({
      suggestedQuantity: suggested || 1,
      avgQuantity: parseFloat(avg.toFixed(2)),
      timesOrdered: quantities.length,
    });
  } catch (err) {
    console.error("Error predicting quantity:", err);
    return res.status(500).json({ message: "Error predicting quantity" });
  }
});

// === RECIPES ENDPOINTS ===
app.post("/api/recipes", authenticateToken, async (req, res) => {
  const { name, ingredients } = req.body;
  if (!name) {
    return res.status(400).json({ message: "Recipe name is required" });
  }
  try {
    const result = await db.query(
      `INSERT INTO app.recipes (user_id, name, ingredients) VALUES ($1, $2, $3) RETURNING *`,
      [req.userId, name, JSON.stringify(ingredients || [])],
    );
    return res.status(201).json({ recipe: result.rows[0] });
  } catch (err) {
    console.error("Error creating recipe:", err);
    return res.status(500).json({ message: "Error creating recipe" });
  }
});

app.get("/api/recipes", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM app.recipes WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.userId],
    );
    return res.json({ recipes: result.rows });
  } catch (err) {
    console.error("Error fetching recipes:", err);
    return res.status(500).json({ message: "Error fetching recipes" });
  }
});

app.delete("/api/recipes/:id", authenticateToken, async (req, res) => {
  const recipeId = req.params.id;
  try {
    await db.query(
      `DELETE FROM app.recipes WHERE id = $1 AND user_id = $2`,
      [recipeId, req.userId],
    );
    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting recipe:", err);
    return res.status(500).json({ message: "Error deleting recipe" });
  }
});

// === MEAL PLANS ENDPOINTS ===
app.post("/api/meal-plans", authenticateToken, async (req, res) => {
  const { date, mealType, recipeId } = req.body;
  if (!date || !mealType || !recipeId) {
    return res.status(400).json({ message: "date, mealType, and recipeId are required" });
  }
  try {
    const result = await db.query(
      `INSERT INTO app.meal_plans (user_id, date, meal_type, recipe_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.userId, date, mealType, recipeId],
    );
    return res.status(201).json({ mealPlan: result.rows[0] });
  } catch (err) {
    console.error("Error creating meal plan:", err);
    return res.status(500).json({ message: "Error creating meal plan" });
  }
});

app.get("/api/meal-plans", authenticateToken, async (req, res) => {
  const week = req.query.week;
  if (!week) {
    return res.status(400).json({ message: "week query parameter (YYYY-MM-DD) is required" });
  }
  try {
    const result = await db.query(
      `SELECT mp.id, mp.date, mp.meal_type, mp.recipe_id, mp.created_at,
              r.name AS recipe_name, r.ingredients
       FROM app.meal_plans mp
       JOIN app.recipes r ON mp.recipe_id = r.id
       WHERE mp.user_id = $1 AND mp.date >= $2::date AND mp.date < ($2::date + interval '7 days')
       ORDER BY mp.date ASC, mp.meal_type ASC`,
      [req.userId, week],
    );
    return res.json({ mealPlans: result.rows });
  } catch (err) {
    console.error("Error fetching meal plans:", err);
    return res.status(500).json({ message: "Error fetching meal plans" });
  }
});

app.post("/api/meal-plans/generate-list", authenticateToken, async (req, res) => {
  const { recipeIds, listId } = req.body;
  if (!recipeIds || !listId || !Array.isArray(recipeIds) || recipeIds.length === 0) {
    return res.status(400).json({ message: "recipeIds (array) and listId are required" });
  }
  try {
    // Verify list membership
    const membership = await db.query(
      "SELECT id FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId],
    );
    if (membership.rows.length === 0) {
      return res.status(403).json({ message: "Not a member of this list" });
    }

    // Fetch all recipes
    const placeholders = recipeIds.map((_, i) => `$${i + 1}`).join(",");
    const recipesResult = await db.query(
      `SELECT ingredients FROM app.recipes WHERE id IN (${placeholders}) AND user_id = $${recipeIds.length + 1}`,
      [...recipeIds, req.userId],
    );

    // Aggregate ingredients
    const ingredientMap = {};
    for (const recipe of recipesResult.rows) {
      const ingredients = recipe.ingredients || [];
      for (const ing of ingredients) {
        const key = (ing.name || "").toLowerCase().trim();
        if (!key) continue;
        if (ingredientMap[key]) {
          ingredientMap[key].quantity += parseFloat(ing.quantity) || 1;
        } else {
          ingredientMap[key] = {
            name: ing.name,
            quantity: parseFloat(ing.quantity) || 1,
            unit: ing.unit || null,
          };
        }
      }
    }

    // Insert aggregated ingredients as list items
    const addedItems = [];
    for (const ing of Object.values(ingredientMap)) {
      const itemName = ing.unit ? `${ing.name} (${ing.unit})` : ing.name;
      const result = await db.query(
        `INSERT INTO app.list_items (listId, itemName, quantity, addby, addat, updatedat)
         VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *`,
        [listId, itemName, ing.quantity, req.userId],
      );
      addedItems.push(result.rows[0]);
    }

    return res.json({ success: true, itemsAdded: addedItems.length, items: addedItems });
  } catch (err) {
    console.error("Error generating list from meal plans:", err);
    return res.status(500).json({ message: "Error generating list from meal plans" });
  }
});

// === PANTRY / EXPIRATION TRACKER ENDPOINTS ===
app.post("/api/pantry", authenticateToken, async (req, res) => {
  const { itemName, expiryDate, quantity } = req.body;
  if (!itemName || !expiryDate) {
    return res.status(400).json({ message: "itemName and expiryDate are required" });
  }
  try {
    const result = await db.query(
      `INSERT INTO app.pantry_items (user_id, item_name, expiry_date, quantity) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.userId, itemName, expiryDate, quantity || 1],
    );
    return res.status(201).json({ item: result.rows[0] });
  } catch (err) {
    console.error("Error adding pantry item:", err);
    return res.status(500).json({ message: "Error adding pantry item" });
  }
});

app.get("/api/pantry", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM app.pantry_items WHERE user_id = $1 ORDER BY expiry_date ASC`,
      [req.userId],
    );
    return res.json({ items: result.rows });
  } catch (err) {
    console.error("Error fetching pantry items:", err);
    return res.status(500).json({ message: "Error fetching pantry items" });
  }
});

app.delete("/api/pantry/:id", authenticateToken, async (req, res) => {
  const itemId = req.params.id;
  try {
    await db.query(
      `DELETE FROM app.pantry_items WHERE id = $1 AND user_id = $2`,
      [itemId, req.userId],
    );
    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting pantry item:", err);
    return res.status(500).json({ message: "Error deleting pantry item" });
  }
});

// Socket.io handlers
io.on("connection", (socket) => {
  socket.on("register_user", (userId) => {
    socket.join(`user_${userId}`);
    console.log(`משתמש ${userId} נרשם לחדר האישי שלו לקבלת התראות`);
  });
  socket.on("join_list", (listId) => {
    socket.join(listId);
    console.log(`משתמש הצטרף לרשימה מספר: ${listId}`);
  });
  socket.on("send_item", async (data) => {
    const {
      listId,
      itemName,
      price,
      storeName,
      quantity,
      addby,
      addat,
      updatedat,
      productId,
    } = data;
    try {
      const query = `INSERT INTO app.list_items (listId, itemName, price, storeName, quantity, addby, addat, updatedat, product_id, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
        COALESCE((SELECT MAX(sort_order) FROM app.list_items WHERE listid = $1), 0) + 1
      ) RETURNING *`;

      const values = [
        listId,
        itemName,
        price,
        storeName,
        quantity,
        addby,
        addat,
        updatedat,
        productId || null,
      ];
      const result = await db.query(query, values);
      const newItem = result.rows[0];

      io.to(String(listId)).emit("receive_item", newItem);

      // Activity log & Gamification
      logActivity(listId, addby, "item_added", `Added item: ${itemName}`);
      awardPoints(addby, 5, "item_added");

      // Push notification to other list members
      try {
        const members = await db.query(
          "SELECT user_id FROM app.list_members WHERE list_id = $1 AND user_id != $2",
          [listId, addby],
        );
        const memberIds = members.rows.map((m) => m.user_id);
        if (memberIds.length > 0) {
          const adderRes = await db.query("SELECT first_name FROM app2.users WHERE id = $1", [addby]);
          const adderName = adderRes.rows[0]?.first_name || "מישהו";
          sendPushNotifications(memberIds, "פריט חדש ברשימה", `${adderName} הוסיף ${itemName}`, { type: "item_added", listId });
        }
      } catch (pushErr) {
        // Non-critical, don't break main flow
      }
    } catch (e) {
      console.error("שגיאה בשמירה ל-DB:", e);
      console.error("Error details:", e.message);
    }
  });
  socket.on("toggle_item", async (data) => {
    const { itemId, listId, isChecked, userId } = data;
    try {
      await db.query(
        "UPDATE app.list_items SET is_checked = $1, checked_by = $2 WHERE id = $3",
        [isChecked, isChecked ? (userId || null) : null, itemId],
      );

      // Get user name for who checked it
      let checkedByName = null;
      if (isChecked && userId) {
        const userRes = await db.query(
          "SELECT first_name FROM app2.users WHERE id = $1",
          [userId],
        );
        checkedByName = userRes.rows[0]?.first_name || null;
      }

      io.to(String(listId)).emit("item_status_changed", { itemId, isChecked, checkedBy: isChecked ? userId : null, checkedByName });

      // Activity log
      logActivity(listId, userId || null, "item_toggled", `Item ${itemId} toggled to ${isChecked}`);

      // Gamification: check if all items in list are checked (list completed)
      if (isChecked && userId) {
        try {
          const allItems = await db.query(
            "SELECT COUNT(*) as total, COUNT(CASE WHEN is_checked = true THEN 1 END) as checked FROM app.list_items WHERE listid = $1",
            [listId],
          );
          const { total, checked } = allItems.rows[0];
          if (parseInt(total) > 0 && parseInt(total) === parseInt(checked)) {
            awardPoints(userId, 20, "list_completed");
          }
        } catch (gamErr) {
          // Non-critical
        }
      }
    } catch (err) {
      console.error(err);
    }
  });

  socket.on("delete_item", async (data) => {
    const { itemId, listId, userId } = data;
    try {
      await db.query("DELETE FROM app.list_items WHERE id = $1", [itemId]);
      io.to(String(listId)).emit("item_deleted", { itemId });

      // Activity log
      logActivity(listId, userId || null, "item_deleted", `Deleted item ${itemId}`);
    } catch (err) {
      console.error("Error deleting item:", err);
    }
  });

  socket.on("mark_paid", async (data) => {
    const { itemId, listId, userId } = data;
    try {
      const result = await db.query(
        "UPDATE app.list_items SET paid_by = $1, paid_at = NOW() WHERE id = $2 RETURNING paid_at",
        [userId, itemId],
      );
      const paid_at = result.rows[0]?.paid_at;

      // Get user name
      const userResult = await db.query(
        "SELECT first_name FROM app2.users WHERE id = $1",
        [userId],
      );
      const paid_by_name = userResult.rows[0]?.first_name;

      io.to(String(listId)).emit("item_paid", {
        itemId,
        paid_by: userId,
        paid_by_name,
        paid_at,
      });

      // Activity log & Gamification
      logActivity(listId, userId, "item_paid", `Paid for item ${itemId}`);
      awardPoints(userId, 10, "item_paid");
    } catch (err) {
      console.error("Error marking paid:", err);
    }
  });

  socket.on("unmark_paid", async (data) => {
    const { itemId, listId } = data;
    try {
      await db.query(
        "UPDATE app.list_items SET paid_by = NULL, paid_at = NULL WHERE id = $1",
        [itemId],
      );
      io.to(String(listId)).emit("item_unpaid", { itemId });
    } catch (err) {
      console.error("Error unmarking paid:", err);
    }
  });

  socket.on("update_quantity", async (data) => {
    const { itemId, listId, quantity } = data;
    try {
      await db.query(
        "UPDATE app.list_items SET quantity = $1 WHERE id = $2",
        [quantity, itemId],
      );
      io.to(String(listId)).emit("quantity_updated", { itemId, quantity });
    } catch (err) {
      console.error("Error updating quantity:", err);
    }
  });

  socket.on("update_note", async (data) => {
    const { itemId, listId, note, userId } = data;
    try {
      await db.query(
        "UPDATE app.list_items SET note = $1, note_by = $2 WHERE id = $3",
        [note || null, userId, itemId],
      );

      // Get user name
      const userResult = await db.query(
        "SELECT first_name FROM app2.users WHERE id = $1",
        [userId],
      );
      const note_by_name = userResult.rows[0]?.first_name;

      io.to(String(listId)).emit("note_updated", {
        itemId,
        note,
        note_by: userId,
        note_by_name,
      });
    } catch (err) {
      console.error("Error updating note:", err);
    }
  });

  socket.on("create_list", async (list, callback) => {
    const { list_name, userId } = list;
    if (!list_name || !userId)
      return callback({ success: false, error: `missing data` });
    try {
      // Check if user is a child account (prevent children from creating lists)
      const userCheck = await db.query(
        "SELECT parent_id FROM app2.users WHERE id = $1",
        [userId],
      );
      if (userCheck.rows.length === 0) {
        return callback({ success: false, error: "User not found" });
      }
      if (userCheck.rows[0].parent_id !== null) {
        return callback({
          success: false,
          error: "Child accounts cannot create lists",
        });
      }

      const listRes = await db.query(
        `INSERT INTO app.list (list_name) VALUES ($1) RETURNING id`,
        [list_name],
      );
      const newListId = listRes.rows[0].id;
      await db.query(
        `INSERT INTO app.list_members (list_id, user_id, status) VALUES ($1, $2, $3)`,
        [newListId, userId, "admin"],
      );
      callback({ success: true, listId: newListId });
    } catch (e) {
      console.error(e);
      callback({ success: false, msg: `db eror` });
    }
    socket.on("user_joined", async (data, callback) => {
      const listId = data.listid;
      const userId = data.user_id;
      try {
        const checkQuery = await db.query(
          `SELECT * FROM app.list_users WHERE list_id = $1 AND user_id = $2`,
          [listId, userId],
        );
        if (checkQuery.rows.length === 0) {
          await db.query(
            `INSERT INTO app.list_users (list_id, user_id) VALUES ($1, $2)`,
            [listId, userId],
          );
        }
        socket.join(listId);
        socket.to(listId).emit("notification", {
          message: `משתמש חדש הצטרף לרשימה!`,
          userId: userId,
        });
      } catch (e) {
        callback({ success: false, msg: `db eror` });
      }
    });
  });

  // DELETE ITEM
  socket.on("delete_item", async (data) => {
    const { itemId, listId } = data;
    try {
      await db.query("DELETE FROM app.list_items WHERE id = $1", [itemId]);
      io.to(listId).emit("item_deleted", { itemId });
    } catch (err) {
      console.error("Error deleting item:", err);
    }
  });

  // MARK PAID
  socket.on("mark_paid", async (data) => {
    const { itemId, listId, userId } = data;
    try {
      await db.query("UPDATE app.list_items SET paid_by = $1 WHERE id = $2", [
        userId,
        itemId,
      ]);
      const userRes = await db.query(
        "SELECT first_name FROM app2.users WHERE id = $1",
        [userId],
      );
      const userName = userRes.rows[0]?.first_name || "User";

      io.to(listId).emit("item_paid_status", {
        itemId,
        paidBy: userId,
        paidByName: userName,
      });
    } catch (err) {
      console.error("Error marking paid:", err);
    }
  });

  // UNMARK PAID
  socket.on("unmark_paid", async (data) => {
    const { itemId, listId } = data;
    try {
      await db.query("UPDATE app.list_items SET paid_by = NULL WHERE id = $1", [
        itemId,
      ]);
      io.to(listId).emit("item_paid_status", { itemId, paidBy: null });
    } catch (err) {
      console.error("Error unmarking paid:", err);
    }
  });

  // ADD COMMENT
  socket.on("add_comment", async (data) => {
    const { itemId, listId, userId, comment } = data;
    try {
      // Check if user already has a comment on this item
      const existingComment = await db.query(
        `SELECT id FROM app.list_item_comments WHERE item_id = $1 AND user_id = $2`,
        [itemId, userId],
      );

      if (existingComment.rows.length > 0) {
        console.log(`User ${userId} already has a comment on item ${itemId}`);
        return;
      }

      const result = await db.query(
        `INSERT INTO app.list_item_comments (item_id, user_id, comment, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id, created_at`,
        [itemId, userId, comment],
      );

      const userRes = await db.query(
        "SELECT first_name FROM app2.users WHERE id = $1",
        [userId],
      );
      const userName = userRes.rows[0]?.first_name || "User";

      const newComment = {
        id: result.rows[0].id,
        item_id: itemId,
        user_id: userId,
        first_name: userName,
        comment: comment,
        created_at: result.rows[0].created_at,
      };

      io.to(String(listId)).emit("receive_comment", {
        itemId,
        comment: newComment,
      });
    } catch (err) {
      console.error("Error adding comment:", err);
    }
  });

  // === CHAT PER LIST ===
  socket.on("send_chat_message", async (data) => {
    const { listId, userId, message } = data;
    try {
      const result = await db.query(
        `INSERT INTO app.list_chat (list_id, user_id, message) VALUES ($1, $2, $3) RETURNING id, created_at`,
        [listId, userId, message],
      );
      const userRes = await db.query(
        "SELECT first_name FROM app2.users WHERE id = $1",
        [userId],
      );
      const firstName = userRes.rows[0]?.first_name || "User";
      io.to(String(listId)).emit("receive_chat_message", {
        id: result.rows[0].id,
        listId,
        userId,
        firstName,
        message,
        createdAt: result.rows[0].created_at,
      });
    } catch (err) {
      console.error("Error sending chat message:", err);
    }
  });

  // === SHOPPING ASSIGNMENT ===
  socket.on("assign_item", async (data) => {
    const { itemId, listId, assignedTo } = data;
    try {
      await db.query(
        "UPDATE app.list_items SET assigned_to = $1 WHERE id = $2",
        [assignedTo, itemId],
      );
      let assignedToName = null;
      if (assignedTo) {
        const userRes = await db.query(
          "SELECT first_name FROM app2.users WHERE id = $1",
          [assignedTo],
        );
        assignedToName = userRes.rows[0]?.first_name || null;
      }
      io.to(String(listId)).emit("item_assigned", {
        itemId,
        assignedTo,
        assignedToName,
      });
    } catch (err) {
      console.error("Error assigning item:", err);
    }
  });

  // Reorder items
  socket.on("reorder_items", async (data) => {
    const { listId, items } = data;
    if (!items || !Array.isArray(items)) return;
    try {
      for (const item of items) {
        await db.query(
          "UPDATE app.list_items SET sort_order = $1 WHERE id = $2 AND listid = $3",
          [item.sortOrder, item.itemId, listId]
        );
      }
      socket.to(String(listId)).emit("items_reordered", { items });
    } catch (err) {
      console.error("Error reordering items:", err);
    }
  });
});

// === CRON JOB: Recurring Lists ===
// Runs daily at 8:00 AM to create lists from scheduled templates
cron.schedule("0 8 * * *", async () => {
  console.log("Running recurring lists cron job...");
  try {
    // Get all active schedules where next_run has passed
    const { rows: dueSchedules } = await db.query(
      `SELECT ts.id, ts.template_id, ts.user_id, ts.frequency,
              lt.template_name
       FROM app.template_schedules ts
       JOIN app.list_templates lt ON lt.id = ts.template_id
       WHERE ts.active = true AND ts.next_run <= NOW()`,
    );

    for (const schedule of dueSchedules) {
      try {
        // Get template items
        const { rows: templateItems } = await db.query(
          `SELECT item_name, quantity, note, sort_order
           FROM app.template_items
           WHERE template_id = $1
           ORDER BY sort_order ASC`,
          [schedule.template_id],
        );

        if (templateItems.length === 0) {
          console.log(`Template ${schedule.template_id} has no items, skipping.`);
          continue;
        }

        // Create a new list from the template
        const listRes = await db.query(
          `INSERT INTO app.list (list_name) VALUES ($1) RETURNING id`,
          [schedule.template_name],
        );
        const newListId = listRes.rows[0].id;

        // Add the user as admin of the new list
        await db.query(
          `INSERT INTO app.list_members (list_id, user_id, status) VALUES ($1, $2, 'admin')`,
          [newListId, schedule.user_id],
        );

        // Add all template items to the new list
        for (const item of templateItems) {
          await db.query(
            `INSERT INTO app.list_items (listId, itemName, quantity, addby, addat, updatedat)
             VALUES ($1, $2, $3, $4, NOW(), NOW())`,
            [newListId, item.item_name, item.quantity || 1, schedule.user_id],
          );
        }

        // Calculate next_run based on frequency
        let intervalExpression;
        if (schedule.frequency === "weekly") {
          intervalExpression = "7 days";
        } else if (schedule.frequency === "biweekly") {
          intervalExpression = "14 days";
        } else {
          intervalExpression = "1 month";
        }

        // Update next_run for this schedule
        await db.query(
          `UPDATE app.template_schedules SET next_run = NOW() + interval '${intervalExpression}' WHERE id = $1`,
          [schedule.id],
        );

        console.log(`Created list "${schedule.template_name}" (ID: ${newListId}) from template ${schedule.template_id} for user ${schedule.user_id}`);
      } catch (scheduleErr) {
        console.error(`Error processing schedule ${schedule.id}:`, scheduleErr);
      }
    }

    if (dueSchedules.length === 0) {
      console.log("No recurring lists due at this time.");
    } else {
      console.log(`Processed ${dueSchedules.length} recurring list schedule(s).`);
    }
  } catch (err) {
    console.error("Error in recurring lists cron job:", err);
  }
});

// === CRON JOB: Pantry Expiration Notifications ===
// Runs daily at 7:00 AM to notify users about items expiring within 2 days
cron.schedule("0 7 * * *", async () => {
  console.log("Running pantry expiration check cron job...");
  try {
    const result = await db.query(
      `SELECT pi.id, pi.user_id, pi.item_name, pi.expiry_date, pi.quantity
       FROM app.pantry_items pi
       WHERE pi.expiry_date <= CURRENT_DATE + interval '2 days'
         AND pi.expiry_date >= CURRENT_DATE`,
    );

    // Group by user
    const userItems = {};
    for (const row of result.rows) {
      if (!userItems[row.user_id]) {
        userItems[row.user_id] = [];
      }
      userItems[row.user_id].push(row);
    }

    for (const [userId, items] of Object.entries(userItems)) {
      const itemNames = items.map((i) => i.item_name).join(", ");
      await sendPushNotifications(
        [parseInt(userId)],
        "פריטים עומדים לפוג תוקף!",
        `הפריטים הבאים עומדים לפוג: ${itemNames}`,
        { type: "pantry_expiry" },
      );
    }

    console.log(`Pantry expiration check: notified ${Object.keys(userItems).length} user(s).`);
  } catch (err) {
    console.error("Error in pantry expiration cron job:", err);
  }
});

// === CRON JOB: Price Alert Notifications ===
// Runs daily at 9:00 AM to check active price alerts against current prices
cron.schedule("0 9 * * *", async () => {
  console.log("Running price alerts cron job...");
  try {
    const result = await db.query(
      `SELECT pa.id, pa.user_id, pa.item_id, pa.target_price,
              i.name AS item_name,
              MIN(p.price) AS current_price
       FROM app.price_alerts pa
       JOIN app.items i ON pa.item_id = i.id
       LEFT JOIN app.prices p ON p.item_id = pa.item_id
       WHERE pa.active = true
       GROUP BY pa.id, pa.user_id, pa.item_id, pa.target_price, i.name
       HAVING MIN(p.price) <= pa.target_price`,
    );

    for (const alert of result.rows) {
      await sendPushNotifications(
        [alert.user_id],
        "התראת מחיר!",
        `${alert.item_name} ירד ל-${alert.current_price} ₪ (יעד: ${alert.target_price} ₪)`,
        { type: "price_alert", itemId: alert.item_id },
      );
    }

    console.log(`Price alerts check: sent ${result.rows.length} notification(s).`);
  } catch (err) {
    console.error("Error in price alerts cron job:", err);
  }
});

server.listen(port, () => {
  console.log(`SmartCart Server running on port : ${port}`);
});
