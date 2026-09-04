-- Everything the details screen needs in one round trip. Verification activity is exposed as
-- kind + time only: who verified stays private (RLS hides other users' verification rows, so
-- this runs as definer and deliberately omits user ids).
set search_path = public, extensions;

create or replace function public.report_detail(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_uid      uuid := auth.uid();
  v_report   jsonb;
  v_is_mine  boolean;
  v_my       jsonb;
  v_activity jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select to_jsonb(p) into v_report from public.public_flood_reports p where p.id = p_report_id;
  if v_report is null then
    return null;
  end if;

  v_is_mine := exists (
    select 1 from public.report_authors where report_id = p_report_id and user_id = v_uid);

  select jsonb_build_object('kind', v.kind, 'created_at', v.created_at)
    into v_my
  from public.report_verifications v
  where v.report_id = p_report_id and v.user_id = v_uid
  order by v.created_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'created_at', x.created_at)
                            order by x.created_at desc), '[]'::jsonb)
    into v_activity
  from (
    select kind, created_at
    from public.report_verifications
    where report_id = p_report_id
    order by created_at desc
    limit 10
  ) x;

  return jsonb_build_object(
    'report', v_report,
    'is_mine', v_is_mine,
    'my_verification', v_my,
    'activity', v_activity
  );
end;
$$;

grant execute on function public.report_detail(uuid) to authenticated;
