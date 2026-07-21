-- ============================================================
-- Lets a just-registered player's card sync to a pre-existing team
-- assignment (e.g. a GM/commissioner set up ahead of time), safely -
-- this can only sync to whatever the commissioner already assigned
-- for that exact email, not let anyone assign themselves anywhere.
-- Run this in the SQL Editor.
-- ============================================================

create or replace function public.sync_preassigned_team(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update players
  set team_id = pr.team_id
  from profiles pr
  where players.email = p_email
    and pr.email = p_email
    and pr.team_id is not null;
end;
$$;
