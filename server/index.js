import express from 'express';
import { MailerSend, EmailParams, Sender, Recipient } from 'mailersend';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 8080;

// CORS setup
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '1mb' }));

// Mailersend setup
if (!process.env.MAILERSEND_API_KEY) {
  console.error('❌ MAILERSEND_API_KEY is not set!');
}
const mailersend = new MailerSend({
  apiKey: process.env.MAILERSEND_API_KEY || '',
});
const VERIFIED_SENDER = 'no-reply@ayurmitti.com'; // Change to your verified sender

const renderOrderEmailHtml = (order = {}, storeName = 'Ayurmitti') => {
  return `<div>Order confirmation for ${order.customer || 'Customer'}</div>`;
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'mail-server' });
});

app.post('/api/send-order-confirmation', async (req, res) => {
  try {
    if (!process.env.MAILERSEND_API_KEY) {
      return res.status(500).json({ success: false, message: 'Email service not configured' });
    }
    const { order, storeName } = req.body || {};
    if (!order || !order.email) {
      return res.status(400).json({ success: false, message: 'Missing order or customer email.' });
    }
    const recipients = [new Recipient(order.email, order.customer || 'Customer')];
    const subject = `${storeName || 'Ayurmitti'} Order Confirmation - ${order.id || ''}`.trim();
    const emailParams = new EmailParams()
      .setFrom(new Sender(VERIFIED_SENDER, storeName || 'Ayurmitti'))
      .setTo(recipients)
      .setSubject(subject)
      .setHtml(renderOrderEmailHtml(order, storeName));
    const info = await mailersend.email.send(emailParams);
    return res.json({ success: true, messageId: info.messageId || 'sent' });
  } catch (error) {
    console.error('Email send error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to send email.' });
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Mail server running on port ${port}`);
});
