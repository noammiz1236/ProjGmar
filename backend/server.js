import express from "express";
import db from "./db/DB.js";
import bcrypt from "bcrypt";
import cors from "cors";
import validator from "validator";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

const saltRounds = 10;

// LOGIN
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const getUserQuery = "SELECT * FROM app.users WHERE email = $1";
    const results = await db.query(getUserQuery, [email]);

    if (results.rows.length === 0) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const user = results.rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Create JWT
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    // Send JWT in cookie
    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: "lax",
    });

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error logging in user" });
  }
});

// ME route
app.get("/api/me", async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      // במקום 401, נחזיר הצלחה אבל עם user: null
      return res.status(200).json({ user: null });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const results = await db.query(
      "SELECT id, first_name, last_name, email FROM app.users WHERE id = $1",
      [decoded.userId],
    );

    if (results.rows.length === 0) {
      return res.status(200).json({ user: null });
    }

    return res.status(200).json({ user: results.rows[0] });
  } catch (err) {
    return res.status(200).json({ user: null });
  }
});
// LOGOUT
app.post("/api/logout", (req, res) => {
  res.clearCookie("token");
  return res.status(200).json({ message: "Logged out" });
});

app.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});
