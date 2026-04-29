import express from "express";
import dotenv from "dotenv";
import Razorpay from "razorpay";
import crypto from "crypto";
import { Resend } from "resend";

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

// ================= CORS =================
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "https://ayurmitti.com");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ================= RESEND =================
const resend = new Resend(process.env.RESEND_API_KEY);

const MAIL_FROM = process.env.MAIL_FROM || "noreply@ayurmitti.com";

// ================= RAZORPAY =================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ================= HEALTH =================
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Backend running 🚀" });
});


// =====================================================
// 📦 ORDER EMAIL
// =====================================================
app.post("/api/create-order", async (req, res) => {
  try {
    console.log("📥 ORDER BODY:", req.body);

    const { order } = req.body;

    if (!order || !order.email || !order.id || !order.amount) {
      return res.status(400).json({
        error: "Missing order data (id, email, amount required)"
      });
    }

    const { error } = await resend.emails.send({
      from: `Ayurmitti <${MAIL_FROM}>`,
      to: [order.email],
      subject: "Order Confirmed - Ayurmitti",
      html: `
        <h2>Order Confirmed ✅</h2>
        <p>Dear <b>${order.customer || "Customer"}</b>,</p>
        <p><b>Order ID:</b> ${order.id}</p>
        <p><b>Amount:</b> ₹${order.amount}</p>
        <p>Thank you for shopping with Ayurmitti!</p>
      `
    });

    if (error) {
      console.error("❌ ORDER EMAIL ERROR:", error);
      return res.status(500).json({ error: "Order email failed", details: error.message });
    }

    res.json({ success: true, message: "Order email sent ✅" });

  } catch (err) {
    console.error("❌ ORDER EMAIL ERROR:", err);
    res.status(500).json({ error: "Order failed", details: err.message });
  }
});


// =====================================================
// 🚚 SHIPPING EMAIL
// =====================================================
app.post("/api/send-shipping-update", async (req, res) => {
  try {
    console.log("📥 SHIPPING BODY:", req.body);

    const { order } = req.body;

    if (!order || !order.email || !order.id) {
      return res.status(400).json({
        error: "Missing order data (id, email required)"
      });
    }

    const { error } = await resend.emails.send({
      from: `Ayurmitti <${MAIL_FROM}>`,
      to: [order.email],
      subject: "Shipping Update - Ayurmitti",
      html: `
        <h2>Your Order Shipped 🚚</h2>
        <p>Dear <b>${order.customer || "Customer"}</b>,</p>
        <p><b>Order ID:</b> ${order.id}</p>
        ${order.trackingId ? `<p><b>Tracking ID:</b> ${order.trackingId}</p>` : ""}
        <p>Thank you for shopping with Ayurmitti!</p>
      `
    });

    if (error) {
      console.error("❌ SHIPPING ERROR:", error);
      return res.status(500).json({ error: "Shipping email failed", details: error.message });
    }

    res.json({ success: true, message: "Shipping email sent ✅" });

  } catch (err) {
    console.error("❌ SHIPPING ERROR:", err);
    res.status(500).json({ error: "Shipping email failed", details: err.message });
  }
});


// =====================================================
// 💳 CREATE RAZORPAY ORDER
// =====================================================
app.post("/api/create-payment-order", async (req, res) => {
  try {
    console.log("📥 PAYMENT BODY:", req.body);

    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: "Amount is required and must be greater than 0"
      });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "receipt_" + Date.now()
    });

    res.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency
    });

  } catch (err) {
    console.error("❌ RAZORPAY ERROR:", err);
    res.status(500).json({ error: "Payment order failed", details: err.message });
  }
});


// =====================================================
// 🔐 VERIFY PAYMENT
// =====================================================
app.post("/api/verify-payment", (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification data" });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      return res.json({ success: true, message: "Payment verified ✅" });
    }

    res.status(400).json({ success: false, message: "Invalid signature ❌" });

  } catch (err) {
    console.error("❌ VERIFY ERROR:", err);
    res.status(500).json({ error: "Verification failed", details: err.message });
  }
});


// ================= START =================
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

