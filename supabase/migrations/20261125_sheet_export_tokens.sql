-- Tokens that allow the sheet-export function to return the RSVP list as CSV.
-- Same lockdown as the other tables: RLS on, no policies, no anon/authenticated access.
create table if not exists public.sheet_export_tokens (
  token text primary key,
  label text,
  created_at timestamptz not null default now()
);
alter table public.sheet_export_tokens enable row level security;
revoke all on public.sheet_export_tokens from anon, authenticated;
