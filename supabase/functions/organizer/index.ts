import { createClient } from "npm:@supabase/supabase-js@2";
import { sendMail } from "./mail.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY, { auth: { persistSession: false } });
const enc = new TextEncoder();
const SESSION_HOURS = 12;

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode("organizer-session:" + SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
async function sha(data: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(data + ":" + SERVICE_KEY)));
}
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function isOrganizer(email: string) {
  const { data } = await db.from("organizers").select("email").eq("email", email).maybeSingle();
  return !!data;
}
async function checkToken(token: unknown): Promise<string | null> {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!safeEq(sig, await hmac(payload))) return null;
  try {
    const { email, exp } = JSON.parse(fromB64url(payload));
    if (typeof exp !== "number" || Date.now() > exp) return null;
    return (await isOrganizer(email)) ? email : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const action = b.action;

  if (action === "request_code") {
    const email = String(b.email ?? "").trim().toLowerCase().slice(0, 254);
    // Same answer whether or not the address is an organizer, so the list can't be probed.
    const generic = json({ ok: true });
    if (!(await isOrganizer(email))) return generic;
    const { data: existing } = await db.from("login_codes").select("sent_at").eq("email", email).maybeSingle();
    if (existing && Date.now() - new Date(existing.sent_at).getTime() < 60_000) return generic;
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    await db.from("login_codes").upsert({
      email, code_hash: await sha(email + ":" + code), attempts: 0,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), sent_at: new Date().toISOString(),
    });
    await sendMail(email, `Organizer sign-in code: ${code}`,
      `<p style="font:16px/1.5 Georgia,serif">Your sign-in code for the Jean-Pierre Fouque celebration RSVP dashboard is</p><p style="font:600 28px/1 Arial,sans-serif;letter-spacing:6px">${code}</p><p style="font:14px/1.5 Arial,sans-serif;color:#575E6B">It expires in 10 minutes. If you didn't request it, you can ignore this email.</p>`,
      `Your organizer sign-in code is ${code}. It expires in 10 minutes.`);
    return generic;
  }

  if (action === "verify") {
    const email = String(b.email ?? "").trim().toLowerCase();
    const code = String(b.code ?? "").replace(/\D/g, "");
    const fail = json({ error: "That code is incorrect or has expired." }, 401);
    const { data: row } = await db.from("login_codes").select("*").eq("email", email).maybeSingle();
    if (!row || new Date(row.expires_at).getTime() < Date.now() || row.attempts >= 5) return fail;
    if (!safeEq(row.code_hash, await sha(email + ":" + code))) {
      await db.from("login_codes").update({ attempts: row.attempts + 1 }).eq("email", email);
      return fail;
    }
    await db.from("login_codes").delete().eq("email", email);
    if (!(await isOrganizer(email))) return fail;
    const payload = b64url(enc.encode(JSON.stringify({ email, exp: Date.now() + SESSION_HOURS * 3600_000 })));
    return json({ token: `${payload}.${await hmac(payload)}`, email });
  }

  if (action === "responses") {
    const who = await checkToken(b.token);
    if (!who) return json({ error: "Your session has expired. Please sign in again." }, 401);
    const { data, error } = await db.from("rsvps")
      .select("name, email, attending, days, diet, diet_notes, submit_count, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) return json({ error: "Could not load responses." }, 500);
    return json({ rows: data, viewer: who });
  }

  return json({ error: "Unknown action." }, 400);
});
