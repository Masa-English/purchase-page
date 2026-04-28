const { neon } = require('@neondatabase/serverless');

function db() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');
  return neon(url);
}

async function notifySlack(text) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.PAYMENT_SLACK_CHANNEL;
  if (!token || !channel) {
    console.warn('Slack token/channel not set, skip notify');
    return;
  }
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, text }),
    });
    const data = await res.json();
    if (!data.ok) console.error('Slack post failed:', data.error);
  } catch (e) {
    console.error('Slack notify error:', e);
  }
}

function fmtAmount(yen) {
  if (yen >= 10000 && yen % 10000 === 0) return `${(yen / 10000).toLocaleString()}万円`;
  return `${(yen || 0).toLocaleString()}円`;
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'payjp-webhook' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const expected = process.env.PAYJP_WEBHOOK_SECRET;
  if (!expected) {
    console.error('PAYJP_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'webhook not configured' });
  }
  const provided = (req.query && req.query.secret) || '';
  if (provided !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const event = req.body || {};
  const eventType = event.type || '';
  // pay.jp event payload: event.data に直接objectが展開される（event.data.objectではない）
  const obj = (event.data && (event.data.object && typeof event.data.object === 'object' ? event.data.object : event.data)) || {};
  const objId = obj.id || '';
  const amount = obj.amount || 0;
  const metadata = obj.metadata || obj.meta_data || {};

  // token: metadata優先、なければreturn_urlから取得（pay.jp v2 payment_flow対応）
  let token = metadata.token || metadata.payment_token || '';
  if (!token && obj.return_url) {
    try {
      const u = new URL(obj.return_url);
      token = u.searchParams.get('token') || '';
    } catch (e) {}
  }

  console.log(`[payjp-webhook] type=${eventType} id=${objId} token=${token} amount=${amount}`);

  // payment_flow.created: 課金前にmetadata/description/customer_id を payment_flow に注入
  // succeeded後はupdate不可なのでcreated直後に確実にやる
  if (eventType === 'payment_flow.created') {
    if (!objId) return res.status(200).json({ ok: true, ignored: 'no id' });
    try {
      const secretKey0 = (process.env.PAYJP_SECRET_KEY || '').replace(/\\n$/, '').trim();
      const auth0 = 'Basic ' + Buffer.from(secretKey0 + ':').toString('base64');
      // event payload に return_url 無い場合に備え、改めて payment_flow 取得
      if (!token) {
        try {
          const pfRes = await fetch(`https://api.pay.jp/v2/payment_flows/${objId}`, { headers: { Authorization: auth0 } });
          if (pfRes.ok) {
            const pfObj = await pfRes.json();
            if (pfObj.return_url) {
              try {
                const u = new URL(pfObj.return_url);
                token = u.searchParams.get('token') || '';
              } catch (e) {}
            }
          }
        } catch (e) {
          console.error('[payjp-webhook] payment_flow fetch error:', e);
        }
      }
      if (!token) return res.status(200).json({ ok: true, ignored: 'no token even after fetch' });
      const sql = db();
      const linkRows = await sql`SELECT customer_name, customer_email, sales_person FROM payment_links WHERE token = ${token} LIMIT 1`;
      if (linkRows.length === 0) return res.status(200).json({ ok: true, ignored: 'token not found' });
      const link = linkRows[0];

      const secretKey = (process.env.PAYJP_SECRET_KEY || '').replace(/\\n$/, '').trim();
      const auth = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');

      // v1 customer 作成（ダッシュボード顧客一覧表示用）
      let customerId = '';
      if (link.customer_email) {
        try {
          const cRes = await fetch('https://api.pay.jp/v1/customers', {
            method: 'POST',
            headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              email: link.customer_email,
              description: `${link.customer_name || ''}様 / 営業: ${link.sales_person || ''}`,
              'metadata[name]': link.customer_name || '',
              'metadata[token]': token,
              'metadata[sales_person]': link.sales_person || '',
            }).toString(),
          });
          const cData = await cRes.json();
          if (cData && cData.id) customerId = cData.id;
          else console.warn('[payjp-webhook] v1 customer create returned no id:', cData);
        } catch (e) {
          console.error('[payjp-webhook] v1 customer create error:', e);
        }
      }

      // payment_flow update (metadata + description + customer_id)
      const updatePayload = {
        description: `${link.customer_name || ''}様 / 営業: ${link.sales_person || ''}`,
        metadata: {
          name: link.customer_name || '',
          email: link.customer_email || '',
          sales_person: link.sales_person || '',
          token,
        },
      };
      if (customerId) updatePayload.customer_id = customerId;

      const upRes = await fetch(`https://api.pay.jp/v2/payment_flows/${objId}`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });
      if (!upRes.ok) {
        const errBody = await upRes.text();
        console.error('[payjp-webhook] payment_flow update failed:', upRes.status, errBody);
      }
    } catch (e) {
      console.error('[payjp-webhook] payment_flow.created handler error:', e);
    }
    return res.status(200).json({ ok: true, status: 'metadata_set' });
  }

  // payment_flow.* イベント処理（pay.jp v2 checkout）
  if (eventType === 'payment_flow.succeeded') {
    if (!token) {
      console.warn('[payjp-webhook] payment_flow.succeeded: no token', { objId });
      return res.status(200).json({ ok: true, ignored: 'no token' });
    }
    const sql = db();
    const linkRows = await sql`SELECT token, customer_name, sales_person, amount, consultation_id, status, payjp_charge_id FROM payment_links WHERE token = ${token} LIMIT 1`;
    if (linkRows.length === 0) return res.status(200).json({ ok: true, ignored: 'token not found' });
    const link = linkRows[0];

    // 既にpaidかつ別のpayment_flow ID = 重複決済
    if (link.status === 'paid' && link.payjp_charge_id && link.payjp_charge_id !== objId) {
      await notifySlack(
        `🚨 重複決済を検知（v2）\n` +
        `お客様: ${link.customer_name}様\n` +
        `金額: ${fmtAmount(amount)}\n` +
        (link.sales_person ? `担当: ${link.sales_person}\n` : '') +
        `既存PaymentFlow: ${link.payjp_charge_id}\n` +
        `今回PaymentFlow: ${objId}\n` +
        `→ pay.jpダッシュで2回目を返金してください`
      );
      return res.status(200).json({ ok: true, status: 'duplicate_charge' });
    }

    // 同じpayment_flowの再配信は無視
    if (link.status === 'paid' && link.payjp_charge_id === objId) {
      return res.status(200).json({ ok: true, status: 'already_paid_same_flow' });
    }

    await sql`UPDATE payment_links SET status = 'paid', payjp_charge_id = ${objId}, paid_at = NOW() WHERE token = ${token}`;
    if (link.consultation_id) {
      await sql`UPDATE consultations SET payjp_status='paid', payjp_amount=${amount}, payjp_token=${token}, payjp_charge_id=${objId}, payjp_paid_at=NOW() WHERE id=${link.consultation_id}`;
    } else {
      const matches = await sql`SELECT id FROM consultations WHERE line_name = ${link.customer_name} OR line_name LIKE ${link.customer_name + '%'} ORDER BY apo_date DESC NULLS LAST LIMIT 1`;
      if (matches.length > 0) {
        await sql`UPDATE consultations SET payjp_status='paid', payjp_amount=${amount}, payjp_token=${token}, payjp_charge_id=${objId}, payjp_paid_at=NOW() WHERE id=${matches[0].id}`;
        await sql`UPDATE payment_links SET consultation_id=${matches[0].id} WHERE token=${token}`;
      }
    }
    await notifySlack(`✅ 決済完了（v2）\nお客様: ${link.customer_name}様\n金額: ${fmtAmount(amount)}\n${link.sales_person ? `担当: ${link.sales_person}\n` : ''}PaymentFlow: ${objId}`);
    return res.status(200).json({ ok: true, status: 'paid' });
  }

  if (eventType === 'payment_flow.payment_failed') {
    if (!token) return res.status(200).json({ ok: true, ignored: 'no token' });
    const sql = db();
    const linkRows = await sql`SELECT token, customer_name, sales_person, consultation_id, status, payjp_charge_id FROM payment_links WHERE token = ${token} LIMIT 1`;
    if (linkRows.length === 0) return res.status(200).json({ ok: true, ignored: 'token not found' });
    const link = linkRows[0];
    const reason = obj.last_payment_error?.message || '3DS認証失敗';

    // 既paidは絶対に上書きしない（過去の事故防止）
    if (link.status === 'paid') {
      console.warn('[payjp-webhook] payment_failed received for already-paid link, skipping DB update', { token, objId, reason });
      await notifySlack(
        `ℹ️ 既paidリンクで失敗イベント受信（DB更新なし）\n` +
        `お客様: ${link.customer_name}様\n` +
        `今回PaymentFlow: ${objId}\n` +
        `理由: ${reason}\n` +
        `→ 通常はお客様が念のため再決済を試した結果。要対応はなし`
      );
      return res.status(200).json({ ok: true, status: 'already_paid_skip_failure' });
    }

    await sql`UPDATE payment_links SET status='failed', payjp_charge_id=${objId}, failure_reason=${reason}, failed_at=NOW() WHERE token=${token}`;
    if (link.consultation_id) {
      await sql`UPDATE consultations SET payjp_status='failed', payjp_token=${token}, payjp_charge_id=${objId} WHERE id=${link.consultation_id}`;
    }
    await notifySlack(`⚠️ 決済失敗（v2）\nお客様: ${link.customer_name}様\n金額: ${fmtAmount(amount)}\n${link.sales_person ? `担当: ${link.sales_person}\n` : ''}理由: ${reason}\n→ 再決済リンク発行＋3DS認証完了を案内`);
    return res.status(200).json({ ok: true, status: 'failed' });
  }

  console.log(`[payjp-webhook] unhandled event type: ${eventType}`);
  return res.status(200).json({ ok: true, ignored: eventType });
};
