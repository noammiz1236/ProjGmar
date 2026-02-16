import express from "express";
import morgan from "morgan";
import { config } from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http";
import { Server } from "socket.io";
import pg from "pg";
import cron from "node-cron";

// Import middleware
import { apiLimiter, authLimiter, searchLimiter } from "./middleware/rateLimiter.js";
import { logger, requestLogger, errorLogger } from "./utils/logger.js";

// Import routes
import authRoutes from "./routes/auth.js";
import listsRoutes from "./routes/lists.js";
import familyRoutes from "./routes/family.js";
import productsRoutes from "./routes/simplified_products.js";

config();

const port = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: process.env.HOST_ALLOWED || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Database setup
const { Pool } = pg;
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test database connection
db.query("SELECT NOW()", (err, res) => {
  if (err) {
    logger.error("Database connection error", { error: err.message });
  } else {
    logger.info("✅ PostgreSQL connected (israel_shopping_db)");
  }
});

// Middleware
app.use(requestLogger); // Structured logging
app.use(morgan("dev")); // Keep morgan for now (can remove later)
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: ["http://localhost:5173", "http://100.115.197.11:5173"],
    credentials: true,
  })
);

// Apply general rate limiting to all API routes
app.use("/api", apiLimiter);

// Make db and io available to routes
app.locals.db = db;
app.locals.io = io;

// Initialize core database tables
async function initializeTables() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS app.template_schedules (
      id SERIAL PRIMARY KEY,
      template_id INT NOT NULL,
      user_id INT NOT NULL,
      frequency VARCHAR(20) NOT NULL DEFAULT 'weekly',
      next_run TIMESTAMPTZ,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS app.push_tokens (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      platform VARCHAR(10) DEFAULT 'android',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS app.list_chat (
      id SERIAL PRIMARY KEY,
      list_id INT NOT NULL,
      user_id INT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS app.activity_log (
      id SERIAL PRIMARY KEY,
      list_id INT,
      user_id INT,
      action VARCHAR(50) NOT NULL,
      details TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `ALTER TABLE app.list_items ADD COLUMN IF NOT EXISTS assigned_to INT`,
    `ALTER TABLE app.list_items ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0`,
    `ALTER TABLE app.list_items ADD COLUMN IF NOT EXISTS checked_by INT`,
    `CREATE TABLE IF NOT EXISTS app.price_alerts (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      item_id INT NOT NULL,
      target_price DECIMAL NOT NULL,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  ];

  for (const query of queries) {
    try {
      await db.query(query);
    } catch (err) {
      logger.error("Table creation error", { error: err.message });
    }
  }

  logger.info("✅ Database tables initialized");
}

initializeTables();

// Routes
app.use("/api", authRoutes);
app.use("/api/lists", listsRoutes);
app.use("/api/family", familyRoutes);
app.use("/api", productsRoutes);

// Push notification helper
async function sendPushNotifications(userIds, title, body, data = {}) {
  try {
    if (!userIds || userIds.length === 0) return;
    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(",");
    const result = await db.query(
      `SELECT token FROM app.push_tokens WHERE user_id IN (${placeholders})`,
      userIds
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

// Activity log helper
async function logActivity(listId, userId, action, details) {
  try {
    await db.query(
      `INSERT INTO app.activity_log (list_id, user_id, action, details) VALUES ($1, $2, $3, $4)`,
      [listId, userId, action, details]
    );
  } catch (err) {
    console.error("Error logging activity:", err);
  }
}

// Socket.io event handlers
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("register_user", (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} registered for notifications`);
  });

  socket.on("join_list", (listId) => {
    socket.join(String(listId));
    console.log(`User joined list: ${listId}`);
  });

  socket.on("send_item", async (data) => {
    const { listId, itemName, price, storeName, quantity, addby, addat, updatedat, productId } = data;

    try {
      const query = `INSERT INTO app.list_items (listId, itemName, price, storeName, quantity, addby, addat, updatedat, product_id, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
          COALESCE((SELECT MAX(sort_order) FROM app.list_items WHERE listid = $1), 0) + 1
        ) RETURNING *`;

      const values = [listId, itemName, price, storeName, quantity, addby, addat, updatedat, productId || null];
      const result = await db.query(query, values);
      const newItem = result.rows[0];

      io.to(String(listId)).emit("receive_item", newItem);
      logActivity(listId, addby, "item_added", `Added item: ${itemName}`);

      // Notify other members
      try {
        const members = await db.query(
          "SELECT user_id FROM app.list_members WHERE list_id = $1 AND user_id != $2",
          [listId, addby]
        );
        const memberIds = members.rows.map((m) => m.user_id);
        if (memberIds.length > 0) {
          const adderRes = await db.query("SELECT first_name FROM app2.users WHERE id = $1", [addby]);
          const adderName = adderRes.rows[0]?.first_name || "Someone";
          sendPushNotifications(memberIds, "פריט חדש ברשימה", `${adderName} הוסיף ${itemName}`, {
            type: "item_added",
            listId,
          });
        }
      } catch (pushErr) {
        console.error("Push notification error:", pushErr);
      }
    } catch (e) {
      console.error("Error saving item:", e);
    }
  });

  socket.on("toggle_item", async (data) => {
    const { itemId, listId, isChecked, userId } = data;
    try {
      await db.query(
        "UPDATE app.list_items SET is_checked = $1, checked_by = $2 WHERE id = $3",
        [isChecked, isChecked ? (userId || null) : null, itemId]
      );

      let checkedByName = null;
      if (isChecked && userId) {
        const userRes = await db.query("SELECT first_name FROM app2.users WHERE id = $1", [userId]);
        checkedByName = userRes.rows[0]?.first_name || null;
      }

      io.to(String(listId)).emit("item_status_changed", {
        itemId,
        isChecked,
        checkedBy: isChecked ? userId : null,
        checkedByName,
      });

      logActivity(listId, userId || null, "item_toggled", `Item ${itemId} toggled to ${isChecked}`);
    } catch (err) {
      console.error("Toggle error:", err);
    }
  });

  socket.on("delete_item", async (data) => {
    const { itemId, listId, userId } = data;
    try {
      await db.query("DELETE FROM app.list_items WHERE id = $1", [itemId]);
      io.to(String(listId)).emit("item_deleted", { itemId });
      logActivity(listId, userId || null, "item_deleted", `Deleted item ${itemId}`);
    } catch (err) {
      console.error("Delete error:", err);
    }
  });

  socket.on("mark_paid", async (data) => {
    const { itemId, listId, userId } = data;
    try {
      const result = await db.query(
        "UPDATE app.list_items SET paid_by = $1, paid_at = NOW() WHERE id = $2 RETURNING paid_at",
        [userId, itemId]
      );
      const paid_at = result.rows[0]?.paid_at;

      const userResult = await db.query("SELECT first_name FROM app2.users WHERE id = $1", [userId]);
      const paid_by_name = userResult.rows[0]?.first_name;

      io.to(String(listId)).emit("item_paid", { itemId, paid_by: userId, paid_by_name, paid_at });
      logActivity(listId, userId, "item_paid", `Paid for item ${itemId}`);
    } catch (err) {
      console.error("Mark paid error:", err);
    }
  });

  socket.on("unmark_paid", async (data) => {
    const { itemId, listId } = data;
    try {
      await db.query("UPDATE app.list_items SET paid_by = NULL, paid_at = NULL WHERE id = $1", [itemId]);
      io.to(String(listId)).emit("item_unpaid", { itemId });
    } catch (err) {
      console.error("Unmark paid error:", err);
    }
  });

  socket.on("update_quantity", async (data) => {
    const { itemId, listId, quantity } = data;
    try {
      await db.query("UPDATE app.list_items SET quantity = $1 WHERE id = $2", [quantity, itemId]);
      io.to(String(listId)).emit("quantity_updated", { itemId, quantity });
    } catch (err) {
      console.error("Update quantity error:", err);
    }
  });

  socket.on("update_note", async (data) => {
    const { itemId, listId, note, userId } = data;
    try {
      await db.query("UPDATE app.list_items SET note = $1, note_by = $2 WHERE id = $3", [note || null, userId, itemId]);

      const userResult = await db.query("SELECT first_name FROM app2.users WHERE id = $1", [userId]);
      const note_by_name = userResult.rows[0]?.first_name;

      io.to(String(listId)).emit("note_updated", { itemId, note, note_by: userId, note_by_name });
    } catch (err) {
      console.error("Update note error:", err);
    }
  });

  socket.on("create_list", async (list, callback) => {
    const { list_name, userId } = list;
    if (!list_name || !userId) {
      return callback({ success: false, error: "Missing data" });
    }

    try {
      const userCheck = await db.query("SELECT parent_id FROM app2.users WHERE id = $1", [userId]);
      if (userCheck.rows.length === 0) {
        return callback({ success: false, error: "User not found" });
      }
      if (userCheck.rows[0].parent_id !== null) {
        return callback({ success: false, error: "Child accounts cannot create lists" });
      }

      const listRes = await db.query(`INSERT INTO app.list (list_name) VALUES ($1) RETURNING id`, [list_name]);
      const newListId = listRes.rows[0].id;

      await db.query(
        `INSERT INTO app.list_members (list_id, user_id, status) VALUES ($1, $2, $3)`,
        [newListId, userId, "admin"]
      );

      callback({ success: true, listId: newListId });
    } catch (e) {
      console.error("Create list error:", e);
      callback({ success: false, msg: "Database error" });
    }
  });

  socket.on("add_comment", async (data) => {
    const { itemId, listId, userId, comment } = data;
    try {
      const existingComment = await db.query(
        `SELECT id FROM app.list_item_comments WHERE item_id = $1 AND user_id = $2`,
        [itemId, userId]
      );

      if (existingComment.rows.length > 0) {
        console.log(`User ${userId} already has a comment on item ${itemId}`);
        return;
      }

      const result = await db.query(
        `INSERT INTO app.list_item_comments (item_id, user_id, comment, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id, created_at`,
        [itemId, userId, comment]
      );

      const userRes = await db.query("SELECT first_name FROM app2.users WHERE id = $1", [userId]);
      const userName = userRes.rows[0]?.first_name || "User";

      const newComment = {
        id: result.rows[0].id,
        item_id: itemId,
        user_id: userId,
        first_name: userName,
        comment: comment,
        created_at: result.rows[0].created_at,
      };

      io.to(String(listId)).emit("receive_comment", { itemId, comment: newComment });
    } catch (err) {
      console.error("Add comment error:", err);
    }
  });

  socket.on("send_chat_message", async (data) => {
    const { listId, userId, message } = data;
    try {
      const result = await db.query(
        `INSERT INTO app.list_chat (list_id, user_id, message) VALUES ($1, $2, $3) RETURNING id, created_at`,
        [listId, userId, message]
      );
      const userRes = await db.query("SELECT first_name FROM app2.users WHERE id = $1", [userId]);
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
      console.error("Chat message error:", err);
    }
  });

  socket.on("assign_item", async (data) => {
    const { itemId, listId, assignedTo } = data;
    try {
      await db.query("UPDATE app.list_items SET assigned_to = $1 WHERE id = $2", [assignedTo, itemId]);

      let assignedToName = null;
      if (assignedTo) {
        const userRes = await db.query("SELECT first_name FROM app2.users WHERE id = $1", [assignedTo]);
        assignedToName = userRes.rows[0]?.first_name || null;
      }

      io.to(String(listId)).emit("item_assigned", { itemId, assignedTo, assignedToName });
    } catch (err) {
      console.error("Assign item error:", err);
    }
  });

  socket.on("reorder_items", async (data) => {
    const { listId, items } = data;
    if (!items || !Array.isArray(items)) return;

    try {
      for (const item of items) {
        await db.query("UPDATE app.list_items SET sort_order = $1 WHERE id = $2 AND listid = $3", [
          item.sortOrder,
          item.itemId,
          listId,
        ]);
      }
      socket.to(String(listId)).emit("items_reordered", { items });
    } catch (err) {
      console.error("Reorder error:", err);
    }
  });
});

// Cron job: Recurring lists from templates
cron.schedule("0 8 * * *", async () => {
  console.log("Running recurring lists cron job...");
  try {
    const { rows: dueSchedules } = await db.query(
      `SELECT ts.id, ts.template_id, ts.user_id, ts.frequency, lt.template_name
       FROM app.template_schedules ts
       JOIN app.list_templates lt ON lt.id = ts.template_id
       WHERE ts.active = true AND ts.next_run <= NOW()`
    );

    for (const schedule of dueSchedules) {
      try {
        const { rows: templateItems } = await db.query(
          `SELECT item_name, quantity, note, sort_order
           FROM app.template_items
           WHERE template_id = $1
           ORDER BY sort_order ASC`,
          [schedule.template_id]
        );

        if (templateItems.length === 0) {
          console.log(`Template ${schedule.template_id} has no items, skipping.`);
          continue;
        }

        const listRes = await db.query(`INSERT INTO app.list (list_name) VALUES ($1) RETURNING id`, [
          schedule.template_name,
        ]);
        const newListId = listRes.rows[0].id;

        await db.query(
          `INSERT INTO app.list_members (list_id, user_id, status) VALUES ($1, $2, 'admin')`,
          [newListId, schedule.user_id]
        );

        for (const item of templateItems) {
          await db.query(
            `INSERT INTO app.list_items (listId, itemName, quantity, addby, addat, updatedat)
             VALUES ($1, $2, $3, $4, NOW(), NOW())`,
            [newListId, item.item_name, item.quantity || 1, schedule.user_id]
          );
        }

        let intervalExpression;
        if (schedule.frequency === "weekly") {
          intervalExpression = "7 days";
        } else if (schedule.frequency === "biweekly") {
          intervalExpression = "14 days";
        } else {
          intervalExpression = "1 month";
        }

        await db.query(
          `UPDATE app.template_schedules SET next_run = NOW() + interval '${intervalExpression}' WHERE id = $1`,
          [schedule.id]
        );

        console.log(`✅ Created recurring list "${schedule.template_name}" for user ${schedule.user_id}`);
      } catch (err) {
        console.error(`Error creating list from template ${schedule.template_id}:`, err);
      }
    }
  } catch (err) {
    console.error("Cron job error:", err);
  }
});

// Cron job: Daily price snapshot (runs at 2 AM every day)
cron.schedule("0 2 * * *", async () => {
  console.log("[Price Snapshot] Running daily price snapshot...");
  try {
    const result = await db.query(`
      INSERT INTO app.price_history (product_id, chain_id, price, recorded_at)
      SELECT 
        p.item_id as product_id,
        b.chain_id,
        p.price,
        NOW() as recorded_at
      FROM app.prices p
      JOIN app.branches b ON b.id = p.branch_id
      WHERE p.price IS NOT NULL
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    
    const count = result.rowCount || 0;
    console.log(`[Price Snapshot] ✅ Inserted ${count} price records`);

    // Clean up old records (keep last 90 days)
    const cleanupResult = await db.query(`
      DELETE FROM app.price_history
      WHERE recorded_at < NOW() - INTERVAL '90 days'
      RETURNING id
    `);

    const cleaned = cleanupResult.rowCount || 0;
    console.log(`[Price Snapshot] 🧹 Cleaned up ${cleaned} old records (>90 days)`);
  } catch (err) {
    console.error("[Price Snapshot] ❌ Error:", err.message);
  }
});

// Push token management
app.post("/api/push-token", async (req, res) => {
  const { token, platform } = req.body;
  if (!token) return res.status(400).json({ message: "Token required" });
  try {
    const userId = req.userId; // Should use authenticateToken middleware
    await db.query(
      `INSERT INTO app.push_tokens (user_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = $1, platform = $3`,
      [userId, token, platform || "android"]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error("Error saving push token:", err);
    return res.status(500).json({ message: "Error saving token" });
  }
});

app.delete("/api/push-token", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ message: "Token required" });
  try {
    const userId = req.userId; // Should use authenticateToken middleware
    await db.query("DELETE FROM app.push_tokens WHERE token = $1 AND user_id = $2", [token, userId]);
    return res.json({ success: true });
  } catch (err) {
    console.error("Error removing push token:", err);
    return res.status(500).json({ message: "Error removing token" });
  }
});

// Price alerts endpoints
app.post("/api/price-alerts", async (req, res) => {
  const { itemId, targetPrice } = req.body;
  const userId = req.userId; // Should use authenticateToken middleware
  
  if (!itemId || !targetPrice) {
    return res.status(400).json({ message: "itemId and targetPrice are required" });
  }
  try {
    const result = await db.query(
      `INSERT INTO app.price_alerts (user_id, item_id, target_price) VALUES ($1, $2, $3) RETURNING *`,
      [userId, itemId, targetPrice]
    );
    return res.status(201).json({ alert: result.rows[0] });
  } catch (err) {
    console.error("Error creating price alert:", err);
    return res.status(500).json({ message: "Error creating price alert" });
  }
});

app.get("/api/price-alerts", async (req, res) => {
  const userId = req.userId; // Should use authenticateToken middleware
  
  try {
    const result = await db.query(
      `SELECT pa.id, pa.item_id, pa.target_price, pa.created_at, i.name AS item_name
       FROM app.price_alerts pa
       JOIN app.items i ON pa.item_id = i.id
       WHERE pa.user_id = $1 AND pa.active = true
       ORDER BY pa.created_at DESC`,
      [userId]
    );
    return res.json({ alerts: result.rows });
  } catch (err) {
    console.error("Error fetching price alerts:", err);
    return res.status(500).json({ message: "Error fetching price alerts" });
  }
});

app.delete("/api/price-alerts/:id", async (req, res) => {
  const alertId = req.params.id;
  const userId = req.userId; // Should use authenticateToken middleware
  
  try {
    await db.query(
      `UPDATE app.price_alerts SET active = false WHERE id = $1 AND user_id = $2`,
      [alertId, userId]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error("Error deactivating price alert:", err);
    return res.status(500).json({ message: "Error deactivating price alert" });
  }
});

// Activity feed
app.get("/api/activity/feed", async (req, res) => {
  const userId = req.userId; // Should use authenticateToken middleware
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

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Error logging and handling
app.use(errorLogger);
app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ 
    success: false,
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
server.listen(port, () => {
  logger.info(`🚀 SmartCart server running on port ${port}`);
  logger.info(`📡 Socket.io ready for real-time updates`);
  logger.info(`✨ Enhanced version with rate limiting, validation & structured logging`);
  logger.info(`🔒 Security: Rate limiting active on all API endpoints`);
});
