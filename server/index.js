import express from 'express';
import dotenv from 'dotenv';
import Razorpay from 'razorpay';
import crypto from 'crypto';

// ✅ FIXED MailerSend import
import pkg from 'mailersend';
const { MailerSend, EmailParams, Sender, Recipient } = pkg;

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

// ================= CREATE ORDER (RAZORPAY) =================
app.post('/api/create-order', async (req, res) => {
  try {
    const { amount } = req.body;

    const options = {
      amount: amount * 100, // paise
      currency: "INR",
      receipt: "receipt_" + Date.now()
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      order
    });

  } catch (err) {
    console.error("❌ Razorpay Order Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ================= VERIFY PAYMENT =================
app.post('/api/verify-payment', (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      return res.json({ success: true, message: "Payment verified ✅" });
    } else {
      return res.status(400).json({ success: false, message: "Invalid signature ❌" });
    }

  } catch (err) {
    console.error("❌ Verify Error:", err);
    res.status(500).json({ success: false });
  }
});

// ================= ORDER EMAIL =================
app.post('/api/send-order-confirmation', async (req, res) => {
  try {
    const { order, storeName } = req.body;

    const recipients = [
      new Recipient(order.email, order.customer || "Customer")
    ];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject(`${storeName || 'Ayurmitti'} Order Confirmation`)
      .setHtml(`
        <h2>Order Confirmed ✅</h2>
        <p>Order ID: ${order.id}</p>
        <p>Total: ₹${order.amount}</p>
      `);

    await mailerSend.email.send(emailParams);

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Order Email Error:", err);
    res.status(500).json({ success: false });
  }
});

// ================= SHIPPING EMAIL =================
app.post('/api/send-shipping-update', async (req, res) => {
  try {
    const { order, storeName } = req.body;

    const recipients = [
      new Recipient(order.email, order.customer || "Customer")
    ];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject(`${storeName || 'Ayurmitti'} Shipping Update`)
      .setHtml(`
        <h2>Your Order Shipped 🚚</h2>
        <p>Order ID: ${order.id}</p>
        <p>Tracking ID: ${order.trackingId}</p>
      `);

    await mailerSend.email.send(emailParams);

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Shipping Email Error:", err);
    res.status(500).json({ success: false });
  }
});

// ================= TEST ROUTES =================
app.get('/api/send-order-confirmation', (req, res) => {
  res.send("Use POST");
});

app.get('/api/send-shipping-update', (req, res) => {
  res.send("Use POST");
});

// ================= START =================
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
