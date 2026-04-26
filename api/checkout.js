import { neon } from '@neondatabase/serverless';

const ALLOWED_ORIGINS = [
  'https://purchase-page-six.vercel.app',
  'https://purchase-page.vercel.app',
];
const BASE_URL = 'https://purchase-page-six.vercel.app';
const PRODUCT_ID = 'prod_57ef9457576ec420cb285b75aaf';
const SELF_API_BASE = process.env.SELF_API_BASE || 'https://purchase-page-six.vercel.app';

function db() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');
  return neon(url);
}

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

const priceCache = new Map();

function getAuthHeaders() {
  const secretKey = (process.env.PAYJP_SECRET_KEY || '').replace(/\\n$/, '').trim();
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + Buffer.from(secretKey + ':').toString('base64'),
  };
}

async function getOrCreatePrice(amount) {
  if (priceCache.has(amount)) return priceCache.get(amount);

  const headers = getAuthHeaders();

  const searchRes = await fetch(
    `https://api.pay.jp/v2/prices?product_id=${PRODUCT_ID}&limit=100`,
    { headers }
  );
  if (!searchRes.ok) return null;
  const searchData = await searchRes.json();
  const existing = searchData.data?.find(p => p.unit_amount === amount && p.active);
  if (existing) {
    priceCache.set(amount, existing.id);
    return existing.id;
  }

  const man = amount >= 10000
    ? (amount % 10000 === 0 ? (amount / 10000) + '万円' : Math.floor(amount / 10000) + '万' + (amount % 10000) + '円')
    : amount.toLocaleString() + '円';

  const createRes = await fetch('https://api.pay.jp/v2/prices', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      product_id: PRODUCT_ID,
      unit_amount: amount,
      currency: 'jpy',
      nickname: man,
    }),
  });

  if (!createRes.ok) return null;
  const createData = await createRes.json();
  if (createData.error) return null;

  priceCache.set(amount, createData.id);
  return createData.id;
}

async function fetchPaymentLink(token) {
  try {
    const res = await fetch(`${SELF_API_BASE}/api/payment-links?token=${encodeURIComponent(token)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('fetchPaymentLink error:', e);
    return null;
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const inputCustomerName = typeof req.body?.customer_name === 'string' ? req.body.customer_name.trim() : '';
  const inputCustomerEmail = typeof req.body?.customer_email === 'string' ? req.body.customer_email.trim() : '';

  if (!token) {
    return res.status(400).json({ error: '営業担当者から発行されたリンクからお支払いください。' });
  }
  if (!inputCustomerName || inputCustomerName.length < 2 || inputCustomerName.length > 50) {
    return res.status(400).json({ error: 'お名前を入力してください。' });
  }

  const link = await fetchPaymentLink(token);
  if (!link || link.error) {
    return res.status(400).json({ error: 'リンクが無効です。営業担当者にお問い合わせください。' });
  }
  if (link.status === 'paid') {
    return res.status(400).json({ error: 'このリンクは既にお支払い済みです。' });
  }

  const amount = link.amount;
  const customerName = inputCustomerName;
  const customerEmail = inputCustomerEmail || link.customer_email || '';
  const salesPerson = link.sales_person;

  try {
    try {
      const sql = db();
      await sql`
        UPDATE payment_links
        SET customer_name = ${customerName},
            customer_email = ${customerEmail || null}
        WHERE token = ${token}
      `;
    } catch (e) {
      console.error('payment_links update failed:', e);
    }

    const priceId = await getOrCreatePrice(amount);
    if (!priceId) {
      return res.status(500).json({ error: 'Failed to create price' });
    }

    const description = `${customerName}様 / 営業: ${salesPerson}`;

    const sessionPayload = {
      line_items: [{ price_id: priceId, quantity: 1 }],
      mode: 'payment',
      success_url: `${BASE_URL}/?result=success&token=${encodeURIComponent(token)}`,
      cancel_url: `${BASE_URL}/?result=cancel&token=${encodeURIComponent(token)}`,
      metadata: {
        token,
        customer_name: customerName || '',
        sales_person: salesPerson || '',
      },
      payment_intent_data: {
        description,
        metadata: {
          token,
          customer_name: customerName || '',
          sales_person: salesPerson || '',
        },
      },
    };
    if (customerEmail) {
      sessionPayload.customer_email = customerEmail;
    }

    const response = await fetch('https://api.pay.jp/v2/checkout/sessions', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(sessionPayload),
    });

    const session = await response.json();

    if (!response.ok || session.error) {
      console.error('pay.jp checkout session error:', session);
      return res.status(500).json({ error: 'Failed to create checkout session' });
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('checkout handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
