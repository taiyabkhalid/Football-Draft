-- ============================================================
-- Fix: the pick countdown clock was purely client-side and reset
-- to the full pick_clock_seconds every time a GM (or spectator)
-- loaded/reloaded the page, instead of reflecting real elapsed
-- time since the current pick actually started. Leaving and
-- returning to the draft room - or viewing from a second device -
-- would always show the full 2:00 again, effectively giving
-- unlimited time as long as the page was refreshed periodically.
--
-- This adds an authoritative timestamp for when the current pick
-- began. The app now computes remaining time as
-- pick_clock_seconds - (now - current_pick_started_at), so every
-- client agrees on the same true remaining time. The app updates
-- this column to now() every time a pick is made or skipped.
-- ============================================================

alter table draft_settings add column if not exists current_pick_started_at timestamptz;

-- Give the currently active pick a fresh start so testing isn't
-- stuck mid-countdown from before this column existed.
update draft_settings set current_pick_started_at = now() where id = 1;
