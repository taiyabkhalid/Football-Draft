-- ============================================================
-- Set the scheduled draft date/time (shown on the player profile banner).
-- Using America/New_York as a default timezone - let me know if your
-- league is in a different timezone and I'll adjust this.
-- Run this in the SQL Editor.
-- ============================================================

update draft_settings
set draft_datetime = '2026-09-19 18:00:00' at time zone 'America/New_York'
where id = 1;
