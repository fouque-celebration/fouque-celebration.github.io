-- Schedule changed: Friday Apr 30 (talks + beach BBQ), Saturday May 1 (optional wine tasting).
alter table public.rsvps drop constraint if exists rsvps_days_check;
alter table public.rsvps add constraint rsvps_days_check check (days = any (array['fri','sat','both']));
