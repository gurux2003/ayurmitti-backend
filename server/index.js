import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import Razorpay from "razorpay";
import pkg from "mailersend";

const { MailerSend, EmailParams, Sender, Recipient } = pkg;

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

// ================= CORS =================
const allowedOrigin = process.env.CORS_ORIGIN || "*";

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
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
  process.env.MAIL_FROM,
  "Ayurmitti"
);

// ================= RAZORPAY =================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ================= ROUTES =================

// Health
app.get("/api/health", (req, res) => {
  res.json({ status: "OK 🚀" });
});


// ================= CREATE ORDER =================
app.post("/api/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    const options = {
      amount: amount * 100, // ₹ → paise
      currency: "INR",
      receipt: "order_" + Date.now()
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      order
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
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

    // 🔐 VERIFY SIGNATURE
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed ❌"
      });
    }

    console.log("✅ Payment Verified");

    // ================= SEND EMAIL =================
    const recipients = [
      new Recipient(order.email, order.customer || "Customer")
    ];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject("Order Confirmed 🎉")
      .setHtml(`
        <h2>Payment Successful ✅</h2>
        <p><strong>Order ID:</strong> ${order.id}</p>
        <p><strong>Amount Paid:</strong> ₹${order.amount}</p>
        <p>Thank you for shopping with us 🙏</p>
      `);

    await mailerSend.email.send(emailParams);

    console.log("📧 Email Sent");

    res.json({
      success: true,
      message: "Payment verified & email sent"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});


// ================= START =================
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
