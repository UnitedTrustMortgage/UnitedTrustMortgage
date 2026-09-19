// TEMPORARY provisioning endpoint — insert a quote_operators row.
// Gated by CRM_WEBHOOK_KEY (internal shared secret; same trust domain as
// the cadence-crm webhook). The bcrypt hash is computed by the caller so
// this function needs no extra dependencies and never sees the password.
//
// DELETE THIS FILE after use — it exists only because the Supabase env
// vars are secret-marked in Netlify (unreadable locally), so operator
// rows can't be inserted from a dev machine.

import crypto from "node:crypto";
import { getSupabase, json, err, parseBody } from "./_lib.mjs";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return err(405, "method not allowed");

  const expected = process.env.CRM_WEBHOOK_KEY;
  const got = event.headers?.["x-admin-key"] || event.headers?.["X-Admin-Key"] || "";
  if (!expected) return err(503, "CRM_WEBHOOK_KEY not configured");
  const a = Buffer.from(String(got));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return err(403, "forbidden");
  }

  const body = parseBody(event);
  if (!body) return err(400, "invalid JSON");
  const { name, email, passHash, isAdmin } = body;
  if (!name || !email || !passHash) return err(400, "name, email, passHash required");
  if (!/^\$2[aby]\$\d\d\$.{53}$/.test(passHash)) return err(400, "passHash must be a bcrypt hash");

  const supabase = getSupabase();

  const { data: existing, error: exErr } = await supabase
    .from("quote_operators")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (exErr) return err(500, `lookup failed: ${exErr.message}`);
  if (existing) return err(409, "operator with that email already exists");

  const { data, error } = await supabase
    .from("quote_operators")
    .insert({
      name,
      email: email.toLowerCase(),
      pass_code_hash: passHash,
      active: true,
      is_admin: !!isAdmin,
    })
    .select("id, name, email, active, is_admin")
    .single();
  if (error) return err(500, `insert failed: ${error.message}`);

  return json(200, { created: data });
};
