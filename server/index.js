import express from 'express';
import dotenv from 'dotenv';
import { MailerSend, EmailParams, Sender, Recipient } from 'mailersend';

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

// ================= MAILERSEND SETUP =================
const mailerSend = new MailerSend({
  apiKey: process.env.MAILERSEND_API_KEY
});

// Sender email (must be verified in MailerSend)
const sentFrom = new Sender(
  process.env.MAIL_FROM || "noreply@ayurmitti.com",
  "Ayurmitti"
);

// ================= ROUTES =================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend running 🚀' });
});

// ================= ORDER EMAIL =================
app.post('/api/send-order-confirmation', async (req, res) => {
  try {
    const { order, storeName } = req.body;

    if (!order || !order.email) {
      return res.status(400).json({
        success: false,
        message: 'Missing order data'
      });
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

    const response = await mailerSend.email.send(emailParams);

    console.log("✅ Order Email Sent:", response);

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

    const response = await mailerSend.email.send(emailParams);

    console.log("✅ Shipping Email Sent:", response);

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Shipping Email Error:", err);
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

// ================= START SERVER =================
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
