-- ============================================================
-- Groundwork for: showing "owned by [GM name]" on teams, and letting
-- the commissioner promote a registered player to GM status later.
-- Run this in the SQL Editor.
-- ============================================================

-- Store email directly on profiles (avoids needing client-side access
-- to the protected auth.users table just to display a name)
alter table profiles add column if not exists email text;

-- Backfill existing profiles (safe to run from the SQL Editor, which
-- has full access - this wouldn't work from browser/client code)
update profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- Keep it filled in automatically for any future profile
create or replace function public.set_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select email into new.email from auth.users where id = new.id;
  return new;
end;
$$;

drop trigger if exists set_profile_email_trigger on profiles;
create trigger set_profile_email_trigger
  before insert on profiles
  for each row execute function public.set_profile_email();

-- Secure function: given a player's email, look up their existing login
-- account (created when they registered) and grant them GM status on a
-- team. Only a commissioner can call this successfully.
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
end;
$$;
