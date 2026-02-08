import express, { json } from "express";
import morgan from "morgan";
import pg from "pg";
import { config } from "dotenv";
import cron from "node-cron";
import { processAllFiles } from "./db/sortfolder.js";
import bcrypt from "bcrypt";
import cors from "cors";
import validator from "validator";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import http from "http";

config();
const port = 5000;
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
cron.schedule("0 5 * * *", () => {
  console.log("Running scheduled task: processAllFiles");
  const serverPath = process.env.PRICES_PATH || "/app/my_prices/Keshet";
  processAllFiles(serverPath).catch((err) => console.error("fatal error", err));
});

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

// REGISTER
app.post("/api/register", async (req, res) => {
  const { first_name, last_name, email, password } = req.body;
  try {
    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    }
    const existingUser = await db.query(
      "SELECT * FROM app.users WHERE email = $1",
      [email],
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "Email already in use" });
    }
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const result = await db.query(
      "INSERT INTO app.users (first_name, last_name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, first_name, last_name, email",
      [first_name, last_name, email, hashedPassword],
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });
    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    });
    return res
      .status(201)
      .json({ message: "User registered successfully", user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error registering user" });
  }
});

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
    const results = await db.query("SELECT * FROM app.users WHERE email = $1", [
      email,
    ]);
    if (results.rows.length === 0) {
      return res.status(400).json({ message: "Invalid email or password" });
    }
    const user = results.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });
    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
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

// ME
app.get("/api/me", async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(200).json({ user: null });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const results = await db.query(
      "SELECT id, first_name, last_name, email FROM app.users WHERE id = $1",
      [decoded.userId],
    );
    if (results.rows.length === 0) return res.status(200).json({ user: null });
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
      const listRes = await client.query(
        `INSERT INTO app.list (list_name) VALUES ($1) RETURNING id`,
        [list_name],
      );
      const newListId = listRes.rows[0].id;
      await client.query(
        `INSERT INTO app.list_members (list_id, user_id, status) VALUES ($1, $2, $3)`,
        [newListId, userId, "admin"],
      );
      callback({ success: true, listId: newListId });
    } catch (e) {
      console.error(e);
      callback({ success: false, msg: `db eror` });
    }
  });
});

server.listen(port, () => {
  console.log(`SmartCart Server running on port : ${port}`);
});
