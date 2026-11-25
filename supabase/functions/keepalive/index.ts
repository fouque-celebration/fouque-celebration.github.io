import { createClient } from "npm:@supabase/supabase-js@2";

// Pinged by .github/workflows/keepalive.yml so the free-tier project never sits idle long
// enough to be paused. Runs one tiny database query and returns no data.
Deno.serve(async () => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { error } = await db.from("rsvps").select("id", { count: "exact", head: true });
  if (error) {
    console.error("keepalive: db error", error.message);
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ ok: true, at: new Date().toISOString() }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
});
