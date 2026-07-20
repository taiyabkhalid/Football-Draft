-- ============================================================
-- Diagnostic: show exactly what the live position_preference
-- constraint currently allows, to compare against the app's dropdown.
-- Run this in the SQL Editor and share the result.
-- ============================================================

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conname = 'players_position_preference_check';
