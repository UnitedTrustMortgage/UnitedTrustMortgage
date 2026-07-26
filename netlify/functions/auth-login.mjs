// POST /api/auth/login
//
// Body: { email: string, password: string }
// Looks up the active operator by email, verifies the bcrypt-hashed
// password, and issues a 30-day session token. Returns the token +
// operator profile.
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
  const email = (body.email || "").trim();
  const password = (body.password || body.passCode || "").trim();
  if (!email || !email.includes("@")) return err(400, "email required");
  if (!password || password.length < 4) return err(400, "password required");

  const supabase = getSupabase();

  // The RPC returns 0 or 1 rows; the bcrypt compare happens in Postgres
  // against the single row matching the email.
  const { data: rows, error } = await supabase
    .rpc("verify_operator_login", { p_email: email, p_code: password });

  if (error) {
    if (error.code === "PGRST202" || /function .*verify_operator_login/i.test(error.message)) {
      return err(
        500,
        "auth helper missing: run the verify_operator_login SQL migration",
      );
    }
    return err(500, `auth lookup failed: ${error.message}`);
  }
  // RPC returns an array of rows (the function returns SETOF).
  const operator = Array.isArray(rows) ? rows[0] : rows;
  if (!operator || !operator.id) return err(401, "invalid email or password");

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
