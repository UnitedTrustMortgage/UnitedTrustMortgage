// /api/quotes/* — operator-only quote CRUD against Supabase.
//
// All routes require a valid operator session (via requireOperator).
// Path parsing is manual since this is a single Netlify Function handling
// several sub-paths (list, create, get, update, send).
//
// Routes:
//   GET  /api/quotes               → list mine (default last 50)
//   POST /api/quotes               → create new
//   GET  /api/quotes/:id           → get full quote + latest revision
//   POST /api/quotes/:id/revisions → append a new revision
//   POST /api/quotes/:id/send      → mark as sent (audit trail)
//
// The Supabase schema is shared with cadence-crm — see migration
// utm_quote_operators_and_sessions.

import {
  getSupabase,
  requireOperator,
  json,
  err,
  parseBody,
  randomToken,
  authErrorResponse,
} from "./_lib.mjs";

export const handler = async (event) => {
  let auth;
  try {
    auth = await requireOperator(event);
  } catch (e) {
    return authErrorResponse(e);
  }
  const { operator } = auth;

  // Strip the function-mount prefix to get the sub-path we care about.
  // event.path on Netlify is like "/.netlify/functions/quotes/abc/revisions"
  // when routed via the /api/quotes/* rewrite. We want "/abc/revisions".
  const rawPath = event.path || "";
  const sub = rawPath
    .replace(/^\/\.netlify\/functions\/quotes/, "")
    .replace(/^\/api\/quotes/, "")
    .replace(/\/+$/, "");
  const method = event.httpMethod;

  try {
    // ── List + create ─────────────────────────────────────────────────
    if (sub === "" || sub === "/") {
      if (method === "GET") return listQuotes(operator);
      if (method === "POST") return createQuote(operator, event);
      return err(405, "method not allowed");
    }

    // ── /:id (and /:id/...) ───────────────────────────────────────────
    const m = sub.match(/^\/([^/]+)(\/.*)?$/);
    if (!m) return err(404, "not found");
    const id = m[1];
    const rest = m[2] || "";

    if (rest === "") {
      if (method === "GET") return getQuote(id);
      return err(405, "method not allowed");
    }
    if (rest === "/revisions" && method === "POST") {
      return appendRevision(id, event);
    }
    if (rest === "/send" && method === "POST") {
      return markSent(id, event);
    }

    return err(404, "not found");
  } catch (e) {
    console.error("[quotes]", e);
    return err(500, e?.message ?? "internal error");
  }
};

// ─── Handlers ─────────────────────────────────────────────────────────────

async function listQuotes(operator) {
  const supabase = getSupabase();
  // Admins see everything UTM-built; non-admins see only their own.
  // Borrower contact + wholesale lender are columns on loan_quotes; transaction
  // type / loan amount / state live in the current revision JSON (merged below).
  let q = supabase
    .from("loan_quotes")
    .select(
      "id, public_token, borrower_name, borrower_email, borrower_phone, wholesale_lender, title, status, source, operator_id, current_revision_id, created_at, updated_at, last_viewed_at",
    )
    .eq("source", "utm")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (!operator.is_admin) {
    q = q.eq("operator_id", operator.id);
  }
  const { data, error } = await q;
  if (error) return err(500, error.message);
  const quotes = data ?? [];

  // One extra query pulls every current revision so the dashboard can show
  // transaction type / loan amount / state without an N+1 fan-out.
  const revIds = [...new Set(quotes.map((x) => x.current_revision_id).filter(Boolean))];
  let revById = new Map();
  if (revIds.length) {
    const { data: revs, error: rErr } = await supabase
      .from("loan_quote_revisions")
      .select("id, loan_json, property_json")
      .in("id", revIds);
    if (rErr) return err(500, rErr.message);
    revById = new Map((revs ?? []).map((r) => [r.id, r]));
  }

  const enriched = quotes.map((x) => {
    const rev = revById.get(x.current_revision_id) || {};
    const loan = rev.loan_json || {};
    const property = rev.property_json || {};
    return {
      ...x,
      transaction_type: transactionLabel(loan.loanPurpose ?? loan.purpose),
      loan_amount: property.loanBalance != null ? Number(property.loanBalance) : null,
      property_state: property.state || null,
    };
  });

  return json(200, { quotes: enriched });
}

// Normalize the editor's loanPurpose value (or its label) to a borrower-facing
// transaction type for the dashboard.
function transactionLabel(raw) {
  if (!raw) return null;
  const v = String(raw).toLowerCase();
  if (v.includes("cash")) return "Cash-out";
  if (v.includes("purchase")) return "Purchase";
  if (v.includes("rate") || v.includes("term") || v.includes("refi")) return "Refinance";
  return String(raw);
}

async function createQuote(operator, event) {
  const body = parseBody(event);
  if (body === null) return err(400, "invalid JSON body");

  const borrowerName = String(body.borrowerName || "").trim();
  if (!borrowerName) return err(400, "borrowerName is required");

  const supabase = getSupabase();
  const token = randomToken();

  const { data: quote, error } = await supabase
    .from("loan_quotes")
    .insert({
      lead_id: null,
      public_token: token,
      borrower_name: borrowerName,
      borrower_email: body.borrowerEmail ?? null,
      borrower_phone: body.borrowerPhone ?? null,
      title: body.title ?? "",
      note: body.note ?? null,
      // LO-only fields — columns (never returned by the borrower endpoint).
      wholesale_lender: body.wholesaleLender ?? null,
      price_to_me: body.priceToMe ?? null,
      internal_notes: body.internalNotes ?? null,
      created_by: operator.name,
      operator_id: operator.id,
      source: "utm",
      status: "draft",
    })
    .select("*")
    .single();
  if (error || !quote) return err(500, error?.message ?? "create failed");

  const initial = body.initialRevision ?? {};
  const revision = await insertRevision(quote.id, 1, initial);
  if (!revision) return err(500, "failed to create initial revision");

  const { data: updated, error: uErr } = await supabase
    .from("loan_quotes")
    .update({ current_revision_id: revision.id })
    .eq("id", quote.id)
    .select("*")
    .single();
  if (uErr) return err(500, uErr.message);

  return json(200, { quote: updated, revision });
}

async function getQuote(id) {
  const supabase = getSupabase();
  const { data: quote, error } = await supabase
    .from("loan_quotes")
    .select("*")
    .eq("id", id)
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

  return json(200, { quote, revision });
}

async function appendRevision(quoteId, event) {
  const body = parseBody(event);
  if (body === null) return err(400, "invalid JSON body");

  const supabase = getSupabase();
  const { data: latest } = await supabase
    .from("loan_quote_revisions")
    .select("revision_number")
    .eq("quote_id", quoteId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const next = (latest?.revision_number ?? 0) + 1;

  const revision = await insertRevision(quoteId, next, body);
  if (!revision) return err(500, "failed to append revision");

  // Bump current_revision_id on the parent quote so reads return the
  // freshest data.
  const patch = { current_revision_id: revision.id };
  // Optionally update borrower fields if they were changed in the form.
  if (body.borrower) {
    if (body.borrower.borrowerName) patch.borrower_name = body.borrower.borrowerName;
    if (body.borrower.email !== undefined) patch.borrower_email = body.borrower.email || null;
    if (body.borrower.phone !== undefined) patch.borrower_phone = body.borrower.phone || null;
  }
  if (body.title !== undefined) patch.title = body.title;
  if (body.note !== undefined) patch.note = body.note;
  // LO-only fields (columns, never exposed to the borrower).
  if (body.wholesaleLender !== undefined) patch.wholesale_lender = body.wholesaleLender || null;
  if (body.priceToMe !== undefined) patch.price_to_me = body.priceToMe || null;
  if (body.internalNotes !== undefined) patch.internal_notes = body.internalNotes || null;

  const { data: updated, error } = await supabase
    .from("loan_quotes")
    .update(patch)
    .eq("id", quoteId)
    .select("*")
    .single();
  if (error) return err(500, error.message);

  return json(200, { quote: updated, revision });
}

async function markSent(quoteId, event) {
  const body = parseBody(event);
  if (body === null) return err(400, "invalid JSON body");
  const channel = String(body.channel || "link").toLowerCase();
  const toAddress = String(body.to || "").trim() || "(direct link)";

  const supabase = getSupabase();
  const { error: sErr } = await supabase.from("loan_quote_sends").insert({
    quote_id: quoteId,
    channel,
    to_address: toAddress,
    status: "sent",
  });
  if (sErr) return err(500, sErr.message);

  await supabase
    .from("loan_quotes")
    .update({ status: "sent" })
    .eq("id", quoteId)
    .eq("status", "draft"); // only flip draft → sent, leave selected as-is

  return json(200, { ok: true });
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function insertRevision(quoteId, number, payload) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("loan_quote_revisions")
    .insert({
      quote_id: quoteId,
      revision_number: number,
      borrower_json: payload.borrower ?? {},
      loan_json: payload.loan ?? {},
      property_json: payload.property ?? {},
      options_json: payload.options ?? [],
    })
    .select("*")
    .single();
  if (error) {
    console.error("[quotes:insertRevision]", error);
    return null;
  }
  return data;
}
