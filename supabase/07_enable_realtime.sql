-- ============================================================
-- Enable live sync (Realtime) on the tables the draft room watches.
-- Without this, GMs would need to manually refresh to see new picks.
-- Run this in the SQL Editor.
-- ============================================================

alter publication supabase_realtime add table players;
alter publication supabase_realtime add table draft_picks;
alter publication supabase_realtime add table draft_settings;
alter publication supabase_realtime add table teams;
