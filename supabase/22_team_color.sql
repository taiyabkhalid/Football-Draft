-- ============================================================
-- Add team color (shown as a small football icon next to team names).
-- Run this in the SQL Editor.
-- ============================================================

alter table teams add column if not exists team_color text not null default '#0074ff'
  check (team_color in ('#ff3b30', '#0074ff', '#00c853', '#ff8c00', '#8e24aa', '#ff2d95', '#ffd60a', '#00bcd4'));
