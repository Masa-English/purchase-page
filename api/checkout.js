const ALLOWED_ORIGINS = [
  'https://purchase-page-six.vercel.app',
  'https://purchase-page.vercel.app',
];
const BASE_URL = 'https://purchase-page-six.vercel.app';

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

// 36万〜100万（1万円刻み）のPrice IDマッピング
const PRICES = {
  360000: 'price_a1979cf423474efb207b7201db',
  370000: 'price_5c4a240782cb794ff72ff35bf4',
  380000: 'price_5f50bf7b2dd379416d9b5e22a6',
  390000: 'price_a30c5801f4191bc90bc790dfe2',
  400000: 'price_3f93593fc669a799607a26b35c',
  410000: 'price_1e49bbd1a9b5e2097a7221c636',
  420000: 'price_9a5b15b32d23db0bd3e8600f38',
  430000: 'price_939d15e3f383388e4e93dd6122',
  440000: 'price_931949656980ecc71c981d919f',
  450000: 'price_34b5b262fbcf9175fbb968b70b',
  460000: 'price_1c9802e4c963127ab4f239b1e4',
  470000: 'price_f9850d1ce5ced28c81c4107f80',
  480000: 'price_48031f8b3bc129e2ce1a600341',
  490000: 'price_0fb707a593d0823f164c9bc75d',
  500000: 'price_fa5fdbaf24166341475e4afa2c',
  510000: 'price_9d80f6a8f4829b1db78ba9618a',
  520000: 'price_a5877bf1846e090a7905a7f2ca',
  530000: 'price_612165df3443d1b561a5d9e75a',
  540000: 'price_9aace78bed3a74e4bfc1c10175',
  550000: 'price_19dadb7090a1f2b60c544f5d25',
  560000: 'price_3df1e6a500365dae6326873512',
  570000: 'price_c6dc2da871d76fb04ed6dc6961',
  580000: 'price_200e9c521e1256fc8b4a4af338',
  590000: 'price_03da3ce9764f01f02063439503',
  600000: 'price_6a9d732e70a63bd362aecbe130',
  610000: 'price_db61d9dd0c8de22b4ea11c5476',
  620000: 'price_625858888086bc07bbd493c0d6',
  630000: 'price_4574553455087ed8b459307d1b',
  640000: 'price_a6917dd6853fa963811417320d',
  650000: 'price_22d45e4cd3888856c1c3e454b2',
  660000: 'price_e6bb780d32c2d47ef0e8cdc90e',
  670000: 'price_16295aa37a6486a499f73310fd',
  680000: 'price_f5106092123f33e3ab3d71f9a9',
  690000: 'price_97962a063bd51fcd26a6dbbe6b',
  700000: 'price_56c78d299f10d6c6e3c92bb66b',
  710000: 'price_6c9075e532899b450a18e66d1b',
  720000: 'price_f317fbebcf80827243aedfe1d8',
  730000: 'price_fa535311c51a4de261745439de',
  740000: 'price_b19ad41550edbdad4d5ca1845a',
  750000: 'price_4617acc8509f7de8088a6a4415',
  760000: 'price_715d0ca5763639ede2279cc8a1',
  770000: 'price_38712116d1554dd178c902ec8f',
  780000: 'price_5dbfca475574f0a2c80769009b',
  790000: 'price_3e0d7541d46b970c19906cf51c',
  800000: 'price_0643f6b0f40a0828cf292340f0',
  810000: 'price_4a80a5f6a2822591b65087a899',
  820000: 'price_8bd693d3e3dc43a52acc2c12b9',
  830000: 'price_8cd8a632d89d0d2fbe6ed5defa',
  840000: 'price_a4d99a7ef08ecce63279390ca8',
  850000: 'price_383732c8c216a352a9b63b28bc',
  860000: 'price_5676e2cbcb2a081db60e7ca924',
  870000: 'price_5c55d212d9ce2f07e734a724de',
  880000: 'price_0a8e78cc5f391ad6d0127ab2a6',
  890000: 'price_72bd88b805807fbf0e3e3a8d6e',
  900000: 'price_a70f3f0a134b215a6dd1f0bc04',
  910000: 'price_3a47089021e246787e4757fac7',
  920000: 'price_ca22f29b9e633a0e43964aab81',
  930000: 'price_d2086e031bbea83527e586a74c',
  940000: 'price_c982561a1d7465df3b50dfeeed',
  950000: 'price_c37a4acfaea5cab7b636a00c03',
  960000: 'price_c52cdabb7aa030553cf1a9e384',
  970000: 'price_e338fcb38cd7618ee876714a8f',
  980000: 'price_bf31fd5ab8b31305eeaa32fe46',
  990000: 'price_768f60668aa6654bde8f2ac86e',
  1000000: 'price_11422403ec3234449115fb6275',
};

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

  const amount = Number(req.body?.amount);
  if (!amount || !PRICES[amount]) {
    return res.status(400).json({ error: 'Invalid amount. Must be 360000-1000000 in 10000 increments.' });
  }

  const priceId = PRICES[amount];

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
