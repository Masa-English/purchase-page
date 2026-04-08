const ALLOWED_ORIGINS = [
  'https://purchase-page-six.vercel.app',
  'https://purchase-page.vercel.app',
];
const BASE_URL = 'https://purchase-page-six.vercel.app';

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 5;

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

  const prices = {
    basic: 'price_974fa88224ebaa9303985ed9bb',
    standard: 'price_ee2b575d41707bc4cd672fe770',
    full: 'price_147a48ae4d323d0ef0bea40e56',
    premium: 'price_27dafb8686af3276ac7975a03b',
  };

  const plan = req.body?.plan;
  const priceId = typeof plan === 'string' ? prices[plan] : undefined;
  if (!priceId) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  try {
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
