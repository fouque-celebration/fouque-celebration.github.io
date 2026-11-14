# Celebrating Jean-Pierre Fouque — invitation & RSVP

- `web/` — static site (GitHub Pages): `index.html` public invitation + 2-step RSVP; `organizer/` private dashboard (email-code sign-in, CSV export).
- `supabase/functions/` — Edge Functions on project `sfwrxbnzbamoxdyquwls`:
  - `rsvp` — validates and upserts a response by email, sends a confirmation via Gmail SMTP (465).
  - `organizer` — emails a 6-digit sign-in code to allow-listed organizers, issues a 12h signed session, returns responses.
- Data: `rsvps`, `organizers`, `login_codes` tables. RLS on, no policies, privileges revoked from `anon`/`authenticated`: only the functions (service role) can read or write.
- Secrets: `GMAIL_USER`, `GMAIL_APP_PASSWORD` (optional `SITE_URL`, `REPLY_TO`).
- Add an organizer: `insert into organizers(email) values ('someone@example.com');`
