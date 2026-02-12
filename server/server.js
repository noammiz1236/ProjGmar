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

config();
const port = process.env.PORT;
const app = express();
const server = http.createServer(app);
const saltRounds = 10;

const io = new Server(server, {
  cors: {
    origin: process.env.host_allowed,
    methods: ["GET", "POST"],
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
}



// Middleware הגדרות כלליות
app.use(morgan("dev"));
app.use(express.json());
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

// LOGIN
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  // בדיקות בסיסיות
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const results = await db.query(
      "SELECT * FROM app2.users WHERE email = $1",
      [email],
    );
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

    // Cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
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
      "SELECT id, first_name, last_name, email FROM app2.users WHERE id = $1",
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
  res.clearCookie("refreshToken", { path: "/api/refresh" });
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
      path: "/api/refresh",
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
    const results = await db.query("SELECT id FROM app2.users WHERE email = $1", [email])
    if (results.rows.length === 0) {
      return res.status(404).json({ message: "User not found" })
    }
    const userId = results.rows[0].id;
    const { rows } = await db.query(`INSERT INTO app2.tokens
      (user_id,type,expires_at,used,data)
      VALUES($1,'reset_password',NOW() + interval '15 minutes',false,NULL) RETURNING ID`,
      [userId])
    const tokenId = rows[0].id;
    const token = jwt.sign(
      {
        sub: userId,
        jti: tokenId,
        type: 'reset_password'
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '15m'
      }
    )
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
})


app.post("/api/reset-password", async (req, res) => {
  const { token, newPassword, confirmNewPassword } = req.body
  console.log(token)
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
      [userId, decodedToken.jti]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Token not found" });
    }
    const tokenData = rows[0];

    if (tokenData.used) {
      return res.status(400).json({ message: "Token already used" });
    }


    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const results = await db.query(`SELECT password_hash FROM app2.users WHERE id = $1`, [userId]);
    if (results.rows.length === 0) {
      return res.status(404).json({ message: "Token not found" });
    }

    const oldPassword = results.rows[0].password_hash;
    if (oldPassword === hashedPassword) {
      return res.status(400).json({ message: "New password must differ from current" });
    }


    await db.query(`UPDATE app2.users SET password_hash = $1 WHERE id = $2`, [hashedPassword, userId]);

    await db.query(`UPDATE app2.tokens SET used = true WHERE id = $1`, [decodedToken.jti]);

    return res.status(200).json({ message: "Password reset successfully" });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error resetting password" });
  }
})







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

    const listRes = await db.query("SELECT * FROM app.list WHERE id = $1", [listId]);
    if (listRes.rows.length === 0) return res.status(404).json({ message: "List not found" });

    const itemsRes = await db.query(
      `SELECT li.*, u.first_name AS paid_by_name
       FROM app.list_items li
       LEFT JOIN app2.users u ON li.paid_by = u.id
       WHERE li.listid = $1
       ORDER BY li.addat DESC`,
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

// GET /api/lists/:id/compare — price comparison across chains
app.get("/api/lists/:id/compare", authenticateToken, async (req, res) => {
  const listId = req.params.id;
  try {
    // Get list items that have a linked product_id
    const itemsRes = await db.query(
      `SELECT li.id, li.itemname, li.quantity, li.product_id
       FROM app.list_items li
       WHERE li.listid = $1`,
      [listId],
    );
    const allItems = itemsRes.rows;
    const linkedItems = allItems.filter((i) => i.product_id);
    const unlinkedCount = allItems.length - linkedItems.length;

    if (linkedItems.length === 0) {
      return res.json({ chains: [], linkedCount: 0, unlinkedCount });
    }

    const productIds = linkedItems.map((i) => i.product_id);

    // Get best price per product per chain
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

    // Group by chain
    const chainMap = {};
    for (const row of pricesRes.rows) {
      if (!chainMap[row.chain_id]) {
        chainMap[row.chain_id] = { chainId: row.chain_id, chainName: row.chain_name, prices: {} };
      }
      chainMap[row.chain_id].prices[row.product_id] = parseFloat(row.price);
    }

    // Build comparison
    const chains = Object.values(chainMap).map((chain) => {
      let total = 0;
      let missingCount = 0;
      const items = linkedItems.map((li) => {
        const price = chain.prices[li.product_id];
        const qty = parseFloat(li.quantity) || 1;
        if (price !== undefined) {
          const subtotal = price * qty;
          total += subtotal;
          return { itemName: li.itemname, price, quantity: qty, subtotal, available: true };
        } else {
          missingCount++;
          return { itemName: li.itemname, price: 0, quantity: qty, subtotal: 0, available: false };
        }
      });
      return {
        chainId: chain.chainId,
        chainName: chain.chainName,
        total,
        items,
        missingCount,
        complete: missingCount === 0,
      };
    });

    chains.sort((a, b) => a.total - b.total);

    return res.json({ chains, linkedCount: linkedItems.length, unlinkedCount });
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
      return res.status(403).json({ message: "Only admins can create invites" });
    }

    const crypto = await import("crypto");
    const inviteCode = crypto.randomBytes(16).toString("hex");

    await db.query(
      `INSERT INTO app.list_invites (list_id, invite_code, created_by, expires_at)
       VALUES ($1, $2, $3, NOW() + interval '7 days')`,
      [listId, inviteCode, req.userId],
    );

    const host = process.env.host_allowed?.split(",")[0] || "http://localhost:5173";
    return res.json({ inviteLink: `${host}/invite/${inviteCode}` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error creating invite" });
  }
});

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
app.post("/api/lists/:id/children/:childId", authenticateToken, async (req, res) => {
  const { id: listId, childId } = req.params;
  try {
    // Verify child belongs to this parent
    const child = await db.query("SELECT id FROM app2.users WHERE id = $1 AND parent_id = $2", [childId, req.userId]);
    if (child.rows.length === 0) return res.status(403).json({ message: "Not your child" });

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
});

// DELETE /api/lists/:id/children/:childId — remove child from list
app.delete("/api/lists/:id/children/:childId", authenticateToken, async (req, res) => {
  const { id: listId, childId } = req.params;
  try {
    const child = await db.query("SELECT id FROM app2.users WHERE id = $1 AND parent_id = $2", [childId, req.userId]);
    if (child.rows.length === 0) return res.status(403).json({ message: "Not your child" });

    await db.query("DELETE FROM app.list_members WHERE list_id = $1 AND user_id = $2", [listId, childId]);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error removing child" });
  }
});

// POST /api/kid-requests — child requests to add item
app.post("/api/kid-requests", authenticateToken, async (req, res) => {
  const { listId, itemName, price, storeName, quantity, productId } = req.body;
  try {
    // Get the child's parent
    const userRes = await db.query("SELECT parent_id FROM app2.users WHERE id = $1", [req.userId]);
    if (userRes.rows.length === 0 || !userRes.rows[0].parent_id) {
      return res.status(403).json({ message: "Not a child account" });
    }
    const parentId = userRes.rows[0].parent_id;

    await db.query(
      `INSERT INTO app2.kid_requests (child_id, parent_id, list_id, item_name, price, store_name, quantity, product_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [req.userId, parentId, listId, itemName, price, storeName, quantity || 1, productId || null],
    );
    return res.status(201).json({ message: "Request sent" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error creating request" });
  }
});

// Socket.io handlers
io.on("connection", (socket) => {
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
    } = data;
    try {
      const query = `insert into app.list_items (listId, itemName, price, storeName,quantity,addby,addat,updatedat)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;

      const values = [
        listId,
        itemName,
        price,
        storeName,
        quantity,
        addby,
        addat,
        updatedat,
      ];
      const result = await db.query(query, values);
      const newItem = result.rows[0];

      io.to(listId).emit("receive_item", newItem);
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
      io.to(listId).emit("item_status_changed", { itemId, isChecked });
    } catch (err) {
      console.error(err);
    }
  });
  socket.on("create_list", async (list, callback) => {
    const { list_name, userId } = list;
    if (!list_name || !userId)
      return callback({ success: false, error: `missing data` });
    try {
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
});

server.listen(port, () => {
  console.log(`SmartCart Server running on port : ${port}`);
});
