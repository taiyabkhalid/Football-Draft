-- ============================================================
-- Normalize every player card's email to lowercase, matching how
-- Supabase always stores login account emails. Fixes any existing
-- mismatch and is safe to run even if nothing needs fixing.
-- Run this in the SQL Editor.
-- ============================================================

update players set email = lower(email) where email <> lower(email);
