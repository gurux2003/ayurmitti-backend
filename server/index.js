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
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ================= MAIL =================
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
  res.json({ status: "OK" });
});


// =====================================================
// 📦 ORDER CREATE + EMAIL
// =====================================================
app.post("/api/create-order", async (req, res) => {
  try {
    const { order } = req.body;

    if (!order || !order.email) {
      return res.status(400).json({ error: "Missing order data" });
    }

    // 📧 Send Email
    const recipients = [
      new Recipient(order.email, order.customer || "Customer")
    ];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject("Order Placed - Ayurmitti")
      .setHtml(`
        <h2>Order Confirmed ✅</h2>
        <p><b>Order ID:</b> ${order.id}</p>
        <p><b>Amount:</b> ₹${order.amount}</p>
      `);

    await mailerSend.email.send(emailParams);

    res.json({
      success: true,
      message: "Order created & email sent ✅"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Order failed" });
  }
});


// =====================================================
// 🚚 SHIPPING EMAIL
// =====================================================
app.post("/api/send-shipping-update", async (req, res) => {
  try {
    const { order } = req.body;

    if (!order || !order.email || !order.trackingId) {
      return res.status(400).json({ error: "Missing tracking info" });
    }

    const recipients = [
      new Recipient(order.email, order.customer || "Customer")
    ];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject("Shipping Update - Ayurmitti")
      .setHtml(`
        <h2>Your Order Shipped 🚚</h2>
        <p><b>Order ID:</b> ${order.id}</p>
        <p><b>Tracking ID:</b> ${order.trackingId}</p>
      `);

    await mailerSend.email.send(emailParams);

    res.json({
      success: true,
      message: "Shipping email sent ✅"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Shipping email failed" });
  }
});


// =====================================================
// 💳 RAZORPAY CREATE PAYMENT ORDER
// =====================================================
app.post("/api/create-payment-order", async (req, res) => {
  try {
    const { amount } = req.body;

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "receipt_" + Date.now()
    });

    res.json(order);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Payment order failed" });
  }
});


// =====================================================
// 🔐 VERIFY PAYMENT (NO EMAIL HERE)
// =====================================================
app.post("/api/verify-payment", (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  } = req.body;

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    return res.json({ success: true, message: "Payment verified ✅" });
  }

  res.status(400).json({ success: false, message: "Invalid signature ❌" });
});


// ================= START =================
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
