import express from "express";
import db from "./db/DB.js";
import bcrypt from "bcrypt";
import cors from "cors";
import validator from "validator";

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const saltRounds = 10;

app.post("/api/register", async (req, res) => {
  const { firstName, lastName, email, password, confirmPassword } = req.body;

  try {
    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const checkEmailQuery = "SELECT * FROM app.users WHERE email = $1";
    const emailResult = await db.query(checkEmailQuery, [email]);

    if (emailResult.rows.length > 0) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const insertUserQuery =
      "INSERT INTO app.users (first_name, last_name, email, password_hash) VALUES ($1, $2, $3, $4)";
    await db.query(insertUserQuery, [
      firstName,
      lastName,
      email,
      hashedPassword,
    ]);

    return res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error registering user" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (password.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters long" });
  }
  if (!validator.isEmail(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  try {
    const getUserQuery = "SELECT * FROM app.users WHERE email = $1";
    const results = await db.query(getUserQuery, [email]);
    if (results.rows.length === 0) {
      return res.status(400).json({ message: "Invalid email or password" });
    }
    bcrypt.compare(password, results.rows[0].password_hash, (err, result) => {
      if (result) {
        return res.status(200).json({ message: "Login successful" });
      } else {
        return res.status(400).json({ message: "Invalid email or password" });
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error logging in user" });
  }
});

app.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});
