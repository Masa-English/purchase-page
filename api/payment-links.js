const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

const ALLOWED_ORIGINS = [
  'https://purchase-page-six.vercel.app',
  'https://purchase-page.vercel.app',
  'https://analysis-roan-delta.vercel.app',
];

function setCors(req, res) {
  const origin = req.headers.origin || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
}

function checkSalesAuth(req) {
  const expected = process.env.SALES_PAGE_PASSWORD_HASH;
  if (!expected) return false;
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+([a-f0-9]{64})$/i);
  if (!m) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(m[1].toLowerCase()), Buffer.from(expected.toLowerCase()));
  } catch {
    return false;
  }
}

function db() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');
  return neon(url);
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    const token = (req.query && req.query.token) || '';
    if (!token) return res.status(400).json({ error: 'token required' });
    try {
      const sql = db();
      const rows = await sql`
        SELECT token, customer_name, amount, status, created_at, paid_at
        FROM payment_links
        WHERE token = ${token}
        LIMIT 1
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'not found' });
      const r = rows[0];
      return res.status(200).json({
        token: r.token,
        customer_name: r.customer_name,
        amount: r.amount,
        status: r.status,
        created_at: r.created_at,
        paid_at: r.paid_at,
      });
    } catch (e) {
      console.error('GET /api/payment-links failed:', e);
      return res.status(500).json({ error: 'server error' });
    }
  }

  if (req.method === 'POST') {
    if (!checkSalesAuth(req)) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const body = req.body || {};
    const customerName = (body.customer_name || '').trim();
    const customerEmail = (body.customer_email || '').trim() || null;
    const salesPerson = (body.sales_person || '').trim() || null;
    const amount = Number(body.amount);
    const consultationId = body.consultation_id ? Number(body.consultation_id) : null;
    const notes = (body.notes || '').trim() || null;

    if (!customerName) return res.status(400).json({ error: 'customer_name required' });
    if (!Number.isInteger(amount) || amount < 1000 || amount > 1200000 || amount % 1000 !== 0) {
      return res.status(400).json({ error: 'invalid amount (1000-1200000, 1000 yen step)' });
    }
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return res.status(400).json({ error: 'invalid email' });
    }

    const token = crypto.randomUUID();

    try {
      const sql = db();
      await sql`
        INSERT INTO payment_links
          (token, customer_name, customer_email, sales_person, amount, consultation_id, notes, status)
        VALUES
          (${token}, ${customerName}, ${customerEmail}, ${salesPerson}, ${amount}, ${consultationId}, ${notes}, 'pending')
      `;
      const purchaseBase = process.env.PURCHASE_PAGE_BASE || 'https://purchase-page-six.vercel.app';
      return res.status(201).json({
        token,
        url: `${purchaseBase}/?token=${token}`,
        customer_name: customerName,
        amount,
      });
    } catch (e) {
      console.error('POST /api/payment-links failed:', e);
      return res.status(500).json({ error: 'server error' });
    }
  }

  return res.status(405).json({ error: 'method not allowed' });
};
