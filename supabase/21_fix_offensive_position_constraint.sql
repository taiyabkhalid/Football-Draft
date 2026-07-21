-- ============================================================
-- Fix: the live constraint said 'Center', but the app's dropdown
-- sends 'C'. Align the database to match the app.
-- Run this in the SQL Editor.
-- ============================================================

alter table players drop constraint players_offensive_position_check;
alter table players add constraint players_offensive_position_check
  check (offensive_position in ('QB', 'WR', 'C'));
