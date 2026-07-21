-- ============================================================
-- Diagnostic: show exactly what the live defensive_position
-- constraint currently allows, to compare against the app's dropdown
-- (CB, Safety, LB, Rush).
-- Run this in the SQL Editor and share the result.
-- ============================================================

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conname = 'players_defensive_position_check';
