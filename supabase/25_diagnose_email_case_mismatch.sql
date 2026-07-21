-- ============================================================
-- Find any player cards whose email doesn't exactly match their
-- login account's email (usually a casing difference).
-- Run this in the SQL Editor and share the result.
-- ============================================================

select p.email as player_card_email, u.email as login_email
from players p
join auth.users u on lower(p.email) = lower(u.email)
where p.email <> u.email;
