import express from "express";
import morgan from "morgan";
import pg from "pg";
import { config } from "dotenv";
import cron from "node-cron";
import { processAllFiles } from "./db/sortfolder.js";
config();
const port = 3000;
const app = express();

const { Pool } = pg;
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

cron.schedule("0 5 * * *", () => {
  console.log("Running scheduled task: processAllFiles");
  processAllFiles("A:/vs code/fullstack/SmartCart/my_prices/Keshet").catch(
    (err) => console.error("fatal error", err),
  );
});

app.use(morgan("dev"));
app.use(express.json());

db.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log("PostgreSQL (israel_shopping_db)");
  }
});
app.get("/api/status", async (req, res) => {
  try {
    const result = await db.query("SELECT NOW()");
    res.json({
      database: "connected",
      time: result.rows[0].now,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      database: "disconnected",
      error: err.message,
    });
  }
});

app.listen(port, () => {
  console.log(`SmartCart Server running on port : ${port}`);
});
