-- ============================================================
-- Storage policy fix: allow public uploads to the "headshots" bucket
-- Run this in the SQL Editor
-- ============================================================

create policy "Public can upload headshots"
on storage.objects for insert
to public
with check (bucket_id = 'headshots');

create policy "Public can view headshots"
on storage.objects for select
to public
using (bucket_id = 'headshots');
