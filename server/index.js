import express from "express";
import dotenv from "dotenv";
import Razorpay from "razorpay";
import crypto from "crypto";
import pkg from "mailersend";

dotenv.config();

const { MailerSend, EmailParams, Sender, Recipient } = pkg;

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

// ================= CORS =================
const allowedOrigins = [
  "https://ayurmitti.com",
  "https://www.ayurmitti.com",
  "http://127.0.0.1:5500",
  "http://localhost:3000"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ================= MAILERSEND =================
const mailerSend = new MailerSend({
  api_key: process.env.MAILERSEND_API_KEY
});

const sentFrom = new Sender(
  process.env.MAIL_FROM || "noreply@ayurmitti.com",
  "Ayurmitti"
);

// ================= RAZORPAY =================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ================= HEALTH =================
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Backend running 🚀" });
});

// ================= CREATE ORDER =================
app.post("/api/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ error: "Amount is required" });
    }

    const options = {
      amount: amount * 100, // ₹ → paise
      currency: "INR",
      receipt: "receipt_" + Date.now()
    };

    const order = await razorpay.orders.create(options);

    res.json(order);
  } catch (err) {
    console.error("❌ Order error:", err);
    res.status(500).json({ error: "Order creation failed" });
  }
});

// ================= VERIFY PAYMENT + EMAIL =================
app.post("/api/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      order
    } = req.body;

    // 🔐 Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid signature ❌"
      });
    }

    console.log("✅ Payment verified");

    // ================= SEND EMAIL =================
    const recipients = [
      new Recipient(order.email, order.customer || "Customer")
    ];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject("Order Confirmation - Ayurmitti")
      .setHtml(`
        <h2>Order Confirmed ✅</h2>
        <p><b>Order ID:</b> ${order.id}</p>
        <p><b>Amount:</b> ₹${order.amount}</p>
        <p>Thank you for shopping with us ❤️</p>
      `);

    await mailerSend.email.send(emailParams);

    console.log("📧 Email sent");

    res.json({
      success: true,
      message: "Payment verified & email sent ✅"
    });

  } catch (err) {
    console.error("❌ Verify error:", err);
    res.status(500).json({
      success: false,
      message: "Verification failed"
    });
  }
});

// ================= START =================
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
