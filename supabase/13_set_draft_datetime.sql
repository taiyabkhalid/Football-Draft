-- ============================================================
-- Set the scheduled draft date/time (shown on the player profile banner).
-- Timezone: Europe/London.
-- Run this in the SQL Editor.
-- ============================================================

update draft_settings
set draft_datetime = '2026-09-19 18:00:00' at time zone 'Europe/London'
where id = 1;
