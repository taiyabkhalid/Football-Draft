-- ============================================================
-- Allow a wider, dynamic range of team counts (4 to 8) instead of
-- a fixed 6-8, since the league isn't sure yet how many teams it'll have.
-- Run this in the SQL Editor.
-- ============================================================

alter table draft_settings drop constraint draft_settings_num_teams_check;
alter table draft_settings add constraint draft_settings_num_teams_check check (num_teams between 4 and 8);
