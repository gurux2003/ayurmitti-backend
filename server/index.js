import express from 'express';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// ================= CORS =================
const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map(o => o.trim());

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

// ================= MAIL SETUP =================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Optional: verify SMTP on start (helps debugging)
transporter.verify((err) => {
  if (err) {
    console.error("❌ SMTP Error:", err.message);
  } else {
    console.log("✅ SMTP Ready");
  }
});

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
        message: 'Missing order or email'
      });
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: order.email,
      subject: `${storeName || 'Ayurmitti'} Order Confirmation - ${order.id}`,
      html: `
        <h2>✅ Order Confirmed</h2>
        <p><strong>Order ID:</strong> ${order.id}</p>
        <p><strong>Total:</strong> ₹${order.amount}</p>
        <p>Thank you for shopping with us 🙏</p>
      `
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("✅ Order Email Sent:", info.messageId);

    res.json({ success: true, messageId: info.messageId });

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

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: order.email,
      subject: `${storeName || 'Ayurmitti'} Shipping Update - ${order.id}`,
      html: `
        <h2>🚚 Your Order Shipped</h2>
        <p><strong>Order ID:</strong> ${order.id}</p>
        <p><strong>Tracking ID:</strong> ${order.trackingId}</p>
        ${
          order.trackingUrl
            ? `<p><a href="${order.trackingUrl}" target="_blank">Track your order</a></p>`
            : ''
        }
      `
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("✅ Shipping Email Sent:", info.messageId);

    res.json({ success: true, messageId: info.messageId });

  } catch (err) {
    console.error("❌ Shipping Email Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ================= TEST ROUTES =================
app.get('/api/send-shipping-update', (req, res) => {
  res.send("❌ Use POST method");
});

app.get('/api/send-order-confirmation', (req, res) => {
  res.send("❌ Use POST method");
});

// ================= START SERVER =================
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${port}`);
});
