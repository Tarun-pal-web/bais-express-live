console.log("🔥 SERVER FILE ACTUALLY RUNNING 🔥");

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());

/* ================= FRONTEND ================= */
app.use(express.static(path.join(__dirname, "../frontend")));

/* ================= DATABASE ================= */
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect(err => {
  if (err) {
    console.log("❌ MySQL Error:", err);
    process.exit(1);
  }
  console.log("✅ MySQL Connected");
});

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify(err => {
  if (err) console.log("❌ EMAIL ERROR:", err);
  else console.log("✅ EMAIL SERVER READY");
});

/* ================= AUTH MIDDLEWARE ================= */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ message: "Token missing ❌" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token ❌" });
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
  const { name, email, password } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ message: "All fields required ❌" });

  const hashed = await bcrypt.hash(password, 10);

  db.query(
    "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'user')",
    [name, email, hashed],
    err => {
      if (err)
        return res.status(409).json({ message: "User already exists ❌" });
      res.json({ message: "Registered successfully ✅" });
    }
  );
});

/* ================= LOGIN ================= */
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.query("SELECT * FROM users WHERE email=?", [email], async (err, rows) => {
    if (err)
      return res.status(500).json({ message: "Database error ❌" });

    if (rows.length === 0)
      return res.status(401).json({ message: "User not found ❌" });

    const user = rows[0];
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
});

/* ================= REQUEST CALL ================= */
app.post("/request-call", (req, res) => {
  const { name, phone, pickup, drop, cargo } = req.body;

  if (!name || !phone)
    return res.status(400).json({ message: "Name & phone required ❌" });

  db.query(
    `INSERT INTO request_calls
     (name, phone, pickup, drop_location, cargo, status)
     VALUES (?, ?, ?, ?, ?, 'New')`,
    [name, phone, pickup || "", drop || "", cargo || ""],
    err => {
      if (err)
        return res.status(500).json({ message: "Server error ❌" });

      transporter.sendMail({
        from: `"Bais Express Logistics" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_USER,
        subject: "🚛 New Transport Request",
        html: `
          <p><b>Name:</b> ${name}</p>
          <p><b>Phone:</b> ${phone}</p>
          <p><b>Pickup:</b> ${pickup}</p>
          <p><b>Drop:</b> ${drop}</p>
          <p><b>Cargo:</b> ${cargo}</p>
        `
      });

      res.json({ message: "Request sent successfully ✅" });
    }
  );
});

/* ================= ADMIN ROUTES ================= */
app.get("/admin/requests", verifyToken, adminOnly, (req, res) => {
  db.query("SELECT * FROM request_calls ORDER BY id DESC", (err, rows) => {
    if (err)
      return res.status(500).json({ message: "Database error ❌" });
    res.json(rows);
  });
});

app.put("/admin/request/:id", verifyToken, adminOnly, (req, res) => {
  db.query(
    "UPDATE request_calls SET status=? WHERE id=?",
    [req.body.status, req.params.id],
    err => {
      if (err)
        return res.status(500).json({ message: "Update failed ❌" });
      res.json({ message: "Status updated ✅" });
    }
  );
});

app.delete("/admin/request/:id", verifyToken, adminOnly, (req, res) => {
  db.query(
    "DELETE FROM request_calls WHERE id=?",
    [req.params.id],
    err => {
      if (err)
        return res.status(500).json({ message: "Delete failed ❌" });
      res.json({ message: "Deleted successfully ✅" });
    }
  );
});

/* ================= FORGOT PASSWORD (FINAL FIX) ================= */
app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email)
    return res.status(400).json({ message: "Email required ❌" });

  const token = jwt.sign({ email }, process.env.RESET_SECRET, {
    expiresIn: "15m"
  });

  const link = `${process.env.FRONTEND_URL}/reset.html?token=${token}`;

  try {
    await transporter.sendMail({
      from: `"Bais Express Logistics" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "🔐 Reset Password",
      html: `
        <p>Hello,</p>
        <p>Click the link below to reset your password:</p>
        <a href="${link}">${link}</a>
        <p>This link is valid for 15 minutes.</p>
      `
    });

    res.json({ message: "Reset link sent to email ✅" });

  } catch (error) {
    console.error("❌ EMAIL SEND FAILED:", error);
    res.status(500).json({
      message: "Email sending failed ❌ (check email config)"
    });
  }
});

/* ================= RESET PASSWORD ================= */
app.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.RESET_SECRET);
    const hashed = await bcrypt.hash(newPassword, 10);

    db.query(
      "UPDATE users SET password=? WHERE email=?",
      [hashed, decoded.email],
      err => {
        if (err)
          return res.status(500).json({ message: "Reset failed ❌" });
        res.json({ message: "Password reset successful ✅" });
      }
    );
  } catch {
    res.status(400).json({ message: "Token expired or invalid ❌" });
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
