-- ============================================================
-- Fix: GMs/commissioner should already be on their team, not
-- sitting in the draftable pool. This updates the promotion
-- function going forward, and retroactively fixes existing ones.
-- Run this in the SQL Editor.
-- ============================================================

-- Update the promotion function to also assign the player's row to the team
create or replace function public.promote_to_gm(player_email text, target_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  if public.my_profile_role() != 'commissioner' then
    raise exception 'Only the commissioner can promote a GM';
  end if;

  select id into target_user_id from auth.users where email = player_email;
  if target_user_id is null then
    raise exception 'No login account found for that email - they must register first';
  end if;

  insert into profiles (id, role, team_id, email)
  values (target_user_id, 'gm', target_team_id, player_email)
  on conflict (id) do update set role = 'gm', team_id = target_team_id;

  -- Also assign their player card directly to the team - they're
  -- already on the roster, not something to be drafted
  update players set team_id = target_team_id where email = player_email;
end;
$$;

-- Retroactively fix any GM/commissioner already linked to a team
-- whose player card wasn't synced (this is what's affecting gm4 and
-- the commissioner right now)
update players p
set team_id = pr.team_id
from profiles pr
where p.email = pr.email
  and pr.team_id is not null
  and p.team_id is null;
