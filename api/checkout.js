const ALLOWED_ORIGINS = [
  'https://purchase-page-six.vercel.app',
  'https://purchase-page.vercel.app',
];
const BASE_URL = 'https://purchase-page-six.vercel.app';
const PRODUCT_ID = 'prod_57ef9457576ec420cb285b75aaf';

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

// 既存Price IDのインメモリキャッシュ（コールドスタートで消えるが問題なし）
const priceCache = new Map();

async function getOrCreatePrice(amount) {
  // キャッシュにあればそれを使う
  if (priceCache.has(amount)) {
    return priceCache.get(amount);
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + process.env.PAYJP_SECRET_KEY,
  };

  // pay.jpからlookup_keyで既存Priceを検索
  const searchRes = await fetch(
    `https://api.pay.jp/v2/prices?product_id=${PRODUCT_ID}&lookup_key=amount_${amount}&limit=1`,
    { headers }
  );
  const searchData = await searchRes.json();

  if (searchData.data && searchData.data.length > 0) {
    const priceId = searchData.data[0].id;
    priceCache.set(amount, priceId);
    return priceId;
  }

  // なければ新規作成
  const man = amount >= 10000 ? (amount / 10000) + '万円' : amount.toLocaleString() + '円';
  const createRes = await fetch('https://api.pay.jp/v2/prices', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      product_id: PRODUCT_ID,
      unit_amount: amount,
      currency: 'jpy',
      nickname: man,
      lookup_key: `amount_${amount}`,
    }),
  });
  const createData = await createRes.json();

  if (!createRes.ok || createData.error) {
    // lookup_keyが未対応の場合、nicknameだけで作成
    const fallbackRes = await fetch('https://api.pay.jp/v2/prices', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        product_id: PRODUCT_ID,
        unit_amount: amount,
        currency: 'jpy',
        nickname: man,
      }),
    });
    const fallbackData = await fallbackRes.json();
    if (!fallbackRes.ok || fallbackData.error) {
      return null;
    }
    priceCache.set(amount, fallbackData.id);
    return fallbackData.id;
  }

  priceCache.set(amount, createData.id);
  return createData.id;
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

  // 1,000円刻み、1,000円〜1,200,000円
  const amount = Number(req.body?.amount);
  if (!Number.isInteger(amount) || amount < 1000 || amount > 1200000 || amount % 1000 !== 0) {
    return res.status(400).json({ error: 'Invalid amount. Must be 1000-1200000 in 1000 yen increments.' });
  }

  try {
    const priceId = await getOrCreatePrice(amount);
    if (!priceId) {
      return res.status(500).json({ error: 'Failed to create price' });
    }

    const response = await fetch('https://api.pay.jp/v2/checkout/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.PAYJP_SECRET_KEY,
      },
      body: JSON.stringify({
        line_items: [{ price_id: priceId, quantity: 1 }],
        mode: 'payment',
        success_url: `${BASE_URL}/?result=success`,
        cancel_url: `${BASE_URL}/?result=cancel`,
      }),
    });

    const session = await response.json();

    if (!response.ok || session.error) {
      return res.status(500).json({ error: 'Failed to create checkout session' });
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
