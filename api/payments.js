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
    const rows = await sql`
      SELECT
        token,
        customer_name,
        customer_email,
        sales_person,
        amount,
        status,
        failure_reason,
        consultation_id,
        notes,
        created_at,
        paid_at,
        failed_at,
        payjp_charge_id
      FROM payment_links
      ORDER BY created_at DESC
      LIMIT 500
    `;

    const purchaseBase = process.env.PURCHASE_PAGE_BASE || 'https://purchase-page-six.vercel.app';

    const items = rows.map(r => ({
      token: r.token,
      url: `${purchaseBase}/?token=${r.token}`,
      customer_name: r.customer_name,
      customer_email: r.customer_email,
      sales_person: r.sales_person,
      amount: r.amount,
      status: r.status,
      failure_reason: r.failure_reason,
      consultation_id: r.consultation_id,
      notes: r.notes,
      created_at: r.created_at,
      paid_at: r.paid_at,
      failed_at: r.failed_at,
      payjp_charge_id: r.payjp_charge_id,
    }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ items });
  } catch (e) {
    console.error('/api/payments error:', e);
    return res.status(500).json({ error: 'server error' });
  }
};
