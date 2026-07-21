-- ============================================================
-- Diagnostic: check whether accounts are confirmed, which affects
-- whether they're allowed to sign in.
-- Run this in the SQL Editor and share the result.
-- ============================================================

select email, email_confirmed_at, created_at
from auth.users
order by created_at desc;
