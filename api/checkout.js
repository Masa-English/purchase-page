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

// 2万〜120万（1万円刻み）のPrice IDマッピング
const PRICES = {
  // 2万〜35万（頭金・分割用）
  20000: 'price_c6a8c5600ec53de9e806954a33',
  30000: 'price_260f2c341cf2ce6b9c2670ac58',
  40000: 'price_1761d3c58c8a06917a679e6f57',
  50000: 'price_c665a0a55a02488aff46991eb8',
  60000: 'price_2d331fe594ca01843c561fa5dc',
  70000: 'price_fc2d0f1f4e66303a30e953f99d',
  80000: 'price_d2374daf33589a4059e82148a5',
  90000: 'price_220e4f61e762aa156576cf9e04',
  100000: 'price_bee48260d618c452d9a5e30c48',
  110000: 'price_80c72d6d7dfa500cf9c731dea3',
  120000: 'price_eb1c3f973e0f79ac8c166fee97',
  130000: 'price_890c5ea14b82896fa1f43d2041',
  140000: 'price_fb8f778146de55e6fcceaeac5f',
  150000: 'price_f3b0c178e624ef42719db968a7',
  160000: 'price_d51209e17db978de372ae35aec',
  170000: 'price_f3e1597d1e3f4cec37289fdf76',
  180000: 'price_f1f8000da57a969f0836a3154b',
  190000: 'price_c259299f558ef2bf28380d3a7c',
  200000: 'price_59b382f97e89d73abc8f32b01b',
  210000: 'price_017587493bf227df296eac6bf6',
  220000: 'price_7642e10cf9cb755409712448ef',
  230000: 'price_3d9e4331238ff2795492526edf',
  240000: 'price_ea6620230c4bba9cad474d32f2',
  250000: 'price_af78707848442930b216e83e98',
  260000: 'price_30c33c21bb4a4e1d365eefc172',
  270000: 'price_a2e643e73c97c74b58181c1f4c',
  280000: 'price_d0428ec7e2ac37a34dea019e5b',
  290000: 'price_e6badb147f5cfbce7fc4019c4a',
  300000: 'price_423ebdf857dbba21a7cd544494',
  310000: 'price_6c56b926d2f5c1ec50929c8b9a',
  320000: 'price_b07a3e8e7c06e3b5f9365b68df',
  330000: 'price_0a7c28008f12a3ef67e9bbd5de',
  340000: 'price_9a3bbd855e86a325028c12dc01',
  350000: 'price_31fe3d53bb4e4eebbe4f74d039',
  // 36万〜100万（メインプラン）
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
  // 101万〜120万（プレミアム超）
  1010000: 'price_964d73871288c649bd8ca7c54e',
  1020000: 'price_826ac992eb808bceedfbcd4103',
  1030000: 'price_4487b3d8c6b11735b4c730f9fd',
  1040000: 'price_1caa12ab9addc6d610ef0bfa6a',
  1050000: 'price_bad06876233a5121bb571b2603',
  1060000: 'price_55ffc7f3991fe117836b3d0210',
  1070000: 'price_4e19bd25c5728ecace0e82edcd',
  1080000: 'price_d61c995de1db542ce0a63767c2',
  1090000: 'price_103f7fbebac4a356daff978dc6',
  1100000: 'price_360603cd1f2c467d76c6c88d62',
  1110000: 'price_66bbbdbaf387e9381b22881eb8',
  1120000: 'price_ebe2e89eb4f58e799585546b6b',
  1130000: 'price_70290206f09fa5cd5714f8aedb',
  1140000: 'price_f824ac8efaeaf06f8e13c00e28',
  1150000: 'price_9a8c1bb9e932b85e467203d37e',
  1160000: 'price_81e2c8d4f2b3d76bb1e7c24f04',
  1170000: 'price_8b96ddf84f2ad14c12bf57bb20',
  1180000: 'price_f777b0288c8e3b232f8715826b',
  1190000: 'price_0ea883498e3807983291aeeef4',
  1200000: 'price_c4da6f99236dade3bf7e02c56d',
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
    return res.status(400).json({ error: 'Invalid amount. Must be 20000-1200000 in 10000 increments.' });
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
