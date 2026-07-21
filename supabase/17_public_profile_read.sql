-- ============================================================
-- Allow anyone (including logged-out spectators) to read basic
-- profile info (role, team, email) - needed to show "owned by
-- [GM name]" on the public live draft / results page.
-- Run this in the SQL Editor.
-- ============================================================

create policy "Public can read profiles" on profiles
  for select using (true);
