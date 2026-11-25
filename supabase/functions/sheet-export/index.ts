import { createClient } from "npm:@supabase/supabase-js@2";

// Read-only CSV of all RSVPs for a Google Sheet: =IMPORTDATA("<function url>?token=<token>")
// The token lives in the `sheet_export_tokens` table (service role only), never in this repo.
const DAYS: Record<string, string> = { thu: "Thursday only", fri: "Friday only", both: "Both days" };

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Quote for CSV, and neutralise a leading = or @ so guest input can't become a Sheets formula.
  const safe = /^[=@]/.test(s) ? "'" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
const pacific = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (token.length < 32) return new Response("Forbidden", { status: 403 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: ok } = await db.from("sheet_export_tokens").select("token").eq("token", token).maybeSingle();
  if (!ok) return new Response("Forbidden", { status: 403 });

  const { data, error } = await db.from("rsvps")
    .select("name, email, attending, days, diet, diet_notes, submit_count, updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("sheet-export: db error", error.message);
    return new Response("Error", { status: 500 });
  }

  const header = ["Last updated (Pacific)", "Name", "Email", "Attending", "Days", "Dietary preference", "Dietary notes", "Times submitted"];
  const rows = (data ?? []).map((r) => [
    pacific(r.updated_at), r.name, r.email, r.attending ? "Yes" : "No",
    r.attending ? DAYS[r.days] ?? r.days : "", r.attending ? r.diet : "", r.diet_notes ?? "", r.submit_count ?? 1,
  ]);
  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
});
