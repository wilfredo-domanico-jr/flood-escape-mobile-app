-- Verification RPC, lifecycle transitions (trigger + cron sweep), reputation counters, retention.
set search_path = public, extensions;

-- Records a transition once and keeps the audit trail.
create or replace function public.apply_status_transition(
  p_report_id uuid,
  p_to        public.report_status,
  p_event     text,
  p_actor     uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_from public.report_status;
begin
  select status into v_from from public.flood_reports where id = p_report_id for update;
  if v_from is null or v_from = p_to then
    return false;
  end if;
  update public.flood_reports
     set status = p_to,
         resolved_at = case when p_to = 'resolved' then now() else resolved_at end
   where id = p_report_id;
  insert into public.report_events (report_id, event, from_status, to_status, actor_id)
  values (p_report_id, p_event, v_from, p_to, p_actor);
  return true;
end;
$$;

-- Reputation: +1 confirmed the first time another user confirms; +1 disputed the first time the
-- report becomes disputed. Both at most once per report (guarded by the audit table).
create or replace function public.bump_author_reputation(p_report_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_event  text := case when p_kind = 'confirmed' then 'reputation_confirmed' else 'reputation_disputed' end;
begin
  select user_id into v_author from public.report_authors where report_id = p_report_id;
  if v_author is null then return; end if;
  if exists (select 1 from public.report_events where report_id = p_report_id and event = v_event) then
    return;
  end if;
  if p_kind = 'confirmed' then
    update public.profiles set reports_confirmed = reports_confirmed + 1 where id = v_author;
  else
    update public.profiles set reports_disputed = reports_disputed + 1 where id = v_author;
  end if;
  insert into public.report_events (report_id, event) values (p_report_id, v_event);
end;
$$;

-- After every vote: refresh expiry on confirm, evaluate disputed/resolved, recompute confidence.
create or replace function public.report_verifications_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r          public.flood_reports%rowtype;
  v_confirms integer;
  v_clears   integer;
  v_recent_confirm boolean;
begin
  select * into r from public.flood_reports where id = new.report_id for update;
  if not found then return new; end if;

  if new.kind = 'confirm' then
    update public.flood_reports
       set last_confirmed_at = now(),
           expires_at        = now() + public.stale_window(severity)
     where id = new.report_id;
    perform public.bump_author_reputation(new.report_id, 'confirmed');
  end if;

  select count(distinct user_id) filter (where kind = 'confirm'),
         count(distinct user_id) filter (where kind = 'clear')
    into v_confirms, v_clears
  from public.report_verifications
  where report_id = new.report_id and created_at > now() - interval '6 hours';

  v_recent_confirm := exists (
    select 1 from public.report_verifications
    where report_id = new.report_id and kind = 'confirm' and created_at > now() - interval '60 minutes');

  if r.status <> 'resolved' then
    if v_clears >= 3 and not v_recent_confirm then
      perform public.apply_status_transition(new.report_id, 'resolved', 'resolved_by_consensus', new.user_id);
    elsif v_clears >= 2 and v_clears >= v_confirms then
      if public.apply_status_transition(new.report_id, 'disputed', 'disputed', new.user_id) then
        perform public.bump_author_reputation(new.report_id, 'disputed');
      end if;
    elsif new.kind = 'confirm' then
      -- A fresh confirmation reactivates stale or disputed reports (when confirms lead again).
      if r.status = 'stale' or (r.status = 'disputed' and v_confirms > v_clears) then
        perform public.apply_status_transition(new.report_id, 'active', 'reactivated', new.user_id);
      end if;
    end if;
  end if;

  perform public.recompute_confidence(new.report_id);
  return new;
end;
$$;

create trigger report_verifications_after_insert
  after insert on public.report_verifications
  for each row execute function public.report_verifications_after_insert();

-- The only way to vote. Rules: not your own report, within 1 km, 30 votes/hour, same kind
-- at most once per 6 h per report, idempotent on client_id.
create or replace function public.verify_report(
  p_client_id uuid,
  p_report_id uuid,
  p_kind      public.verification_kind,
  p_lat       double precision default null,
  p_lng       double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid      uuid := auth.uid();
  v_loc      geography;
  v_distance double precision;
  v_report   public.flood_reports%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'client_id_required' using errcode = '22023';
  end if;

  -- Idempotent retry.
  if exists (select 1 from public.report_verifications where client_id = p_client_id and user_id = v_uid) then
    return public.report_detail(p_report_id);
  end if;

  select * into v_report from public.flood_reports where id = p_report_id;
  if not found then
    raise exception 'report_not_found' using errcode = '22023', hint = 'This report no longer exists.';
  end if;
  if v_report.status = 'resolved' then
    raise exception 'report_resolved' using errcode = 'P0001', hint = 'This report is already closed.';
  end if;
  if exists (select 1 from public.report_authors where report_id = p_report_id and user_id = v_uid) then
    raise exception 'cannot_verify_own_report' using errcode = 'P0001',
      hint = 'You cannot verify your own report.';
  end if;

  if p_lat is null or p_lng is null then
    raise exception 'location_required' using errcode = 'P0001',
      hint = 'Turn on location to verify. You need to be within 1 km of the report.';
  end if;
  v_loc := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_distance := st_distance(v_report.location, v_loc);
  if v_distance > 1000 then
    raise exception 'too_far' using errcode = 'P0001',
      hint = 'You need to be within 1 km of the report to verify it.';
  end if;

  if (select count(*) from public.report_verifications
      where user_id = v_uid and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001',
      hint = 'Too many verifications in a short time. Try again later.';
  end if;
  if exists (select 1 from public.report_verifications
             where report_id = p_report_id and user_id = v_uid and kind = p_kind
               and created_at > now() - interval '6 hours') then
    raise exception 'already_verified' using errcode = 'P0001',
      hint = 'You already said that about this report recently.';
  end if;

  insert into public.report_verifications (client_id, report_id, user_id, kind, verifier_distance_m)
  values (p_client_id, p_report_id, v_uid, p_kind, v_distance);

  return public.report_detail(p_report_id);
end;
$$;

-- Time-based transitions and recency decay. Runs every 10 minutes via pg_cron.
create or replace function public.sweep_statuses()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count integer := 0;
  rec record;
begin
  for rec in
    select id from public.flood_reports where status = 'active' and expires_at < now()
  loop
    perform public.apply_status_transition(rec.id, 'stale', 'expired');
    v_count := v_count + 1;
  end loop;

  for rec in
    select id from public.flood_reports where status = 'stale' and expires_at < now() - interval '12 hours'
  loop
    perform public.apply_status_transition(rec.id, 'resolved', 'stale_timeout');
    v_count := v_count + 1;
  end loop;

  for rec in
    select r.id from public.flood_reports r
    where r.status = 'disputed'
      and r.updated_at < now() - interval '3 hours'
      and not exists (select 1 from public.report_verifications v
                      where v.report_id = r.id and v.kind = 'confirm' and v.created_at > now() - interval '3 hours')
  loop
    perform public.apply_status_transition(rec.id, 'resolved', 'disputed_timeout');
    v_count := v_count + 1;
  end loop;

  -- Recency decay for everything still on the map.
  for rec in
    select id from public.flood_reports
    where status in ('active', 'stale', 'disputed') and created_at > now() - interval '24 hours'
  loop
    perform public.recompute_confidence(rec.id);
  end loop;

  return v_count;
end;
$$;

-- Daily retention.
create or replace function public.run_retention()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from public.flood_reports
   where status in ('resolved', 'stale') and updated_at < now() - interval '30 days';
  delete from public.report_events where created_at < now() - interval '30 days';
end;
$$;

revoke execute on function public.apply_status_transition(uuid, public.report_status, text, uuid) from public, anon, authenticated;
revoke execute on function public.bump_author_reputation(uuid, text) from public, anon, authenticated;
revoke execute on function public.sweep_statuses() from public, anon, authenticated;
revoke execute on function public.run_retention() from public, anon, authenticated;
grant execute on function public.verify_report(uuid, uuid, public.verification_kind, double precision, double precision) to authenticated;

-- Schedules (idempotent). 03:00 Asia/Manila = 19:00 UTC.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('sweep-statuses', 'run-retention');
    perform cron.schedule('sweep-statuses', '*/10 * * * *', 'select public.sweep_statuses()');
    perform cron.schedule('run-retention', '0 19 * * *', 'select public.run_retention()');
  end if;
end;
$$;
