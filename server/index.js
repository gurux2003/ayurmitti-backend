import express from 'express';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// ================= CORS =================
const allowedOrigin = process.env.CORS_ORIGIN || '*';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// ================= MAIL SETUP =================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
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
      return res.status(400).json({ success: false, message: 'Missing order data' });
    }

    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: order.email,
      subject: `${storeName || 'Ayurmitti'} Order Confirmation`,
      html: `<h2>Order Confirmed</h2>
             <p>Order ID: ${order.id}</p>
             <p>Total: ₹${order.amount}</p>`
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
      from: process.env.SMTP_FROM,
      to: order.email,
      subject: `${storeName || 'Ayurmitti'} Shipping Update`,
      html: `<h2>Your Order Shipped 🚚</h2>
             <p>Order ID: ${order.id}</p>
             <p>Tracking ID: ${order.trackingId}</p>
             ${
               order.trackingUrl
                 ? `<a href="${order.trackingUrl}">Track Order</a>`
                 : ''
             }`
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("✅ Shipping Email Sent:", info.messageId);

    res.json({ success: true, messageId: info.messageId });

  } catch (err) {
    console.error("❌ Shipping Email Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ================= TEST ROUTES (FOR BROWSER) =================

// 👇 Now this will work in browser
app.get('/api/send-shipping-update', (req, res) => {
  res.send("❌ Use POST method to send shipping email");
});

app.get('/api/send-order-confirmation', (req, res) => {
  res.send("❌ Use POST method to send order email");
});

// ================= START SERVER =================
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
