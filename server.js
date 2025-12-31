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

/* ================= FRONTEND ================= */
app.use(express.static(path.join(__dirname, "../docs")));

/* ================= DATABASE ================= */
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false }
});

pool.query("SELECT 1")
  .then(() => console.log("✅ Postgres Connected"))
  .catch(err => console.error("❌ Postgres Error:", err.message));

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ================= AUTH ================= */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Token missing ❌" });

  try {
    req.user = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token ❌" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Admin only ❌" });
  next();
}

/* ================= HEALTH ================= */
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Backend running 🚀" });
});

/* ================= REGISTER ================= */
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

/* ================= LOGIN ================= */
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE email=$1",
    [email]
  );

  if (result.rows.length === 0)
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

/* ================= REQUEST CALL ================= */
app.post("/request-call", async (req, res) => {
  const { name, phone, pickup, drop, cargo } = req.body;

  await pool.query(
    `INSERT INTO request_calls
     (name, phone, pickup, drop_location, cargo, status)
     VALUES ($1,$2,$3,$4,$5,'New')`,
    [name, phone, pickup || "", drop || "", cargo || ""]
  );

  await transporter.sendMail({
    from: `"Bais Express Logistics" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_USER,
    subject: "🚛 New Transport Request",
    html: `<p>${name} | ${phone}</p>`
  });

  res.json({ message: "Request sent successfully ✅" });
});

/* ================= ADMIN ================= */
app.get("/admin/requests", verifyToken, adminOnly, async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM request_calls ORDER BY id DESC"
  );
  res.json(result.rows);
});

/* ================= PASSWORD RESET ================= */
app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  const token = jwt.sign({ email }, process.env.RESET_SECRET, {
    expiresIn: "15m"
  });

  const link = `${process.env.FRONTEND_URL}/reset.html?token=${token}`;

  await transporter.sendMail({
    from: `"Bais Express Logistics" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Reset Password",
    html: `<a href="${link}">${link}</a>`
  });

  res.json({ message: "Reset link sent to email ✅" });
});

/* ================= RESET PASSWORD ================= */
app.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  const decoded = jwt.verify(token, process.env.RESET_SECRET);
  const hashed = await bcrypt.hash(newPassword, 10);

  await pool.query(
    "UPDATE users SET password=$1 WHERE email=$2",
    [hashed, decoded.email]
  );

  res.json({ message: "Password reset successful ✅" });
});

/* ================= START ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
