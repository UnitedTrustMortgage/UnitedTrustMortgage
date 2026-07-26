// POST /api/auth/logout
//
// Deletes the current session token from quote_sessions and clears the
// session cookie. Idempotent — silent success if the token doesn't exist.

import { getSupabase, json, extractToken, sessionCookie } from "./_lib.mjs";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method not allowed" };

  const token = extractToken(event);
  if (token) {
    const supabase = getSupabase();
    await supabase.from("quote_sessions").delete().eq("token", token);
  }

  return json(200, { ok: true }, {
    "Set-Cookie": sessionCookie("", 0),
  });
};
