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
  const obj = (event.data && event.data.object) || {};
  const objId = obj.id || '';
  const amount = obj.amount || 0;
  const metadata = obj.metadata || {};

  // token: metadata優先、なければreturn_urlから取得（pay.jp v2 payment_flow対応）
  let token = metadata.token || metadata.payment_token || '';
  if (!token && obj.return_url) {
    try {
      const u = new URL(obj.return_url);
      token = u.searchParams.get('token') || '';
    } catch (e) {}
  }

  console.log(`[payjp-webhook] type=${eventType} id=${objId} token=${token} amount=${amount}`);

  // payment_flow.* イベント処理（pay.jp v2 checkout）
  if (eventType === 'payment_flow.succeeded') {
    if (!token) {
      console.warn('[payjp-webhook] payment_flow.succeeded: no token', { objId });
      return res.status(200).json({ ok: true, ignored: 'no token' });
    }
    const sql = db();
    const linkRows = await sql`SELECT token, customer_name, sales_person, amount, consultation_id, status FROM payment_links WHERE token = ${token} LIMIT 1`;
    if (linkRows.length === 0) return res.status(200).json({ ok: true, ignored: 'token not found' });
    const link = linkRows[0];
    if (link.status !== 'paid') {
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
    }
    return res.status(200).json({ ok: true, status: 'paid' });
  }

  if (eventType === 'payment_flow.payment_failed') {
    if (!token) return res.status(200).json({ ok: true, ignored: 'no token' });
    const sql = db();
    const linkRows = await sql`SELECT token, customer_name, sales_person, consultation_id, status FROM payment_links WHERE token = ${token} LIMIT 1`;
    if (linkRows.length === 0) return res.status(200).json({ ok: true, ignored: 'token not found' });
    const link = linkRows[0];
    const reason = obj.last_payment_error?.message || '3DS認証失敗';
    await sql`UPDATE payment_links SET status='failed', payjp_charge_id=${objId}, failure_reason=${reason}, failed_at=NOW() WHERE token=${token}`;
    if (link.consultation_id) {
      await sql`UPDATE consultations SET payjp_status='failed', payjp_token=${token}, payjp_charge_id=${objId} WHERE id=${link.consultation_id}`;
    }
    await notifySlack(`⚠️ 決済失敗（v2）\nお客様: ${link.customer_name}様\n金額: ${fmtAmount(amount)}\n${link.sales_person ? `担当: ${link.sales_person}\n` : ''}理由: ${reason}\n→ 再決済リンク発行＋3DS認証完了を案内`);
    return res.status(200).json({ ok: true, status: 'failed' });
  }

  if (!token) {
    console.warn('[payjp-webhook] no token in metadata, skip', { eventType, objId });
    return res.status(200).json({ ok: true, ignored: 'no token' });
  }

  const sql = db();

  const linkRows = await sql`
    SELECT token, customer_name, customer_email, sales_person, amount, consultation_id, status
    FROM payment_links
    WHERE token = ${token}
    LIMIT 1
  `;

  if (linkRows.length === 0) {
    console.warn('[payjp-webhook] token not found', token);
    return res.status(200).json({ ok: true, ignored: 'token not found' });
  }
  const link = linkRows[0];

  if (eventType === 'charge.succeeded' || (eventType === 'charge.updated' && obj.paid && obj.captured)) {
    if (link.status === 'paid') {
      console.log('[payjp-webhook] already paid, skip notify');
      return res.status(200).json({ ok: true, ignored: 'already paid' });
    }

    await sql`
      UPDATE payment_links
      SET status = 'paid', payjp_charge_id = ${chargeId}, paid_at = NOW()
      WHERE token = ${token}
    `;

    if (link.consultation_id) {
      await sql`
        UPDATE consultations
        SET payjp_status = 'paid',
            payjp_amount = ${amount},
            payjp_token = ${token},
            payjp_charge_id = ${chargeId},
            payjp_paid_at = NOW()
        WHERE id = ${link.consultation_id}
      `;
    } else {
      const matches = await sql`
        SELECT id FROM consultations
        WHERE line_name = ${link.customer_name}
           OR line_name LIKE ${link.customer_name + '%'}
           OR line_name LIKE ${'%' + link.customer_name + '%'}
        ORDER BY apo_date DESC NULLS LAST
        LIMIT 1
      `;
      if (matches.length > 0) {
        await sql`
          UPDATE consultations
          SET payjp_status = 'paid',
              payjp_amount = ${amount},
              payjp_token = ${token},
              payjp_charge_id = ${chargeId},
              payjp_paid_at = NOW()
          WHERE id = ${matches[0].id}
        `;
        await sql`UPDATE payment_links SET consultation_id = ${matches[0].id} WHERE token = ${token}`;
      }
    }

    await notifySlack(
      `✅ 決済完了\n` +
        `お客様: ${link.customer_name}様\n` +
        `金額: ${fmtAmount(amount)}\n` +
        (link.sales_person ? `担当: ${link.sales_person}\n` : '') +
        `Charge ID: ${chargeId}`
    );
    return res.status(200).json({ ok: true, status: 'paid' });
  }

  if (eventType === 'charge.failed') {
    const reason = obj.failure_message || obj.failure_code || '不明';
    await sql`
      UPDATE payment_links
      SET status = 'failed', payjp_charge_id = ${chargeId}, failure_reason = ${reason}, failed_at = NOW()
      WHERE token = ${token}
    `;
    if (link.consultation_id) {
      await sql`
        UPDATE consultations
        SET payjp_status = 'failed',
            payjp_amount = ${amount},
            payjp_token = ${token},
            payjp_charge_id = ${chargeId}
        WHERE id = ${link.consultation_id}
      `;
    }
    await notifySlack(
      `⚠️ 決済失敗\n` +
        `お客様: ${link.customer_name}様\n` +
        `金額: ${fmtAmount(amount)}\n` +
        (link.sales_person ? `担当: ${link.sales_person}\n` : '') +
        `理由: ${reason}\n` +
        `→ ${link.sales_person || '営業担当'}は再決済リンク発行＋顧客に3DS認証完了をご案内ください`
    );
    return res.status(200).json({ ok: true, status: 'failed' });
  }

  if (eventType === 'charge.refunded') {
    await sql`UPDATE payment_links SET status = 'refunded' WHERE token = ${token}`;
    if (link.consultation_id) {
      await sql`UPDATE consultations SET payjp_status = 'refunded' WHERE id = ${link.consultation_id}`;
    }
    await notifySlack(`↩️ 返金処理: ${link.customer_name}様 ${fmtAmount(amount)} (${chargeId})`);
    return res.status(200).json({ ok: true, status: 'refunded' });
  }

  console.log(`[payjp-webhook] unhandled event type: ${eventType}`);
  return res.status(200).json({ ok: true, ignored: eventType });
};
