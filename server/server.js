import express from "express";
import morgan from "morgan";
import { config } from "dotenv";
import bcrypt from "bcrypt";
import cors from "cors";
import validator from "validator";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import pg from "pg";
import nodemailer from "nodemailer";

config();
const port = process.env.PORT;
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
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

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
         FROM app2.items i
         JOIN app2.prices p ON i.id = p.item_id
         JOIN app2.branches b ON p.branch_id = b.id
         JOIN app2.chains c ON b.chain_id = c.id
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

app.listen(port, () => {
  console.log(`SmartCart Server running on port : ${port}`);
});
