// POST /api/auth/logout
//
// Deletes the current session token from quote_sessions and clears the
// session cookie. Idempotent — silent success if the token doesn't exist.

import { getSupabase, json } from "./_lib.mjs";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method not allowed" };

  const token = extractToken(event);
  if (token) {
    const supabase = getSupabase();
    await supabase.from("quote_sessions").delete().eq("token", token);
  }

  return json(200, { ok: true }, {
    "Set-Cookie": "utm_quote_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
  });
};

function extractToken(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (auth && /^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();
  const cookie = event.headers?.cookie || event.headers?.Cookie;
  if (cookie) {
    const m = cookie.match(/(?:^|;\s*)utm_quote_session=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}
