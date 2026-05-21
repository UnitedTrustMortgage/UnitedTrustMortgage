// /api/public/quotes/* — borrower-facing endpoints.
// No auth — protected only by the unguessable public_token in the URL.
//
// Routes:
//   GET  /api/public/quotes/:token            → fetch the quote + revision
//                                                (mirrors cadence-crm shape)
//   POST /api/public/quotes/:token/select     → record borrower's choice +
//                                                trigger notification fan-out
//                                                via cadence-crm webhook
//
// When the borrower selects an option, we POST to cadence-crm's
// /api/internal/notify-quote-selected which handles email (Outlook),
// SMS (Twilio), and any other side effects. That keeps Outlook OAuth +
// Twilio creds in one place rather than re-implementing both here.

import { getSupabase, json, err, parseBody, ipFrom, userAgentFrom } from "./_lib.mjs";

export const handler = async (event) => {
  const rawPath = event.path || "";
  const sub = rawPath
    .replace(/^\/\.netlify\/functions\/public-quotes/, "")
    .replace(/^\/api\/public\/quotes/, "")
    .replace(/\/+$/, "");

  const method = event.httpMethod;

  // /:token
  const m = sub.match(/^\/([^/]+)(\/.*)?$/);
  if (!m) return err(404, "not found");
  const token = m[1];
  const rest = m[2] || "";

  try {
    if (rest === "" && method === "GET") return getByToken(token);
    if (rest === "/select" && method === "POST") return selectOption(token, event);
    return err(404, "not found");
  } catch (e) {
    console.error("[public-quotes]", e);
    return err(500, e?.message ?? "internal error");
  }
};

// ─── Handlers ─────────────────────────────────────────────────────────────

async function getByToken(token) {
  const supabase = getSupabase();
  const { data: quote, error } = await supabase
    .from("loan_quotes")
    .select("*")
    .eq("public_token", token)
    .maybeSingle();
  if (error) return err(500, error.message);
  if (!quote) return err(404, "not found");

  let revision = null;
  if (quote.current_revision_id) {
    const { data: r, error: rErr } = await supabase
      .from("loan_quote_revisions")
      .select("*")
      .eq("id", quote.current_revision_id)
      .maybeSingle();
    if (rErr) return err(500, rErr.message);
    revision = r;
  }

  // Fire-and-forget view tracking.
  supabase
    .from("loan_quotes")
    .update({
      first_viewed_at: quote.first_viewed_at ?? new Date().toISOString(),
      last_viewed_at: new Date().toISOString(),
    })
    .eq("id", quote.id)
    .then(() => {});

  // Mirror the cadence-crm /api/public/quotes/:token response shape so the
  // borrower JS can be drop-in compatible if it ever runs against either
  // backend.
  return json(200, {
    quote: {
      id: quote.id,
      title: quote.title,
      note: quote.note,
      borrowerName: quote.borrower_name,
      status: quote.status,
      createdAt: quote.created_at,
    },
    revision: revision
      ? {
          id: revision.id,
          revisionNumber: revision.revision_number,
          borrower: revision.borrower_json,
          loan: revision.loan_json,
          property: revision.property_json,
          options: revision.options_json,
          createdAt: revision.created_at,
        }
      : null,
  });
}

async function selectOption(token, event) {
  const body = parseBody(event);
  if (body === null) return err(400, "invalid JSON body");
  const optionIndex = Number(body.optionIndex);
  if (!Number.isInteger(optionIndex) || optionIndex < 0) {
    return err(400, "optionIndex must be a non-negative integer");
  }

  const supabase = getSupabase();
  const { data: quote } = await supabase
    .from("loan_quotes")
    .select("id, lead_id, borrower_name, title, current_revision_id, source")
    .eq("public_token", token)
    .maybeSingle();
  if (!quote) return err(404, "not found");
  if (!quote.current_revision_id) return err(400, "quote has no options yet");

  const { data: revision } = await supabase
    .from("loan_quote_revisions")
    .select("id, options_json")
    .eq("id", quote.current_revision_id)
    .maybeSingle();
  if (!revision) return err(404, "revision missing");

  const options = revision.options_json ?? [];
  if (optionIndex >= options.length) return err(400, "invalid optionIndex");
  const snapshot = options[optionIndex];

  // Record the selection in Supabase.
  const { error: insErr } = await supabase.from("loan_quote_selections").insert({
    quote_id: quote.id,
    revision_id: revision.id,
    option_index: optionIndex,
    option_snapshot: snapshot,
    client_ip: ipFrom(event),
    client_user_agent: userAgentFrom(event),
  });
  if (insErr) return err(500, insErr.message);

  // Flip the quote to selected (idempotent — only if not already there).
  await supabase
    .from("loan_quotes")
    .update({ status: "selected" })
    .eq("id", quote.id);

  // Notify the operator via cadence-crm's internal webhook (which already
  // has Outlook + Twilio wired up). Fire-and-forget so we don't block the
  // borrower's UI on email delivery.
  notifyCrmWebhook({
    quoteId: quote.id,
    leadId: quote.lead_id,
    borrowerName: quote.borrower_name,
    title: quote.title,
    optionIndex,
    option: snapshot,
    source: quote.source ?? "utm",
  }).catch((e) => console.error("[public-quotes:notify]", e));

  return json(200, {
    ok: true,
    message:
      "Thanks — your loan officer has been notified and will be in touch shortly with next steps.",
  });
}

async function notifyCrmWebhook(payload) {
  const url = process.env.CRM_WEBHOOK_URL;
  const key = process.env.CRM_WEBHOOK_KEY;
  if (!url || !key) {
    console.warn("[public-quotes:notify] CRM_WEBHOOK_URL/CRM_WEBHOOK_KEY not set — skipping");
    return;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": key,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(`[public-quotes:notify] CRM webhook ${res.status}: ${text.slice(0, 200)}`);
  }
}
