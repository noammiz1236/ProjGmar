// create-user.js - Create a new user in the database
import bcrypt from "bcrypt";
import pg from "pg";
import { config } from "dotenv";

config();

const { Pool } = pg;
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const saltRounds = 10;

async function createUser(email, password, firstName = "Ron", lastName = "Diol") {
  try {
    // Hash the password
    const password_hash = await bcrypt.hash(password, saltRounds);
    
    // Insert user
    const result = await db.query(
      `INSERT INTO app2.users (first_name, last_name, email, password_hash, email_verified_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
       RETURNING id, email, first_name, last_name, created_at`,
      [firstName, lastName, email, password_hash]
    );
    
    console.log("✅ User created successfully!");
    console.log(result.rows[0]);
    
    await db.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating user:");
    console.error(error.message);
    await db.end();
    process.exit(1);
  }
}

// Create user
createUser("rdiol12@gmail.com", "01050900");
