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
import crypto from "crypto";

config();
const port = process.env.PORT || 3001;
const app = express();
const server = http.createServer(app);
const saltRounds = 10;

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
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
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    return res.status(403).json({ message: "Invalid token" });
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
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: "http://localhost:5173",
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

app.get("/api/search", async (req, res) => {
  console.log(req.query);
  const search = req.query.q;
  if (!search) return res.json([]);
  try {
    const searchTerm = `%${search}%`;
    const reply = await db.query(
      `SELECT * FROM app.items WHERE name ILIKE $1
      limit 10`,
      [searchTerm],
    );
    console.log("Searching for:", searchTerm);
    res.json(reply.rows);
  } catch (e) {
    console.error(e);
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
    res.clearCookie("refreshToken", { path: "/api/refresh" });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
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

// LOGIN (supports email or username)
app.post("/api/login", async (req, res) => {
  const { email, username, password } = req.body;
  const loginId = email || username;

  if (!loginId || !password) {
    return res
      .status(400)
      .json({ message: "Email/username and password are required" });
  }

  try {
    // Try email first, then username
    const results = await db.query(
      "SELECT * FROM app2.users WHERE email = $1 OR username = $1",
      [loginId],
    );
    if (results.rows.length === 0)
      return res.status(400).json({ message: "Invalid credentials" });

    const user = results.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const { accessToken, refreshToken } = await generateTokens(user.id);

    // Clear stale cookie at old path to prevent duplicate cookie issues
    res.clearCookie("refreshToken", { path: "/api/refresh" });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      user: {
        id: user.id,
        first_name: user.first_name,
        email: user.email,
        username: user.username,
        parent_id: user.parent_id,
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

    // Clear stale cookie at old path
    res.clearCookie("refreshToken", { path: "/api/refresh" });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

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

    return res.status(200).json({ user: results.rows[0] }); // id, first_name, last_name, email returns all user data
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
      sameSite: "strict",
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

// STORE - browse products with search, category, price & sort filters
app.get("/api/store", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 12;
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.q;
    const category = req.query.category;
    const minPrice = parseFloat(req.query.minPrice);
    const maxPrice = parseFloat(req.query.maxPrice);
    const sort = req.query.sort;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`i.name ILIKE $${idx}`);
      params.push(`%${search}%`);
      idx++;
    }
    if (category) {
      conditions.push(`i.category = $${idx}`);
      params.push(category);
      idx++;
    }
    if (!isNaN(minPrice)) {
      conditions.push(`p.price >= $${idx}`);
      params.push(minPrice);
      idx++;
    }
    if (!isNaN(maxPrice)) {
      conditions.push(`p.price <= $${idx}`);
      params.push(maxPrice);
      idx++;
    }

    let outerOrderBy = "item_id, chain_id";
    if (sort === "price_asc") outerOrderBy = "price ASC NULLS LAST";
    else if (sort === "price_desc") outerOrderBy = "price DESC NULLS LAST";
    else if (sort === "name_asc") outerOrderBy = "item_name ASC";

    // Always filter out items with empty/null names
    conditions.push(`i.name IS NOT NULL`);
    conditions.push(`i.name <> ''`);
    const whereClause2 = `WHERE ${conditions.join(" AND ")}`;

    const query = `
      SELECT * FROM (
        SELECT DISTINCT ON (i.id, c.id)
              i.id AS item_id, i.name AS item_name, i.description, i.category,
              p.price AS price,
              c.id AS chain_id, c.name AS chain_name
           FROM app.items i
           JOIN app.prices p ON i.id = p.item_id
           JOIN app.branches b ON p.branch_id = b.id
           JOIN app.chains c ON b.chain_id = c.id
           ${whereClause2}
           ORDER BY i.id, c.id, p.price
      ) sub
      ORDER BY ${outerOrderBy}
      LIMIT $${idx} OFFSET $${idx + 1}`;

    params.push(limit, offset);
    const results = await db.query(query, params);

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

// GET single product with pricing
app.get("/api/products/:id", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT ON (i.id, c.id)
            i.id AS item_id, i.name AS item_name, i.description, i.category,
            p.price AS price,
            c.id AS chain_id, c.name AS chain_name
       FROM app.items i
       JOIN app.prices p ON i.id = p.item_id
       JOIN app.branches b ON p.branch_id = b.id
       JOIN app.chains c ON b.chain_id = c.id
       WHERE i.id = $1
       ORDER BY i.id, c.id, p.price`,
      [req.params.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    return res.json({ product: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching product" });
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

// ==================== LIST MANAGEMENT ROUTES ====================

// GET /api/lists - Get all lists for authenticated user (children see parent's lists)
app.get("/api/lists", authenticateToken, async (req, res) => {
  try {
    const results = await db.query(
      `SELECT l.id, l.list_name, l.status, l.created_at, lm.status AS role,
              (SELECT COUNT(*) FROM app.list_members WHERE list_id = l.id) AS member_count,
              (SELECT COUNT(*) FROM app.list_items WHERE listid = l.id) AS item_count
       FROM app.list l
       JOIN app.list_members lm ON l.id = lm.list_id
       WHERE lm.user_id = $1
       ORDER BY l.updated_at DESC`,
      [req.userId],
    );
    return res.json({ lists: results.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching lists" });
  }
});

// POST /api/lists/:listId/items - Add an item to a list (REST API)
app.post("/api/lists/:listId/items", authenticateToken, async (req, res) => {
  const { listId } = req.params;
  const { itemName, price, storeName, quantity, productId } = req.body;
  if (!itemName)
    return res.status(400).json({ message: "Item name is required" });
  try {
    // Verify membership
    const memberCheck = await db.query(
      "SELECT 1 FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId],
    );
    if (memberCheck.rows.length === 0)
      return res.status(403).json({ message: "Not a member" });

    const result = await db.query(
      `INSERT INTO app.list_items (listid, itemname, price, storename, quantity, addby, addat, updatedat, product_id)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7) RETURNING *`,
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

    // Resolve who added the item
    const userRes = await db.query(
      "SELECT first_name FROM app2.users WHERE id = $1",
      [req.userId],
    );
    newItem.added_by_name = userRes.rows[0]?.first_name || "";

    // Broadcast to list room via socket
    io.to(String(listId)).emit("receive_item", newItem);

    return res.status(201).json({ item: newItem });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error adding item" });
  }
});

// GET /api/lists/:listId/items - Get items for a list
app.get("/api/lists/:listId/items", authenticateToken, async (req, res) => {
  const { listId } = req.params;
  try {
    const memberCheck = await db.query(
      "SELECT status FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId],
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ message: "Not a member of this list" });
    }

    const items = await db.query(
      `SELECT li.*, u.first_name AS added_by_name,
              pu.first_name AS paid_by_name
       FROM app.list_items li
       LEFT JOIN app2.users u ON li.addby = u.id
       LEFT JOIN app2.users pu ON li.paid_by = pu.id
       WHERE li.listid = $1
       ORDER BY li.addat DESC`,
      [listId],
    );

    const list = await db.query("SELECT * FROM app.list WHERE id = $1", [
      listId,
    ]);

    const members = await db.query(
      `SELECT lm.user_id, lm.status AS role, u.first_name, u.last_name
       FROM app.list_members lm
       JOIN app2.users u ON lm.user_id = u.id
       WHERE lm.list_id = $1`,
      [listId],
    );

    return res.json({
      list: list.rows[0],
      items: items.rows,
      members: members.rows,
      userRole: memberCheck.rows[0].status,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching list items" });
  }
});

// GET /api/lists/:listId/compare - Multi-chain price comparison
app.get("/api/lists/:listId/compare", authenticateToken, async (req, res) => {
  const { listId } = req.params;
  try {
    // Verify membership
    const memberCheck = await db.query(
      "SELECT 1 FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId],
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ message: "Not a member of this list" });
    }

    // Get all list items
    const itemsResult = await db.query(
      "SELECT id, \"itemname\", price, quantity, product_id FROM app.list_items WHERE listid = $1",
      [listId],
    );
    const allItems = itemsResult.rows;
    const linked = allItems.filter((i) => i.product_id != null);
    const unlinked = allItems.filter((i) => i.product_id == null);

    if (linked.length === 0) {
      return res.json({
        chains: [],
        linkedCount: 0,
        unlinkedCount: unlinked.length,
      });
    }

    const productIds = linked.map((i) => i.product_id);

    // Get cheapest price per product per chain
    const pricesResult = await db.query(
      `SELECT DISTINCT ON (p.item_id, c.id)
         p.item_id AS product_id,
         c.id AS chain_id,
         c.name AS chain_name,
         p.price
       FROM app.prices p
       JOIN app.branches b ON p.branch_id = b.id
       JOIN app.chains c ON b.chain_id = c.id
       WHERE p.item_id = ANY($1)
       ORDER BY p.item_id, c.id, p.price ASC`,
      [productIds],
    );

    // Build lookup: productId -> chainId -> price
    const priceLookup = {};
    for (const row of pricesResult.rows) {
      if (!priceLookup[row.product_id]) priceLookup[row.product_id] = {};
      priceLookup[row.product_id][row.chain_id] = {
        price: parseFloat(row.price),
        chainName: row.chain_name,
      };
    }

    // Collect all chains
    const chainMap = {};
    for (const row of pricesResult.rows) {
      if (!chainMap[row.chain_id]) {
        chainMap[row.chain_id] = { chainId: row.chain_id, chainName: row.chain_name };
      }
    }

    // Build per-chain totals
    const chains = Object.values(chainMap).map((chain) => {
      let total = 0;
      let missingCount = 0;
      const items = linked.map((li) => {
        const qty = parseFloat(li.quantity) || 1;
        const chainPrice = priceLookup[li.product_id]?.[chain.chainId];
        if (chainPrice) {
          total += chainPrice.price * qty;
          return {
            itemName: li.itemname,
            quantity: qty,
            price: chainPrice.price,
            subtotal: chainPrice.price * qty,
            available: true,
          };
        } else {
          missingCount++;
          return {
            itemName: li.itemname,
            quantity: qty,
            price: null,
            subtotal: 0,
            available: false,
          };
        }
      });

      return {
        chainId: chain.chainId,
        chainName: chain.chainName,
        total: Math.round(total * 100) / 100,
        complete: missingCount === 0,
        missingCount,
        items,
      };
    });

    // Sort: complete chains first (by total ASC), then incomplete (by total ASC)
    chains.sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? -1 : 1;
      return a.total - b.total;
    });

    return res.json({
      chains,
      linkedCount: linked.length,
      unlinkedCount: unlinked.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error comparing prices" });
  }
});

// DELETE /api/lists/:listId/items/:itemId
app.delete(
  "/api/lists/:listId/items/:itemId",
  authenticateToken,
  async (req, res) => {
    const { listId, itemId } = req.params;
    try {
      const memberCheck = await db.query(
        "SELECT 1 FROM app.list_members WHERE list_id = $1 AND user_id = $2",
        [listId, req.userId],
      );
      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ message: "Not a member of this list" });
      }
      await db.query(
        "DELETE FROM app.list_items WHERE id = $1 AND listid = $2",
        [itemId, listId],
      );
      return res.json({ message: "Item deleted" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Error deleting item" });
    }
  },
);

// GET /api/lists/:listId/items/:itemId/comments
app.get(
  "/api/lists/:listId/items/:itemId/comments",
  authenticateToken,
  async (req, res) => {
    const { listId, itemId } = req.params;
    try {
      const memberCheck = await db.query(
        "SELECT 1 FROM app.list_members WHERE list_id = $1 AND user_id = $2",
        [listId, req.userId],
      );
      if (memberCheck.rows.length === 0) {
        return res.status(403).json({ message: "Not a member of this list" });
      }
      const comments = await db.query(
        `SELECT c.*, u.first_name AS user_name
       FROM app.list_item_comments c
       LEFT JOIN app2.users u ON c.user_id = u.id
       WHERE c.item_id = $1
       ORDER BY c.created_at ASC`,
        [itemId],
      );
      return res.json({ comments: comments.rows });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Error fetching comments" });
    }
  },
);

// ==================== INVITE LINK ROUTES ====================

// POST /api/lists/:listId/invite - Generate invite link (admin only)
app.post("/api/lists/:listId/invite", authenticateToken, async (req, res) => {
  const { listId } = req.params;
  try {
    const memberCheck = await db.query(
      "SELECT status FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId],
    );
    if (
      memberCheck.rows.length === 0 ||
      memberCheck.rows[0].status !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "Only admins can create invite links" });
    }
    const inviteCode = crypto.randomBytes(16).toString("hex");
    await db.query(
      `INSERT INTO app.list_invites (list_id, invite_code, created_by, expires_at)
       VALUES ($1, $2, $3, NOW() + interval '7 days')`,
      [listId, inviteCode, req.userId],
    );
    return res.json({
      inviteCode,
      inviteLink: `http://localhost:5173/join/${inviteCode}`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error creating invite" });
  }
});

// POST /api/join/:inviteCode - Join list via invite
app.post("/api/join/:inviteCode", authenticateToken, async (req, res) => {
  const { inviteCode } = req.params;
  try {
    const invite = await db.query(
      `SELECT * FROM app.list_invites
       WHERE invite_code = $1 AND is_active = true
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (max_uses IS NULL OR use_count < max_uses)`,
      [inviteCode],
    );
    if (invite.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Invalid or expired invite link" });
    }
    const inv = invite.rows[0];

    // Check if already a member
    const existing = await db.query(
      "SELECT 1 FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [inv.list_id, req.userId],
    );
    if (existing.rows.length > 0) {
      return res.json({
        success: true,
        listId: inv.list_id,
        message: "Already a member",
      });
    }

    await db.query(
      "INSERT INTO app.list_members (list_id, user_id, status) VALUES ($1, $2, 'member')",
      [inv.list_id, req.userId],
    );
    await db.query(
      "UPDATE app.list_invites SET use_count = use_count + 1 WHERE id = $1",
      [inv.id],
    );

    const list = await db.query(
      "SELECT list_name FROM app.list WHERE id = $1",
      [inv.list_id],
    );
    return res.json({
      success: true,
      listId: inv.list_id,
      listName: list.rows[0]?.list_name,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error joining list" });
  }
});

// ==================== BARCODE LOOKUP ====================

app.get("/api/items/barcode/:barcode", async (req, res) => {
  const { barcode } = req.params;
  try {
    const result = await db.query(
      `SELECT i.id, i.name, i.barcode, i.manufacturer, i.category,
              p.price, c.name AS chain_name, b.branch_name
       FROM app.items i
       JOIN app.prices p ON i.id = p.item_id
       JOIN app.branches b ON p.branch_id = b.id
       JOIN app.chains c ON b.chain_id = c.id
       WHERE i.barcode = $1
       ORDER BY p.price ASC`,
      [barcode],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    const item = {
      id: result.rows[0].id,
      name: result.rows[0].name,
      barcode: result.rows[0].barcode,
      manufacturer: result.rows[0].manufacturer,
      category: result.rows[0].category,
    };
    const prices = result.rows.map((r) => ({
      price: r.price,
      chain_name: r.chain_name,
      branch_name: r.branch_name,
    }));
    return res.json({ item, prices });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error looking up barcode" });
  }
});

// ==================== PRODUCT FILTERING ====================

app.get("/api/categories", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT DISTINCT category FROM app.items WHERE category IS NOT NULL AND category <> '' ORDER BY category",
    );
    return res.json({ categories: result.rows.map((r) => r.category) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching categories" });
  }
});

app.get("/api/chains-list", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name FROM app.chains ORDER BY name",
    );
    return res.json({ chains: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching chains" });
  }
});

// ==================== TEMPLATE ROUTES ====================

// GET /api/templates
app.get("/api/templates", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.id, t.template_name, t.created_at,
              (SELECT COUNT(*) FROM app.template_items WHERE template_id = t.id) AS item_count
       FROM app.list_templates t
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC`,
      [req.userId],
    );
    return res.json({ templates: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching templates" });
  }
});

// GET /api/templates/:templateId
app.get("/api/templates/:templateId", authenticateToken, async (req, res) => {
  const { templateId } = req.params;
  try {
    const template = await db.query(
      "SELECT * FROM app.list_templates WHERE id = $1 AND user_id = $2",
      [templateId, req.userId],
    );
    if (template.rows.length === 0) {
      return res.status(404).json({ message: "Template not found" });
    }
    const items = await db.query(
      "SELECT * FROM app.template_items WHERE template_id = $1 ORDER BY sort_order",
      [templateId],
    );
    return res.json({ template: template.rows[0], items: items.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching template" });
  }
});

// POST /api/templates - Save list as template
app.post("/api/templates", authenticateToken, async (req, res) => {
  const { listId, templateName } = req.body;
  try {
    const memberCheck = await db.query(
      "SELECT 1 FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId],
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ message: "Not a member of this list" });
    }
    const tmpl = await db.query(
      "INSERT INTO app.list_templates (user_id, template_name, source_list_id) VALUES ($1, $2, $3) RETURNING id",
      [req.userId, templateName, listId],
    );
    const templateId = tmpl.rows[0].id;

    await db.query(
      `INSERT INTO app.template_items (template_id, item_name, quantity, note, sort_order)
       SELECT $1, itemname, quantity, note, ROW_NUMBER() OVER (ORDER BY addat)
       FROM app.list_items WHERE listid = $2`,
      [templateId, listId],
    );
    return res.status(201).json({ templateId, message: "Template saved" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error saving template" });
  }
});

// POST /api/templates/:templateId/apply - Create list from template
app.post(
  "/api/templates/:templateId/apply",
  authenticateToken,
  async (req, res) => {
    const { templateId } = req.params;
    const { listName } = req.body;
    try {
      const template = await db.query(
        "SELECT * FROM app.list_templates WHERE id = $1 AND user_id = $2",
        [templateId, req.userId],
      );
      if (template.rows.length === 0) {
        return res.status(404).json({ message: "Template not found" });
      }
      const name = listName || template.rows[0].template_name;
      const listRes = await db.query(
        "INSERT INTO app.list (list_name) VALUES ($1) RETURNING id",
        [name],
      );
      const newListId = listRes.rows[0].id;
      await db.query(
        "INSERT INTO app.list_members (list_id, user_id, status) VALUES ($1, $2, 'admin')",
        [newListId, req.userId],
      );
      await db.query(
        `INSERT INTO app.list_items (listid, itemname, quantity, note, addby, addat, updatedat)
       SELECT $1, item_name, quantity, note, $2, NOW(), NOW()
       FROM app.template_items WHERE template_id = $3 ORDER BY sort_order`,
        [newListId, req.userId, templateId],
      );
      return res
        .status(201)
        .json({ listId: newListId, message: "List created from template" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Error applying template" });
    }
  },
);

// DELETE /api/templates/:templateId
app.delete(
  "/api/templates/:templateId",
  authenticateToken,
  async (req, res) => {
    const { templateId } = req.params;
    try {
      const result = await db.query(
        "DELETE FROM app.list_templates WHERE id = $1 AND user_id = $2",
        [templateId, req.userId],
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Template not found" });
      }
      return res.json({ message: "Template deleted" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Error deleting template" });
    }
  },
);

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

// ==================== FAMILY MANAGEMENT ROUTES ====================

// POST /api/family/create-child - Parent creates a child account
app.post("/api/family/create-child", authenticateToken, async (req, res) => {
  const { firstName, username, password } = req.body;
  if (!firstName || !username || !password) {
    return res.status(400).json({ message: "כל השדות נדרשים" });
  }
  if (password.length < 4) {
    return res
      .status(400)
      .json({ message: "הסיסמה חייבת להיות לפחות 4 תווים" });
  }
  try {
    // Check username uniqueness
    const existing = await db.query(
      "SELECT 1 FROM app2.users WHERE username = $1",
      [username],
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "שם המשתמש כבר תפוס" });
    }
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const result = await db.query(
      `INSERT INTO app2.users (first_name, username, password_hash, parent_id)
       VALUES ($1, $2, $3, $4) RETURNING id, first_name, username`,
      [firstName, username, hashedPassword, req.userId],
    );
    return res
      .status(201)
      .json({ message: "החשבון נוצר בהצלחה", child: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "שגיאה ביצירת החשבון" });
  }
});

// GET /api/family/children - Get parent's child accounts
app.get("/api/family/children", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, first_name, username, created_at
       FROM app2.users WHERE parent_id = $1
       ORDER BY created_at DESC`,
      [req.userId],
    );
    return res.json({ children: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "שגיאה בטעינת הילדים" });
  }
});

// DELETE /api/family/delete-child/:childId - Delete a child account
app.delete(
  "/api/family/delete-child/:childId",
  authenticateToken,
  async (req, res) => {
    const { childId } = req.params;
    try {
      const result = await db.query(
        "DELETE FROM app2.users WHERE id = $1 AND parent_id = $2",
        [childId, req.userId],
      );
      if (result.rowCount === 0)
        return res.status(404).json({ message: "חשבון לא נמצא" });
      return res.json({ message: "החשבון נמחק בהצלחה" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "שגיאה במחיקת החשבון" });
    }
  },
);

// GET /api/family/parents - Check if user is a child account
app.get("/api/family/parents", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT parent_id FROM app2.users WHERE id = $1 AND parent_id IS NOT NULL`,
      [req.userId],
    );
    if (result.rows.length === 0) return res.json({ isChild: false });
    const parent = await db.query(
      "SELECT id, first_name FROM app2.users WHERE id = $1",
      [result.rows[0].parent_id],
    );
    return res.json({ isChild: true, parent: parent.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "שגיאה" });
  }
});

// ==================== CHILD LIST ACCESS ROUTES ====================

// GET /api/lists/:listId/children - Get children with membership status
app.get("/api/lists/:listId/children", authenticateToken, async (req, res) => {
  const { listId } = req.params;
  try {
    // Verify parent is admin of this list
    const adminCheck = await db.query(
      "SELECT 1 FROM app.list_members WHERE list_id = $1 AND user_id = $2 AND status = 'admin'",
      [listId, req.userId],
    );
    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ message: "Admin access required" });
    }

    // Get all children with their membership status for this list
    const result = await db.query(
      `SELECT u.id, u.first_name, u.username,
              CASE WHEN lm.id IS NOT NULL THEN true ELSE false END AS is_member
       FROM app2.users u
       LEFT JOIN app.list_members lm ON lm.list_id = $1 AND lm.user_id = u.id
       WHERE u.parent_id = $2
       ORDER BY u.first_name`,
      [listId, req.userId],
    );
    return res.json({ children: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching children" });
  }
});

// POST /api/lists/:listId/children/:childId - Add child to list
app.post("/api/lists/:listId/children/:childId", authenticateToken, async (req, res) => {
  const { listId, childId } = req.params;
  try {
    // Verify parent is admin
    const adminCheck = await db.query(
      "SELECT 1 FROM app.list_members WHERE list_id = $1 AND user_id = $2 AND status = 'admin'",
      [listId, req.userId],
    );
    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ message: "Admin access required" });
    }

    // Verify child belongs to this parent
    const childCheck = await db.query(
      "SELECT 1 FROM app2.users WHERE id = $1 AND parent_id = $2",
      [childId, req.userId],
    );
    if (childCheck.rows.length === 0) {
      return res.status(403).json({ message: "Not your child" });
    }

    await db.query(
      `INSERT INTO app.list_members (list_id, user_id, status)
       VALUES ($1, $2, 'member')
       ON CONFLICT (list_id, user_id) DO NOTHING`,
      [listId, childId],
    );
    return res.json({ message: "Child added to list" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error adding child" });
  }
});

// DELETE /api/lists/:listId/children/:childId - Remove child from list
app.delete("/api/lists/:listId/children/:childId", authenticateToken, async (req, res) => {
  const { listId, childId } = req.params;
  try {
    // Verify parent is admin
    const adminCheck = await db.query(
      "SELECT 1 FROM app.list_members WHERE list_id = $1 AND user_id = $2 AND status = 'admin'",
      [listId, req.userId],
    );
    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ message: "Admin access required" });
    }

    // Verify child belongs to this parent
    const childCheck = await db.query(
      "SELECT 1 FROM app2.users WHERE id = $1 AND parent_id = $2",
      [childId, req.userId],
    );
    if (childCheck.rows.length === 0) {
      return res.status(403).json({ message: "Not your child" });
    }

    await db.query(
      "DELETE FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, childId],
    );
    return res.json({ message: "Child removed from list" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error removing child" });
  }
});

// ==================== KID REQUEST ROUTES ====================

// POST /api/kid-requests - Kid creates a product request
app.post("/api/kid-requests", authenticateToken, async (req, res) => {
  const { listId, itemName, price, storeName, quantity, productId } = req.body;
  if (!listId || !itemName)
    return res.status(400).json({ message: "Missing fields" });
  try {
    // Get parent from user record
    const userRow = await db.query(
      "SELECT first_name, parent_id FROM app2.users WHERE id = $1",
      [req.userId],
    );
    const parentId = userRow.rows[0]?.parent_id;
    if (!parentId) return res.status(400).json({ message: "No linked parent" });

    // Verify child is a member of the list
    const memberCheck = await db.query(
      "SELECT 1 FROM app.list_members WHERE list_id = $1 AND user_id = $2",
      [listId, req.userId],
    );
    if (memberCheck.rows.length === 0)
      return res.status(403).json({ message: "Not a member" });

    const listRes = await db.query(
      "SELECT list_name FROM app.list WHERE id = $1",
      [listId],
    );

    const result = await db.query(
      `INSERT INTO app2.kid_requests (child_id, parent_id, list_id, item_name, price, store_name, quantity, product_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, created_at`,
      [
        req.userId,
        parentId,
        listId,
        itemName,
        price || null,
        storeName || null,
        quantity || 1,
        productId || null,
      ],
    );

    // Send real-time notification to parent
    io.to(`user_${parentId}`).emit("new_kid_request", {
      requestId: result.rows[0].id,
      childName: userRow.rows[0].first_name,
      listName: listRes.rows[0]?.list_name,
      itemName,
      quantity: quantity || 1,
      price: price || null,
      productId: productId || null,
      createdAt: result.rows[0].created_at,
    });

    return res.status(201).json({ message: "הבקשה נשלחה לאישור" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "שגיאה בשליחת הבקשה" });
  }
});

// GET /api/kid-requests/pending - Get parent's pending requests
app.get("/api/kid-requests/pending", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT kr.id, kr.child_id, kr.list_id, kr.item_name, kr.price, kr.store_name, kr.quantity, kr.created_at,
              kr.product_id,
              u.first_name AS child_first_name,
              l.list_name
       FROM app2.kid_requests kr
       JOIN app2.users u ON kr.child_id = u.id
       JOIN app.list l ON kr.list_id = l.id
       WHERE kr.parent_id = $1 AND kr.status = 'pending'
       ORDER BY kr.created_at DESC`,
      [req.userId],
    );
    return res.json({ requests: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "שגיאה" });
  }
});

// GET /api/kid-requests/my - Child's own request history (all statuses)
app.get("/api/kid-requests/my", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT kr.id, kr.list_id, kr.item_name, kr.price, kr.store_name, kr.quantity,
              kr.status, kr.created_at, kr.resolved_at,
              l.list_name
       FROM app2.kid_requests kr
       JOIN app.list l ON kr.list_id = l.id
       WHERE kr.child_id = $1
       ORDER BY kr.created_at DESC`,
      [req.userId],
    );
    return res.json({ requests: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "שגיאה" });
  }
});

// POST /api/kid-requests/:requestId/resolve - Approve or reject
app.post(
  "/api/kid-requests/:requestId/resolve",
  authenticateToken,
  async (req, res) => {
    const { requestId } = req.params;
    const { action } = req.body; // "approve" or "reject"
    if (!action || !["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "Invalid action" });
    }
    try {
      const request = await db.query(
        "SELECT * FROM app2.kid_requests WHERE id = $1 AND parent_id = $2 AND status = 'pending'",
        [requestId, req.userId],
      );
      if (request.rows.length === 0)
        return res.status(404).json({ message: "בקשה לא נמצאה" });
      const req_ = request.rows[0];

      if (action === "approve") {
        // Insert item into list
        const itemResult = await db.query(
          `INSERT INTO app.list_items (listid, itemname, price, storename, quantity, addby, addat, updatedat, product_id)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7) RETURNING *`,
          [
            req_.list_id,
            req_.item_name,
            req_.price,
            req_.store_name,
            req_.quantity,
            req_.child_id,
            req_.product_id || null,
          ],
        );
        const newItem = itemResult.rows[0];
        // Resolve who added
        const userRes = await db.query(
          "SELECT first_name FROM app2.users WHERE id = $1",
          [req_.child_id],
        );
        newItem.added_by_name = userRes.rows[0]?.first_name || "Unknown";
        // Emit to list room
        io.to(String(req_.list_id)).emit("receive_item", newItem);
      }

      // Update request status
      await db.query(
        "UPDATE app2.kid_requests SET status = $1, resolved_at = NOW() WHERE id = $2",
        [action === "approve" ? "approved" : "rejected", requestId],
      );

      // Notify the kid
      const listRes = await db.query(
        "SELECT list_name FROM app.list WHERE id = $1",
        [req_.list_id],
      );
      io.to(`user_${req_.child_id}`).emit("request_resolved", {
        requestId: parseInt(requestId),
        status: action === "approve" ? "approved" : "rejected",
        itemName: req_.item_name,
        listName: listRes.rows[0]?.list_name,
      });

      return res.json({
        message: action === "approve" ? "הבקשה אושרה" : "הבקשה נדחתה",
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "שגיאה בטיפול בבקשה" });
    }
  },
);

// Socket.io handlers
io.on("connection", (socket) => {
  // Register user for personal notifications
  socket.on("register_user", (userId) => {
    socket.join(`user_${userId}`);
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
      const query = `INSERT INTO app.list_items (listId, itemName, price, storeName, quantity, addby, addat, updatedat, product_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`;

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

      // Resolve who added the item
      if (addby) {
        const userRes = await db.query(
          "SELECT first_name FROM app2.users WHERE id = $1",
          [addby],
        );
        newItem.added_by_name = userRes.rows[0]?.first_name || "Unknown";
      }

      io.to(String(listId)).emit("receive_item", newItem);
    } catch (e) {
      console.error("שגיאה בשמירה ל-DB:", e);
    }
  });
  socket.on("toggle_item", async (data) => {
    const { itemId, listId, isChecked } = data;
    try {
      await db.query(
        "UPDATE app.list_items SET is_checked = $1 WHERE id = $2",
        [isChecked, itemId],
      );
      io.to(String(listId)).emit("item_status_changed", { itemId, isChecked });
    } catch (err) {
      console.error(err);
    }
  });
  socket.on("create_list", async (list, callback) => {
    const { list_name, userId } = list;
    if (!list_name || !userId)
      return callback({ success: false, error: `missing data` });
    try {
      // Block child accounts from creating lists
      const userRow = await db.query(
        "SELECT parent_id FROM app2.users WHERE id = $1",
        [userId],
      );
      if (userRow.rows[0]?.parent_id) {
        return callback({
          success: false,
          msg: "חשבון ילד לא יכול ליצור רשימות",
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
  });
  // Delete item from list
  socket.on("delete_item", async ({ itemId, listId }) => {
    try {
      await db.query(
        "DELETE FROM app.list_items WHERE id = $1 AND listid = $2",
        [itemId, listId],
      );
      io.to(String(listId)).emit("item_deleted", { itemId });
    } catch (e) {
      console.error("Error deleting item:", e);
    }
  });

  // Update note on list item
  socket.on("update_note", async ({ itemId, listId, note }) => {
    try {
      await db.query(
        "UPDATE app.list_items SET note = $1, updatedat = NOW() WHERE id = $2",
        [note, itemId],
      );
      io.to(String(listId)).emit("note_updated", { itemId, note });
    } catch (e) {
      console.error("Error updating note:", e);
    }
  });

  // Add comment on list item
  socket.on("add_comment", async ({ itemId, listId, userId, comment }) => {
    try {
      const result = await db.query(
        "INSERT INTO app.list_item_comments (item_id, user_id, comment) VALUES ($1, $2, $3) RETURNING *",
        [itemId, userId, comment],
      );
      const userRes = await db.query(
        "SELECT first_name FROM app2.users WHERE id = $1",
        [userId],
      );
      const newComment = {
        ...result.rows[0],
        user_name: userRes.rows[0]?.first_name,
      };
      io.to(String(listId)).emit("receive_comment", { itemId, comment: newComment });
    } catch (e) {
      console.error("Error adding comment:", e);
    }
  });

  // Mark item as paid
  socket.on("mark_paid", async ({ itemId, listId, userId }) => {
    try {
      await db.query(
        "UPDATE app.list_items SET paid_by = $1, paid_at = NOW() WHERE id = $2",
        [userId, itemId],
      );
      const userRes = await db.query(
        "SELECT first_name FROM app2.users WHERE id = $1",
        [userId],
      );
      io.to(String(listId)).emit("item_paid", {
        itemId,
        paid_by: userId,
        paid_by_name: userRes.rows[0]?.first_name,
        paid_at: new Date(),
      });
    } catch (e) {
      console.error("Error marking paid:", e);
    }
  });

  // Unmark item as paid
  socket.on("unmark_paid", async ({ itemId, listId }) => {
    try {
      await db.query(
        "UPDATE app.list_items SET paid_by = NULL, paid_at = NULL WHERE id = $1",
        [itemId],
      );
      io.to(String(listId)).emit("item_unpaid", { itemId });
    } catch (e) {
      console.error("Error unmarking paid:", e);
    }
  });

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

server.listen(port, '127.0.0.1', () => {
  console.log(`✅ SmartCart Server running on http://127.0.0.1:${port}`);
});
