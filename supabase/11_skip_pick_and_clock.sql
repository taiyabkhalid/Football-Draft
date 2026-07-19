-- ============================================================
-- Support commissioner-triggered "skip pick", and bump the
-- default pick clock from 60 to 120 seconds.
-- Run this in the SQL Editor.
-- ============================================================

-- A skipped pick has no player attached
alter table draft_picks alter column player_id drop not null;

-- Update the clock (both the default for future settings rows,
-- and the actual current row)
alter table draft_settings alter column pick_clock_seconds set default 120;
update draft_settings set pick_clock_seconds = 120 where id = 1;
