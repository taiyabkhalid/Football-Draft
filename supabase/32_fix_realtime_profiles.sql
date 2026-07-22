-- ============================================================
-- Fix: realtime updates silently stopped working across the whole
-- draft room (players, draft_picks, teams, draft_settings) after
-- the app started subscribing to postgres_changes on the
-- `profiles` table (added for the GM/Owner-name feature), because
-- `profiles` was never added to the supabase_realtime publication.
-- Subscribing to an unpublished table broke the entire multi-table
-- realtime channel, so drafted players never visually updated —
-- a pick would succeed in the database but the page wouldn't
-- reflect it until a manual refresh.
-- ============================================================

alter publication supabase_realtime add table public.profiles;
