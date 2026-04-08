export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { plan } = req.body;

  const prices = {
    basic: 'price_974fa88224ebaa9303985ed9bb',
    standard: 'price_ee2b575d41707bc4cd672fe770',
    full: 'price_147a48ae4d323d0ef0bea40e56',
    premium: 'price_27dafb8686af3276ac7975a03b',
  };

  const priceId = prices[plan];
  if (!priceId) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || '';
  const baseUrl = origin || 'https://purchase-page.vercel.app';

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
        success_url: `${baseUrl}/?result=success`,
        cancel_url: `${baseUrl}/?result=cancel`,
      }),
    });

    const session = await response.json();

    if (!response.ok || session.error) {
      console.error('pay.jp error:', JSON.stringify(session));
      return res.status(500).json({ error: 'Failed to create checkout session', detail: session });
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
