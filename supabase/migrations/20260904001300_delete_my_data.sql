-- "Delete my data": removes everything tied to the caller. Reports they authored are deleted
-- (cascading media rows), their votes are deleted, counters reset. Storage objects cannot be
-- deleted from SQL on Supabase (storage.protect_delete), so the client removes its photos through
-- the Storage API first (the authors-delete policy allows it) and then calls this function.
-- The auth user itself is signed out client-side and purged by the retention script.
set search_path = public, extensions;

create or replace function public.delete_my_data()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  delete from public.flood_reports r
  using public.report_authors a
  where a.report_id = r.id and a.user_id = v_uid;

  delete from public.report_verifications where user_id = v_uid;

  update public.profiles
     set display_name = null, reports_confirmed = 0, reports_disputed = 0
   where id = v_uid;
end;
$$;

grant execute on function public.delete_my_data() to authenticated;
