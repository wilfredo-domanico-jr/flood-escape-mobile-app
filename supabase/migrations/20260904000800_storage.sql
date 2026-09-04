-- Photo storage. Public read (photos are meant to be seen), authors-only upload/delete,
-- 2 MB JPEG cap enforced by the bucket itself. Paths never contain a user id.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "report photos are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'report-photos');

-- name is reports/{report_id}.jpg and the caller must be that report's author.
create policy "authors upload their report photo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-photos'
    and name ~ '^reports/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    and exists (
      select 1 from public.report_authors a
      where a.user_id = auth.uid()
        and a.report_id::text = substring(name from 9 for 36)
    )
  );

create policy "authors delete their report photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'report-photos'
    and exists (
      select 1 from public.report_authors a
      where a.user_id = auth.uid()
        and a.report_id::text = substring(name from 9 for 36)
    )
  );
