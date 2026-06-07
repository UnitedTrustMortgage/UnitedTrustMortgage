const https = require('https');

/**
 * United Trust Mortgage — lead notifier + CRM push.
 *
 * Called by the hero "See If You Qualify" form (in addition to Formspree,
 * which delivers the email notification + keeps the submission archive).
 * On each lead this function, best-effort and independently:
 *   1. Texts the owner via Twilio          (TWILIO_* + LEAD_SMS_TO env)
 *   2. Pushes the lead to the Benji CRM     (BENJI_API_KEY env)
 *
 * All secrets come from Netlify environment variables — nothing is committed.
 * A missing key or a provider hiccup is logged and skipped; it never blocks
 * the other destination or the user's form submission.
 *
 * Required Netlify env vars:
 *   TWILIO_ACCOUNT_SID   Twilio Account SID (starts "AC…")
 *   TWILIO_AUTH_TOKEN    Twilio auth token
 *   TWILIO_FROM          SMS-enabled Twilio number, E.164 (e.g. +18444403228)
 *   LEAD_SMS_TO          where to text new leads, E.164 (e.g. +18184477035)
 *   BENJI_API_KEY        Benji CRM API key (Bearer token)
 * Optional:
 *   BENJI_WEBHOOK_URL    override (default https://www.benji.biz/api/webhooks/leads)
 */

const LOAN_TYPE_LABELS = {
  dscr: 'DSCR',
  pnl: 'P&L',
  bank_statement: 'Bank Statement',
  conventional: 'Conventional',
  asset_related: 'Asset Related',
  not_sure: 'Not Sure',
};

const TRANSACTION_TYPE_LABELS = {
  purchase: 'Purchase',
  refinance: 'Refinance',
  cash_out_refinance: 'Cash-Out Refinance',
};

const LOAN_AMOUNT_MAP = {
  '$100K – $300K': 200000,
  '$300K – $750K': 525000,
  '$750K – $2M': 1375000,
  '$2M – $5M': 3500000,
  '$5M – $15M': 10000000,
};

const FICO_MAP = {
  '620–659': 640,
  '660–699': 680,
  '700–739': 720,
  '740–779': 760,
  '780+': 790,
};

const STATE_TO_CODE = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV',
  Wisconsin: 'WI', Wyoming: 'WY',
};

function postForm(hostname, path, formBody, authHeader) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(formBody).toString();
    const req = https.request(
      {
        hostname,
        path,
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => resolve({ status: res.statusCode, body: chunks }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function postJson(url, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...(extraHeaders || {}),
        },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => resolve({ status: res.statusCode, body: chunks }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let form;
  try {
    form = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid json' }) };
  }

  // Honeypot — bots fill hidden fields. Pretend success, do nothing.
  if (form._gotcha) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: 'spam' }) };

  const first = (form.first_name || '').trim();
  const last = (form.last_name || '').trim();
  const email = (form.email || '').trim();
  const phone = (form.phone || '').trim();

  // Require at least an email or phone so junk POSTs don't fire notifications.
  if (!email && !phone) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing contact' }) };
  }

  const loanTypeLabel = LOAN_TYPE_LABELS[form.loan_type] || form.loan_type || '';
  const transactionLabel = TRANSACTION_TYPE_LABELS[form.transaction_type] || form.transaction_type || '';
  const propertyType = form.property_type || '';

  // ── 1. Text the owner via Twilio ───────────────────────────────────────
  const tasks = [];
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_FROM = process.env.TWILIO_FROM;
  const LEAD_SMS_TO = process.env.LEAD_SMS_TO;

  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM && LEAD_SMS_TO) {
    const smsBody =
      `🏠 NEW LEAD — United Trust Mortgage\n` +
      `👤 ${first} ${last}`.trim() + `\n` +
      `📞 ${phone}\n` +
      `📧 ${email}\n` +
      `🏡 ${propertyType}${form.state ? ' · ' + form.state : ''}\n` +
      `💼 ${loanTypeLabel}${transactionLabel ? ' · ' + transactionLabel : ''}\n` +
      `💰 ${form.loan_amount || '—'}\n` +
      `💳 ${form.credit_score || '—'}`;
    const auth = 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    tasks.push(
      postForm(
        'api.twilio.com',
        `/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
        { To: LEAD_SMS_TO, From: TWILIO_FROM, Body: smsBody },
        auth
      )
        .then((r) => {
          const ok = r.status >= 200 && r.status < 300;
          if (!ok) console.log('[submit-lead] twilio non-2xx', r.status, r.body);
          return { name: 'sms', ok, status: r.status };
        })
        .catch((err) => {
          console.log('[submit-lead] twilio error', err.message);
          return { name: 'sms', ok: false, error: err.message };
        })
    );
  } else {
    console.log('[submit-lead] SMS skipped — Twilio env vars not fully configured');
    tasks.push(Promise.resolve({ name: 'sms', ok: false, skipped: 'no-config' }));
  }

  // ── 2. Push the lead to Benji CRM ──────────────────────────────────────
  const BENJI_API_KEY = process.env.BENJI_API_KEY;
  const BENJI_WEBHOOK_URL = process.env.BENJI_WEBHOOK_URL || 'https://www.benji.biz/api/webhooks/leads';

  if (BENJI_API_KEY) {
    const crmPayload = {
      firstName: first,
      lastName: last,
      email,
      phone,
      loanType: loanTypeLabel,
      loanPurpose: transactionLabel,
      state: STATE_TO_CODE[form.state] || form.state || '',
      loanAmount: LOAN_AMOUNT_MAP[form.loan_amount] ?? null,
      fico: FICO_MAP[form.credit_score] ?? null,
      notes:
        `Loan Type: ${loanTypeLabel} · Transaction: ${transactionLabel} · ` +
        `Property: ${propertyType} · Range: ${form.loan_amount || ''} · Credit: ${form.credit_score || ''}`,
      source: 'myunitedtrust.com',
    };
    tasks.push(
      postJson(BENJI_WEBHOOK_URL, crmPayload, { Authorization: `Bearer ${BENJI_API_KEY}` })
        .then((r) => {
          const ok = r.status >= 200 && r.status < 300;
          if (!ok) console.log('[submit-lead] benji non-2xx', r.status, r.body);
          return { name: 'benji', ok, status: r.status };
        })
        .catch((err) => {
          console.log('[submit-lead] benji error', err.message);
          return { name: 'benji', ok: false, error: err.message };
        })
    );
  } else {
    console.log('[submit-lead] Benji skipped — BENJI_API_KEY not configured');
    tasks.push(Promise.resolve({ name: 'benji', ok: false, skipped: 'no-config' }));
  }

  const results = await Promise.all(tasks);
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, results }) };
};
