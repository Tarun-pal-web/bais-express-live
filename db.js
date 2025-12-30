const mysql = require("mysql2");

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error("❌ MySQL Connection Failed:", err);
  } else {
    console.log("✅ MySQL Connected");
  }
});

const mailOptions = {
  from: "YOUR_EMAIL@gmail.com",
  to: "ADMIN_EMAIL@gmail.com",
  subject: "New Request Call Received",
  text: `
New Request Call:

Name: ${name}
Phone: ${phone}
Pickup: ${pickup}
Drop: ${drop_location}
Cargo: ${cargo}
  `
};

transporter.sendMail(mailOptions, (err, info) => {
  if (err) {
    console.log("❌ Email error:", err);
  } else {
    console.log("📧 Email sent:", info.response);
  }
});

module.exports = db;
