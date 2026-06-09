// POST /api/auth/login
//
// Body: { passCode: string }
// Looks up the (active) operator whose bcrypt-hashed pass code matches and
// issues a 30-day session token. Returns the token + operator profile.
//
// We do the bcrypt verify inside Postgres (pgcrypto's `crypt`) so the
// Function doesn't need a bcrypt JS dependency, and the comparison runs
// on the same side as the stored hash.

import {
  getSupabase,
  json,
  err,
  parseBody,
  newSessionToken,
  ipFrom,
  userAgentFrom,
} from "./_lib.mjs";

const SESSION_DAYS = 30;

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return err(405, "method not allowed");

  const body = parseBody(event);
  if (body === null) return err(400, "invalid JSON body");
  const passCode = (body.passCode || "").trim();
  if (!passCode || passCode.length < 4) return err(400, "pass code required");

  const supabase = getSupabase();

  // Find the active operator whose hashed pass code matches. We use a
  // single SQL RPC-style query via .rpc so the bcrypt compare happens in
  // Postgres. If no `verify_operator_passcode` function exists yet, fall
  // back to a SELECT that uses crypt() inline.
  //
  // The RPC returns 0 or 1 row. We use .maybeSingle() so a no-match (invalid
  // pass code) gives us `data: null` instead of an error.
  const { data: rows, error } = await supabase
    .rpc("verify_operator_passcode", { p_code: passCode });

  if (error) {
    if (error.code === "PGRST202" || /function .*verify_operator_passcode/i.test(error.message)) {
      return err(
        500,
        "auth helper missing: run the verify_operator_passcode SQL migration",
      );
    }
    return err(500, `auth lookup failed: ${error.message}`);
  }
  // RPC returns an array of rows (the function returns SETOF).
  const operator = Array.isArray(rows) ? rows[0] : rows;
  if (!operator || !operator.id) return err(401, "invalid pass code");

  // Mint a session.
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const { error: sErr } = await supabase.from("quote_sessions").insert({
    token,
    operator_id: operator.id,
    ip: ipFrom(event),
    user_agent: userAgentFrom(event),
    expires_at: expiresAt.toISOString(),
  });
  if (sErr) return err(500, `session create failed: ${sErr.message}`);

  // Record the login on the operator row.
  supabase
    .from("quote_operators")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", operator.id)
    .then(() => {});

  return json(200, {
    token,
    expiresAt: expiresAt.toISOString(),
    operator: {
      id: operator.id,
      name: operator.name,
      isAdmin: operator.is_admin,
    },
  }, {
    // Also set a cookie so the operator stays signed in without JS having
    // to manage the token across pages. SameSite=Lax is fine — the API and
    // the operator UI live on the same Netlify deploy.
    "Set-Cookie": `utm_quote_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  });
};
