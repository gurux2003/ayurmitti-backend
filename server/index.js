import express from 'express';
import dotenv from 'dotenv';
import { MailerSend, EmailParams, Sender, Recipient } from 'mailersend';
import Razorpay from 'razorpay';
import crypto from 'crypto';

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

// ================= CORS =================
const allowedOrigin = process.env.CORS_ORIGIN || '*';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ================= MAILERSEND =================
const mailerSend = new MailerSend({
  apiKey: process.env.MAILERSEND_API_KEY
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

// ================= ROUTES =================

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend running 🚀' });
});

// ================= ORDER EMAIL =================
app.post('/api/send-order-confirmation', async (req, res) => {
  try {
    const { order, storeName } = req.body;

    if (!order || !order.email) {
      return res.status(400).json({ success: false, message: 'Missing order data' });
    }

    const recipients = [
      new Recipient(order.email, order.customer || "Customer")
    ];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject(`${storeName || 'Ayurmitti'} Order Confirmation`)
      .setHtml(`
        <h2>Order Confirmed ✅</h2>
        <p><strong>Order ID:</strong> ${order.id}</p>
        <p><strong>Total:</strong> ₹${order.amount}</p>
      `);

    await mailerSend.email.send(emailParams);

    console.log("✅ Order Email Sent");
    res.json({ success: true });

  } catch (err) {
    console.error("❌ Order Email Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ================= SHIPPING EMAIL =================
app.post('/api/send-shipping-update', async (req, res) => {
  try {
    const { order, storeName } = req.body;

    if (!order || !order.email || !order.trackingId) {
      return res.status(400).json({
        success: false,
        message: 'Missing tracking info'
      });
    }

    const recipients = [
      new Recipient(order.email, order.customer || "Customer")
    ];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject(`${storeName || 'Ayurmitti'} Shipping Update`)
      .setHtml(`
        <h2>Your Order Shipped 🚚</h2>
        <p><strong>Order ID:</strong> ${order.id}</p>
        <p><strong>Tracking ID:</strong> ${order.trackingId}</p>
        ${
          order.trackingUrl
            ? `<p><a href="${order.trackingUrl}">Track your order</a></p>`
            : ''
        }
      `);

    await mailerSend.email.send(emailParams);

    console.log("✅ Shipping Email Sent");
    res.json({ success: true });

  } catch (err) {
    console.error("❌ Shipping Email Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ================= RAZORPAY CREATE ORDER =================
app.post('/api/create-razorpay-order', async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ success: false, message: 'Amount required' });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "receipt_" + Date.now()
    });

    console.log("✅ Razorpay Order Created:", order.id);

    res.json({
      success: true,
      order
    });

  } catch (err) {
    console.error("❌ Razorpay Order Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ================= RAZORPAY VERIFY =================
app.post('/api/verify-payment', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      console.log("✅ Payment Verified");
      return res.json({ success: true });
    } else {
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

  } catch (err) {
    console.error("❌ Verify Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ================= TEST ROUTES =================
app.get('/api/send-order-confirmation', (req, res) => {
  res.send("❌ Use POST method");
});

app.get('/api/send-shipping-update', (req, res) => {
  res.send("❌ Use POST method");
});

app.get('/api/create-razorpay-order', (req, res) => {
  res.send("❌ Use POST method");
});

app.get('/api/verify-payment', (req, res) => {
  res.send("❌ Use POST method");
});

// ================= START =================
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
