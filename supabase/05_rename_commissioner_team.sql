-- ============================================================
-- Remove special-case naming for the commissioner's team.
-- All 8 teams should look identical until each GM (including the
-- commissioner) names their own team.
-- Run this in the SQL Editor.
-- ============================================================

update teams set name = 'Team 8' where name = 'Commissioner''s Team';
