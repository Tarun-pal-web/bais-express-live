console.log("🔥 SERVER FILE ACTUALLY RUNNING 🔥");

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());

/* ================= FRONTEND (STATIC) ================= */
// 🔥 ABSOLUTE SAFE PATH
const DOCS_PATH = path.resolve(__dirname, "..", "docs");
app.use(express.static(DOCS_PATH));

// 🔥 ROOT FIX
app.get("/", (req, res) => {
  res.sendFile(path.join(DOCS_PATH, "index.html"));
});

/* ================= DATABASE ================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(() => console.log("✅ Postgres connected"))
  .catch(err => console.error("❌ DB error:", err));

/* ================= AUTH APIs ================= */
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (name,email,password,role) VALUES ($1,$2,$3,'user')",
      [name, email, hashed]
    );

    res.json({ message: "Registered successfully ✅" });
  } catch {
    res.status(409).json({ message: "User already exists ❌" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE email=$1",
    [email]
  );

  if (!result.rows.length)
    return res.status(401).json({ message: "User not found ❌" });

  const user = result.rows[0];
  const match = await bcrypt.compare(password, user.password);

  if (!match)
    return res.status(401).json({ message: "Wrong password ❌" });

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({ message: "Login success ✅", token, role: user.role });
});

/* ================= START ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
