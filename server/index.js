import express from 'express';
import { MailerSend, EmailParams, Sender, Recipient } from 'mailersend';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverEnvPath = path.join(__dirname, '.env');

if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath });
} else {
  dotenv.config();
}

const app = express();
const port = Number(process.env.PORT || process.env.MAIL_SERVER_PORT) || 8787;

// Basic CORS for browser requests (dev Vite runs on a different port).
// Allow Railway backend to accept requests from Hostinger frontend
const corsOrigin = process.env.CORS_ORIGIN || 'https://*.hostinger.com,https://*.ayurmitti.com,*';
const allowedOrigins = corsOrigin
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const resolveCorsOrigin = (requestOrigin) => {
  if (allowedOrigins.length === 0) return '*';
  if (allowedOrigins.includes('*')) return '*';
  if (!requestOrigin) return '';
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : '';
};

app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  const resolvedOrigin = resolveCorsOrigin(requestOrigin);

  if (resolvedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', resolvedOrigin);
    if (resolvedOrigin !== '*') {
      res.setHeader('Vary', 'Origin');
    }
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});

app.use(express.json({ limit: '1mb' }));


// Mailersend setup
const mailersend = new MailerSend({
  apiKey: process.env.MAILERSEND_API_KEY,
});

// Change this to your verified sender in Mailersend
const VERIFIED_SENDER = 'no-reply@ayurmitti.com';

const renderOrderEmailHtml = (order = {}, storeName = 'Ayurmitti') => {
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );
  const orderTotal = Number(order.amount || 0);
  const shipping = Math.max(0, orderTotal - subtotal);
  const shippingDisplay = shipping === 0 ? 'FREE' : `Rs. ${shipping}`;

  const itemRows = items
    .map((item) => {
      const lineTotal = Number(item.price || 0) * Number(item.quantity || 0);
      return `<tr>
        <td style="padding:8px;border:1px solid #e5e7eb;">${item.name || 'Item'}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">${item.quantity || 0}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">Rs. ${lineTotal}</td>
      </tr>`;
    })
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;line-height:1.5;">
      <h2 style="margin:0 0 12px;color:#166534;">Thank you for your order!</h2>
      <p style="margin:0 0 16px;">Hello ${order.customer || 'Customer'}, your order has been received by ${storeName}.</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:16px;">
        <p style="margin:4px 0;"><strong>Order ID:</strong> ${order.id || '-'}</p>
        <p style="margin:4px 0;"><strong>Date:</strong> ${order.date || '-'}</p>
        <p style="margin:4px 0;"><strong>Payment:</strong> ${order.paymentMethod === 'online' ? 'Online Payment' : 'Cash on Delivery'}</p>
        <p style="margin:4px 0;"><strong>Product Total:</strong> Rs. ${subtotal}</p>
        <p style="margin:4px 0;"><strong>Shipping Charges:</strong> ${shippingDisplay}</p>
        <p style="margin:4px 0;"><strong>Total Payable:</strong> Rs. ${orderTotal}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <thead>
          <tr>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;background:#f3f4f6;">Item</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:center;background:#f3f4f6;">Qty</th>
            <th style="padding:8px;border:1px solid #e5e7eb;text-align:right;background:#f3f4f6;">Line Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <p style="margin:0 0 8px;"><strong>Shipping Address:</strong></p>
      <p style="margin:0 0 16px;">${order.address || '-'}</p>
      <p style="margin:0;">Need help? Reply to this email and our team will assist you.</p>
    </div>
  `;
};

const renderShippingUpdateEmailHtml = (order = {}, storeName = 'Ayurmitti') => {
  const trackingId = order.trackingId || order.deliveryId || order.deliveryTrackingId || '';
  const trackingUrl = order.trackingUrl || '';

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;line-height:1.5;">
      <h2 style="margin:0 0 12px;color:#166534;">Your order has been shipped</h2>
      <p style="margin:0 0 16px;">Hello ${order.customer || 'Customer'}, your order from ${storeName} is on the way.</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:16px;">
        <p style="margin:4px 0;"><strong>Order ID:</strong> ${order.id || '-'}</p>
        <p style="margin:4px 0;"><strong>Delivery / Tracking ID:</strong> ${trackingId || '-'}</p>
        ${trackingUrl ? `<p style="margin:4px 0;"><strong>Tracking link:</strong> <a href="${trackingUrl}" target="_blank" rel="noreferrer noopener">Track your shipment</a></p>` : ''}
      </div>
      <p style="margin:0;">If you have questions, reply to this email and we’ll help.</p>
    </div>
  `;
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'mail-server' });
});

app.post('/api/send-order-confirmation', async (req, res) => {
  try {
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
    return res.status(500).json({ success: false, message: error.message || 'Failed to send email.' });
  }
});

app.post('/api/send-shipping-update', async (req, res) => {
  try {
    const { order, storeName } = req.body || {};

    if (!order || !order.email) {
      return res.status(400).json({ success: false, message: 'Missing order or customer email.' });
    }

    const trackingId = order.trackingId || order.deliveryId || order.deliveryTrackingId;
    if (!trackingId) {
      return res.status(400).json({ success: false, message: 'Missing delivery/tracking ID.' });
    }

    const recipients = [new Recipient(order.email, order.customer || 'Customer')];
    const subject = `${storeName || 'Ayurmitti'} Shipping Update - ${order.id || ''}`.trim();

    const emailParams = new EmailParams()
      .setFrom(new Sender(VERIFIED_SENDER, storeName || 'Ayurmitti'))
      .setTo(recipients)
      .setSubject(subject)
      .setHtml(renderShippingUpdateEmailHtml(order, storeName));

    const info = await mailersend.email.send(emailParams);

    return res.json({ success: true, messageId: info.messageId || 'sent' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to send email.' });
  }
});

app.listen(port, () => {
  console.log(`Mail server running at http://localhost:${port}`);
});
