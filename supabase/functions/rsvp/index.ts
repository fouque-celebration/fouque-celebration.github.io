import { createClient } from "npm:@supabase/supabase-js@2";
import { esc, sendMail } from "./mail.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://karinasax.github.io/fouque-2027/";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const DAYS: Record<string, string> = {
  thu: "Thursday, April 29 — Social outing & dinner",
  fri: "Friday, April 30 — Academic talks",
  both: "Both days — April 29 & 30",
};
const DIETS = ["No restrictions", "Vegetarian", "Vegan", "Pescatarian", "Gluten-free", "Dairy-free", "Kosher", "Halal", "Other (see notes)"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }

  // Honeypot: real people never fill the hidden "website" field.
  if (clip(b.website, 200)) return json({ ok: true, emailed: false });

  const email = clip(b.email, 254).toLowerCase();
  const name = clip(b.name, 120);
  const attending = b.attending === true;
  if (b.attending !== true && b.attending !== false) return json({ error: "Please choose whether you will attend." }, 400);
  if (!name) return json({ error: "Please enter your name." }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: "Please enter a valid email address." }, 400);

  let days: string | null = null, diet: string | null = null, diet_notes: string | null = null;
  if (attending) {
    days = clip(b.days, 8);
    if (!(days in DAYS)) return json({ error: "Please choose which days you will attend." }, 400);
    diet = clip(b.diet, 40);
    if (!DIETS.includes(diet)) diet = "No restrictions";
    diet_notes = clip(b.diet_notes, 500) || null;
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: prev } = await db.from("rsvps").select("id, submit_count, updated_at").eq("email", email).maybeSingle();
  if (prev && Date.now() - new Date(prev.updated_at).getTime() < 5000) {
    return json({ error: "Your response was just saved. Please wait a moment before submitting again." }, 429);
  }
  const row = { email, name, attending, days, diet, diet_notes, updated_at: new Date().toISOString() };
  const { error } = prev
    ? await db.from("rsvps").update({ ...row, submit_count: prev.submit_count + 1 }).eq("id", prev.id)
    : await db.from("rsvps").insert(row);
  if (error) {
    console.error("rsvp: db error", error.message);
    return json({ error: "Something went wrong saving your response. Please try again." }, 500);
  }

  const updated = !!prev;
  const lines: [string, string][] = [["Name", name], ["Response", attending ? "Attending" : "Not attending"]];
  if (attending) {
    lines.push(["Joining", DAYS[days!]], ["Dietary preference", diet!]);
    if (diet_notes) lines.push(["Dietary notes", diet_notes]);
  }
  const intro = attending
    ? "Thank you — we are delighted you will join us to celebrate Jean-Pierre."
    : "Thank you for letting us know. You will be missed.";
  const subject = updated ? "Your RSVP has been updated — Celebrating Jean-Pierre Fouque" : "Your RSVP — Celebrating Jean-Pierre Fouque";
  const rows = lines.map(([k, v]) =>
    `<tr><td style="padding:8px 16px 8px 0;color:#575E6B;font:13px/1.4 Arial,sans-serif;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:8px 0;color:#1A2338;font:15px/1.4 Georgia,serif">${esc(v)}</td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#F4F1EA">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #CBC5B8">
<tr><td style="background:#14203A;padding:20px 28px;color:#EEE8DB;font:600 11px/1.3 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">UC Santa Barbara · CFMAR</td></tr>
<tr><td style="padding:32px 28px 8px;color:#1A2338">
<div style="font:600 11px/1.3 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#575E6B">April 29 – 30, 2027 · Santa Barbara</div>
<div style="font:300 30px/1.15 Georgia,serif;margin-top:12px">Celebrating <i>Jean-Pierre Fouque</i></div>
<p style="font:16px/1.55 Georgia,serif;margin:20px 0 0">${esc(intro)}${updated ? " Your response has been updated." : ""}</p>
</td></tr>
<tr><td style="padding:16px 28px"><table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid #CBC5B8;width:100%">${rows}</table></td></tr>
<tr><td style="padding:8px 28px 32px;font:14px/1.55 Arial,sans-serif;color:#575E6B">
Need to change something? Return to the <a href="${esc(SITE_URL)}" style="color:#1A2338">invitation</a> and submit again with this email address — your latest response replaces the previous one.<br><br>
Times and locations will be shared closer to the date. Questions? Simply reply to this email or write to Eli Kollman at <a href="mailto:eli.ws.kollman@gmail.com" style="color:#1A2338">eli.ws.kollman@gmail.com</a>.
</td></tr></table></td></tr></table></body></html>`;
  const text = `${intro}${updated ? " Your response has been updated." : ""}\n\n` +
    lines.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nTo change your response, return to ${SITE_URL} and submit again with this email address.\nQuestions? Reply to this email or write to eli.ws.kollman@gmail.com.\n`;
  const emailed = await sendMail(email, subject, html, text);
  return json({ ok: true, updated, emailed });
});
