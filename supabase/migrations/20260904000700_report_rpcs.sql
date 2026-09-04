-- Write RPCs for reports. All client mutations go through here: validation, rate limits,
-- duplicate folding, identity split, denormalised counters and audit rows in one transaction.
set search_path = public, extensions;

-- Placeholder; the notifications migration replaces it with the real fan-out.
create or replace function public.enqueue_route_notifications(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return;
end;
$$;

create or replace function public.create_flood_report(
  p_client_id   uuid,
  p_lat         double precision,
  p_lng         double precision,
  p_severity    public.flood_severity,
  p_accuracy_m  real default null,
  p_description text default null
)
returns setof public.public_flood_reports
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid      uuid := auth.uid();
  v_is_anon  boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true);
  v_loc      geography;
  v_existing uuid;
  v_dup      uuid;
  v_id       uuid;
  v_recent   integer;
  v_limit    integer;
  v_desc     text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'client_id_required' using errcode = '22023';
  end if;
  if p_lat is null or p_lng is null
     or p_lat <> p_lat or p_lng <> p_lng  -- NaN guards
     or p_lat not between 4 and 22 or p_lng not between 116 and 127 then
    raise exception 'invalid_location' using errcode = '22023',
      hint = 'The location must be inside the Philippines.';
  end if;
  if v_desc is not null and char_length(v_desc) > 500 then
    raise exception 'description_too_long' using errcode = '22023',
      hint = 'Keep the description under 500 characters.';
  end if;
  if p_accuracy_m is not null and p_accuracy_m < 0 then
    raise exception 'invalid_accuracy' using errcode = '22023';
  end if;

  v_loc := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  -- Idempotent retry: the same client_id from the same user returns the existing row.
  select r.id into v_existing
  from public.flood_reports r
  join public.report_authors a on a.report_id = r.id
  where r.client_id = p_client_id and a.user_id = v_uid;
  if v_existing is not null then
    return query select * from public.public_flood_reports where id = v_existing;
    return;
  end if;
  if exists (select 1 from public.flood_reports where client_id = p_client_id) then
    raise exception 'client_id_taken' using errcode = '23505';
  end if;

  -- Rate limit: anonymous accounts get a tighter budget.
  v_limit := case when v_is_anon then 3 else 5 end;
  select count(*) into v_recent
  from public.report_authors
  where user_id = v_uid and created_at > now() - interval '15 minutes';
  if v_recent >= v_limit then
    raise exception 'rate_limited' using errcode = 'P0001',
      hint = 'Too many reports in a short time. Try again in a few minutes.';
  end if;

  -- Same user, same spot, still recent: treat as a re-confirmation instead of a new row.
  select r.id into v_dup
  from public.flood_reports r
  join public.report_authors a on a.report_id = r.id
  where a.user_id = v_uid
    and r.status in ('active', 'stale')
    and r.created_at > now() - interval '2 hours'
    and st_dwithin(r.location, v_loc, 50)
  order by r.created_at desc
  limit 1;
  if v_dup is not null then
    update public.flood_reports
       set last_confirmed_at = now(),
           severity          = p_severity,
           expires_at        = now() + public.stale_window(p_severity),
           status            = 'active',
           description       = coalesce(v_desc, description)
     where id = v_dup;
    insert into public.report_events (report_id, event, to_status, actor_id)
    values (v_dup, 'duplicate_folded', 'active', v_uid);
    perform public.recompute_confidence(v_dup);
    return query select * from public.public_flood_reports where id = v_dup;
    return;
  end if;

  insert into public.flood_reports
    (client_id, severity, location, location_accuracy_m, description, geo_cell, expires_at)
  values
    (p_client_id, p_severity, v_loc, p_accuracy_m, v_desc, '', now() + public.stale_window(p_severity))
  returning id into v_id;

  insert into public.report_authors (report_id, user_id, reputation_snapshot)
  values (v_id, v_uid, public.reputation_for(v_uid));

  insert into public.report_events (report_id, event, to_status, actor_id)
  values (v_id, 'created', 'active', v_uid);

  perform public.recompute_confidence(v_id);

  -- Neighbours gain an "independent nearby report" signal.
  perform public.recompute_confidence(o.id)
  from public.flood_reports o
  where o.id <> v_id
    and o.status in ('active', 'disputed')
    and o.created_at > now() - interval '6 hours'
    and st_dwithin(o.location, v_loc, 150);

  perform public.enqueue_route_notifications(v_id);

  return query select * from public.public_flood_reports where id = v_id;
end;
$$;

-- Registers an uploaded photo. The storage policy already guarantees the object belongs to
-- the caller's report; this records it and lets the trigger update has_photo + confidence.
create or replace function public.attach_report_media(
  p_report_id    uuid,
  p_storage_path text,
  p_width        integer default null,
  p_height       integer default null,
  p_bytes        integer default null
)
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
  if not exists (select 1 from public.report_authors where report_id = p_report_id and user_id = v_uid) then
    raise exception 'not_report_author' using errcode = '42501';
  end if;
  if p_storage_path <> 'reports/' || p_report_id::text || '.jpg' then
    raise exception 'invalid_storage_path' using errcode = '22023';
  end if;
  insert into public.report_media (report_id, storage_path, width, height, bytes)
  values (p_report_id, p_storage_path, p_width, p_height, p_bytes)
  on conflict (storage_path) do nothing;
end;
$$;

-- The original reporter may close their own report.
create or replace function public.resolve_own_report(p_report_id uuid)
returns setof public.public_flood_reports
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid  uuid := auth.uid();
  v_prev public.report_status;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select r.status into v_prev
  from public.flood_reports r
  join public.report_authors a on a.report_id = r.id
  where r.id = p_report_id and a.user_id = v_uid;
  if v_prev is null then
    raise exception 'not_report_author' using errcode = '42501';
  end if;
  if v_prev <> 'resolved' then
    update public.flood_reports set status = 'resolved', resolved_at = now() where id = p_report_id;
    insert into public.report_events (report_id, event, from_status, to_status, actor_id)
    values (p_report_id, 'resolved_by_author', v_prev, 'resolved', v_uid);
  end if;
  return query select * from public.public_flood_reports where id = p_report_id;
end;
$$;

revoke execute on function public.enqueue_route_notifications(uuid) from public, anon, authenticated;
grant execute on function public.create_flood_report(uuid, double precision, double precision, public.flood_severity, real, text) to authenticated;
grant execute on function public.attach_report_media(uuid, text, integer, integer, integer) to authenticated;
grant execute on function public.resolve_own_report(uuid) to authenticated;
