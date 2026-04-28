const express = require('express');
const dotenv = require('dotenv');
const Razorpay = require('razorpay');
const pkg = require('mailersend');

const { MailerSend, EmailParams, Sender, Recipient } = pkg;

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

// ================= CORS =================
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ================= MAILERSEND FIX =================
// ❗ THIS IS THE MAIN FIX
const mailerSend = new MailerSend({
  apiKey: process.env.MAILERSEND_API_KEY // must exist
});

const sentFrom = new Sender(
  process.env.MAIL_FROM || "noreply@yourdomain.com",
  "Your Store"
);

// ================= RAZORPAY =================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ================= HEALTH =================
app.get('/api/health', (req, res) => {
  res.json({ status: "OK 🚀" });
});

// ================= ORDER EMAIL =================
app.post('/api/send-order-confirmation', async (req, res) => {
  try {
    const { order } = req.body;

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo([new Recipient(order.email)])
      .setSubject("Order Confirmed ✅")
      .setHtml(`
        <h2>Order Confirmed</h2>
        <p>Order ID: ${order.id}</p>
        <p>Total: ₹${order.amount}</p>
      `);

    await mailerSend.email.send(emailParams);

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ================= SHIPPING EMAIL =================
app.post('/api/send-shipping-update', async (req, res) => {
  try {
    const { order } = req.body;

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo([new Recipient(order.email)])
      .setSubject("Order Shipped 🚚")
      .setHtml(`
        <h2>Your Order Shipped</h2>
        <p>Tracking ID: ${order.trackingId}</p>
      `);

    await mailerSend.email.send(emailParams);

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ================= RAZORPAY ORDER =================
app.post('/api/create-order', async (req, res) => {
  try {
    const { amount } = req.body;

    const options = {
      amount: amount * 100, // paisa
      currency: "INR",
      receipt: "order_rcptid_" + Date.now()
    };

    const order = await razorpay.orders.create(options);

    res.json(order);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ================= START =================
app.listen(port, () => {
  console.log(`🚀 Server running on ${port}`);
});
