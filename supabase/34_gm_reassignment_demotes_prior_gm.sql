-- ============================================================
-- Fix: promote_to_gm() only ever added/updated the NEW gm's
-- profile and player row. If a team already had a different GM
-- assigned and the commissioner reassigned it to someone else,
-- the old GM was never demoted - their profile row (role='gm')
-- and their player row (team_id) stayed pointed at that team,
-- so both the old and new GM would show up anchored to the same
-- team in "View by Team".
--
-- This updates the function so that assigning a new GM to a team
-- automatically demotes any DIFFERENT gm currently on that team:
-- their profile row is removed and their player card is returned
-- to the draft pool. Commissioner rows are deliberately left
-- untouched - reassigning the commissioner should be a separate,
-- explicit action, not a side-effect of assigning a GM.
-- ============================================================

create or replace function public.promote_to_gm(player_email text, target_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  prior_gm_email text;
begin
  if public.my_profile_role() != 'commissioner' then
    raise exception 'Only the commissioner can promote a GM';
  end if;

  select id into target_user_id from auth.users where email = player_email;
  if target_user_id is null then
    raise exception 'No login account found for that email - they must register first';
  end if;

  select email into prior_gm_email
  from profiles
  where team_id = target_team_id
    and role = 'gm'
    and email is distinct from player_email;

  if prior_gm_email is not null then
    delete from profiles where email = prior_gm_email;
    update players set team_id = null, draft_pick_number = null where email = prior_gm_email;
  end if;

  insert into profiles (id, role, team_id, email)
  values (target_user_id, 'gm', target_team_id, player_email)
  on conflict (id) do update set role = 'gm', team_id = target_team_id;

  -- Also assign their player card directly to the team - they're
  -- already on the roster, not something to be drafted
  update players set team_id = target_team_id where email = player_email;
end;
$$;
