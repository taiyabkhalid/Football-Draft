-- ============================================================
-- Directly set a password for every commissioner/GM account.
-- Useful for placeholder accounts that can't receive a real reset email.
-- Run this in the SQL Editor.
-- ============================================================

update auth.users
set encrypted_password = crypt('TempPass123!', gen_salt('bf'))
where email in (
  'taiyabkhalid@gmail.com',
  'gm1@placeholder.com',
  'gm2@placeholder.com',
  'gm3@placeholder.com',
  'gm4@placeholder.com',
  'gm5@placeholder.com',
  'gm6@placeholder.com',
  'gm7@placeholder.com'
);
