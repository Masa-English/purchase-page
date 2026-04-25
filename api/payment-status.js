const { neon } = require('@neondatabase/serverless');

const ALLOWED_ORIGINS = [
  'https://analysis-roan-delta.vercel.app',
  'https://purchase-page-six.vercel.app',
  'https://purchase-page.vercel.app',
];

function setCors(req, res) {
  const origin = req.headers.origin || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function db() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');
  return neon(url);
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' });
  }
  try {
    const sql = db();
    const consRows = await sql`
      SELECT id, payjp_status, payjp_amount, payjp_paid_at
      FROM consultations
      WHERE payjp_status IS NOT NULL
    `;

    const linkRows = await sql`
      SELECT customer_name, status, amount, sales_person, created_at, paid_at, failed_at, consultation_id
      FROM payment_links
      ORDER BY created_at DESC
    `;

    const byConsultationId = {};
    for (const r of consRows) {
      byConsultationId[String(r.id)] = {
        status: r.payjp_status,
        amount: r.payjp_amount || 0,
        paid_at: r.payjp_paid_at,
      };
    }

    const byCustomerName = {};
    for (const r of linkRows) {
      const existing = byCustomerName[r.customer_name];
      if (existing && existing.status === 'paid') continue;
      byCustomerName[r.customer_name] = {
        status: r.status,
        amount: r.amount,
        sales_person: r.sales_person,
        created_at: r.created_at,
        paid_at: r.paid_at,
      };
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      by_consultation_id: byConsultationId,
      by_customer_name: byCustomerName,
    });
  } catch (e) {
    console.error('/api/payment-status error:', e);
    return res.status(500).json({ error: 'server error' });
  }
};
