// Shared helpers for all UTM-site Netlify Functions.
//
// Contents:
//   - Supabase client (service role, server-only)
//   - Session token helpers (validate, identify operator, refresh last_active)
//   - Response helpers (JSON + CORS)
//
// Env vars expected on Netlify:
//   SUPABASE_URL                — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY   — server-only key, bypasses RLS
//   CRM_WEBHOOK_URL             — e.g. https://crm.myunitedtrust.com/api/internal/notify-quote-selected
//   CRM_WEBHOOK_KEY             — must match cadence-crm's UTM_WEBHOOK_KEY env var

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

let _supabase = null;
export function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  _supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _supabase;
}

// ─── Response helpers ────────────────────────────────────────────────────

export function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

export function err(statusCode, message) {
  return json(statusCode, { error: message });
}

// Parse the body whether it arrives as a JSON string (the usual case) or
// as an already-parsed object (some test runners do this). Returns {} for
// an empty body.
export function parseBody(event) {
  if (!event.body) return {};
  if (typeof event.body === "object") return event.body;
  try {
    return JSON.parse(event.body);
  } catch {
    return null; // signal a parse failure to the caller
  }
}

// ─── Session / operator auth ─────────────────────────────────────────────

export function newSessionToken() {
  // 32 random bytes → 43-char URL-safe string. Plenty of entropy.
  return crypto.randomBytes(32).toString("base64url");
}

// Pull the operator session out of the request. Looks at the Authorization
// header ("Bearer <token>") first; falls back to a cookie called
// "utm_quote_session" so the operator can stay logged in across reloads.
//
// Returns { operator, session } on success, throws otherwise. The thrown
// error has a `status` property so handlers can convert it to a clean
// 401/403 response.
export async function requireOperator(event) {
  const token = extractToken(event);
  if (!token) {
    const e = new Error("missing session");
    e.status = 401;
    throw e;
  }
  const supabase = getSupabase();
  const { data: session, error } = await supabase
    .from("quote_sessions")
    .select("token, operator_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    const e = new Error(`session lookup failed: ${error.message}`);
    e.status = 500;
    throw e;
  }
  if (!session) {
    const e = new Error("invalid session");
    e.status = 401;
    throw e;
  }
  if (new Date(session.expires_at) < new Date()) {
    const e = new Error("session expired");
    e.status = 401;
    throw e;
  }
  const { data: operator, error: oErr } = await supabase
    .from("quote_operators")
    .select("id, name, email, active, is_admin")
    .eq("id", session.operator_id)
    .maybeSingle();
  if (oErr || !operator) {
    const e = new Error("operator not found");
    e.status = 401;
    throw e;
  }
  if (!operator.active) {
    const e = new Error("operator deactivated");
    e.status = 403;
    throw e;
  }

  // Refresh last_active_at (fire-and-forget — don't await; we don't want
  // to slow down every API call for a metadata update).
  supabase
    .from("quote_sessions")
    .update({ last_active_at: new Date().toISOString() })
    .eq("token", token)
    .then(() => {});

  return { operator, session };
}

function extractToken(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (auth && /^bearer\s+/i.test(auth)) {
    return auth.replace(/^bearer\s+/i, "").trim();
  }
  // Cookie fallback — Netlify lowercases header names but check both for safety.
  const cookie = event.headers?.cookie || event.headers?.Cookie;
  if (cookie) {
    const m = cookie.match(/(?:^|;\s*)utm_quote_session=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

// Convert a thrown error from requireOperator into a response.
export function authErrorResponse(e) {
  return err(e.status ?? 500, e.message ?? "auth error");
}

// ─── Misc helpers ────────────────────────────────────────────────────────

export function randomToken(bytes = 12) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function ipFrom(event) {
  const fwd = event.headers?.["x-forwarded-for"] || event.headers?.["X-Forwarded-For"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return event.headers?.["client-ip"] || null;
}

export function userAgentFrom(event) {
  return event.headers?.["user-agent"] || event.headers?.["User-Agent"] || null;
}
