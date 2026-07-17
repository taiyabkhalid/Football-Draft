-- ============================================================
-- Seed Teams + Link Logins to Roles/Teams
-- Run this in the SQL Editor
-- ============================================================

-- Update league settings to 8 teams
update draft_settings set num_teams = 8 where id = 1;

-- Create all 8 teams with placeholder names (rename anytime later)
insert into teams (name) values
  ('Commissioner''s Team'),
  ('Team GM1'),
  ('Team GM2'),
  ('Team GM3'),
  ('Team GM4'),
  ('Team GM5'),
  ('Team GM6'),
  ('Team GM7');

-- Link each auth login to its role and team
insert into profiles (id, role, team_id) values
  ('c37e3f09-2816-4010-832c-51c95e8f3476', 'commissioner', (select id from teams where name = 'Commissioner''s Team')),
  ('02953c10-7d92-4f8a-ac86-a584244e83b9', 'gm', (select id from teams where name = 'Team GM1')),
  ('6b852e95-ae31-4b85-8fbf-e64fc24a1ffd', 'gm', (select id from teams where name = 'Team GM2')),
  ('207f05b1-182e-4e18-a290-367140fae412', 'gm', (select id from teams where name = 'Team GM3')),
  ('d10b5fa7-2baa-4041-9ce6-14abbca97313', 'gm', (select id from teams where name = 'Team GM4')),
  ('df8256aa-f0d8-411b-875d-4d7c07231af1', 'gm', (select id from teams where name = 'Team GM5')),
  ('3eb00064-add6-4ab9-a41c-d65567e7233f', 'gm', (select id from teams where name = 'Team GM6')),
  ('53d74c0c-8657-4a86-a154-b984e6cdac6a', 'gm', (select id from teams where name = 'Team GM7'));
