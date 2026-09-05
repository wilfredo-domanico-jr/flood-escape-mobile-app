-- Phase 11: push notifications for saved routes.
-- Tables: notification_preferences (per user), device_push_tokens (Expo push tokens),
-- notification_outbox (queued pushes drained by the send-push Edge Function every minute).
-- Rules mirrored in src/lib/notifications/rules.ts: severity threshold, quiet hours (Asia/Manila,
-- never suppress impassable), one push per saved route per 30 minutes, never notify the author.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------------------------
-- Preferences
-- ---------------------------------------------------------------------------------------------
create table public.notification_preferences (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  enabled        boolean not null default true,
  min_severity   public.flood_severity not null default 'caution',
  quiet_start    time not null default '23:00',
  quiet_end      time not null default '06:00',
  notify_cleared boolean not null default false,
  updated_at     timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated using (user_id = auth.uid());

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- One row per profile, created with the profile and backfilled for existing users.
create or replace function public.create_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger profiles_after_insert_prefs
  after insert on public.profiles
  for each row execute function public.create_notification_preferences();

insert into public.notification_preferences (user_id)
select id from public.profiles on conflict do nothing;

create or replace function public.set_notification_preferences(
  p_enabled        boolean,
  p_min_severity   public.flood_severity,
  p_quiet_start    time,
  p_quiet_end      time,
  p_notify_cleared boolean
)
returns public.notification_preferences
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.notification_preferences;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  insert into public.notification_preferences (user_id, enabled, min_severity, quiet_start, quiet_end, notify_cleared)
  values (v_uid, p_enabled, p_min_severity, p_quiet_start, p_quiet_end, p_notify_cleared)
  on conflict (user_id) do update
    set enabled = excluded.enabled,
        min_severity = excluded.min_severity,
        quiet_start = excluded.quiet_start,
        quiet_end = excluded.quiet_end,
        notify_cleared = excluded.notify_cleared
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Push tokens
-- ---------------------------------------------------------------------------------------------
create table public.device_push_tokens (
  token      text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$'),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index device_push_tokens_user_idx on public.device_push_tokens (user_id);

alter table public.device_push_tokens enable row level security;

create policy device_push_tokens_select_own on public.device_push_tokens
  for select to authenticated using (user_id = auth.uid());

-- A token belongs to whoever registered it last (a phone that changes account moves with it).
create or replace function public.register_push_token(p_token text, p_platform text)
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
  insert into public.device_push_tokens (token, user_id, platform)
  values (p_token, v_uid, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from public.device_push_tokens where token = p_token and user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------------------------
create table public.notification_outbox (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  route_id        uuid references public.saved_routes (id) on delete cascade,
  report_id       uuid references public.flood_reports (id) on delete set null,
  kind            text not null check (kind in ('new_report', 'impassable_high', 'cleared')),
  title           text not null,
  body            text not null,
  data            jsonb not null default '{}'::jsonb,
  status          text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts        integer not null default 0,
  token           text,
  ticket_id       text,
  receipt_checked boolean not null default false,
  time_bucket     integer not null,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

-- One push per saved route per 30-minute bucket, whatever the kind.
create unique index notification_outbox_throttle_idx
  on public.notification_outbox (user_id, route_id, time_bucket) where route_id is not null;
create index notification_outbox_pending_idx on public.notification_outbox (created_at) where status = 'pending';
create index notification_outbox_receipts_idx on public.notification_outbox (sent_at) where status = 'sent' and not receipt_checked;

alter table public.notification_outbox enable row level security;
-- No policies: service role only.

-- ---------------------------------------------------------------------------------------------
-- Rules (pure functions, mirrored in TypeScript)
-- ---------------------------------------------------------------------------------------------
create or replace function public.severity_rank(p public.flood_severity)
returns integer
language sql
immutable
as $$
  select case p when 'passable' then 0 when 'caution' then 1 when 'dangerous' then 2 else 3 end;
$$;

-- Quiet hours in Manila local time; a window may wrap midnight (23:00-06:00). start = end means none.
create or replace function public.in_quiet_hours(p_at timestamptz, p_start time, p_end time)
returns boolean
language sql
stable
as $$
  select case
    when p_start = p_end then false
    when p_start < p_end then (p_at at time zone 'Asia/Manila')::time >= p_start and (p_at at time zone 'Asia/Manila')::time < p_end
    else (p_at at time zone 'Asia/Manila')::time >= p_start or (p_at at time zone 'Asia/Manila')::time < p_end
  end;
$$;

create or replace function public.notification_time_bucket(p_at timestamptz)
returns integer
language sql
immutable
as $$
  select floor(extract(epoch from p_at) / 1800)::integer;
$$;

-- Whether this user wants a push about this severity right now.
create or replace function public.wants_notification(
  p_prefs    public.notification_preferences,
  p_severity public.flood_severity,
  p_at       timestamptz
)
returns boolean
language sql
stable
as $$
  select p_prefs.enabled
     and public.severity_rank(p_severity) >= public.severity_rank(p_prefs.min_severity)
     and (p_severity = 'impassable' or not public.in_quiet_hours(p_at, p_prefs.quiet_start, p_prefs.quiet_end));
$$;

-- ---------------------------------------------------------------------------------------------
-- Enqueue
-- ---------------------------------------------------------------------------------------------
-- Inserts one outbox row per (user, route) that should hear about p_report_id. The throttle index
-- silently drops anything sent to that route in the last 30 minutes. Never notifies the author.
create or replace function public.enqueue_for_report(
  p_report_id uuid,
  p_kind      text,
  p_title     text,
  p_body_tpl  text,
  p_at        timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_report public.flood_reports;
  v_author uuid;
  v_count  integer := 0;
  rec      record;
begin
  select * into v_report from public.flood_reports where id = p_report_id;
  if v_report.id is null then
    return 0;
  end if;
  select user_id into v_author from public.report_authors where report_id = p_report_id;

  for rec in
    select r.id as route_id, r.user_id, r.name
      from public.saved_routes r
      join public.notification_preferences p on p.user_id = r.user_id
     where r.notify
       and r.user_id is distinct from v_author
       and st_dwithin(r.route_line, v_report.location, r.buffer_m)
       and (p_kind = 'cleared' and p.notify_cleared
            or p_kind <> 'cleared' and public.wants_notification(p, v_report.severity, p_at))
  loop
    insert into public.notification_outbox (user_id, route_id, report_id, kind, title, body, data, time_bucket)
    values (
      rec.user_id, rec.route_id, p_report_id, p_kind, p_title,
      replace(p_body_tpl, '{route}', rec.name),
      jsonb_build_object('url', 'floodescape://report/' || p_report_id::text, 'route_id', rec.route_id, 'report_id', p_report_id, 'kind', p_kind),
      public.notification_time_bucket(p_at)
    )
    on conflict do nothing;
    if found then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Replaces the Phase 4 stub: called by create_flood_report after the row exists.
create or replace function public.enqueue_route_notifications(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_severity public.flood_severity;
  v_label    text;
begin
  select severity into v_severity from public.flood_reports where id = p_report_id;
  if v_severity is null then
    return;
  end if;
  v_label := case v_severity
    when 'impassable' then 'Impassable flooding'
    when 'dangerous' then 'Dangerous flooding'
    when 'caution' then 'Flooding'
    else 'Shallow water' end;
  perform public.enqueue_for_report(
    p_report_id, 'new_report',
    v_label || ' reported near your route',
    v_label || ' was just reported on or near "{route}". Tap to see the report.'
  );
end;
$$;

-- Status and confidence changes: impassable reaching high confidence, and routes clearing.
create or replace function public.flood_reports_after_update_notify()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.severity = 'impassable' and new.confidence_level = 'high'
     and (old.confidence_level is distinct from 'high' or old.severity is distinct from 'impassable')
     and new.status in ('active', 'disputed') then
    perform public.enqueue_for_report(
      new.id, 'impassable_high',
      'A road on your route is impassable',
      'Several people confirmed impassable flooding on "{route}". Consider another way.'
    );
  end if;

  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    -- Only when nothing else is still open along that route.
    perform public.enqueue_cleared(new.id);
  end if;
  return new;
end;
$$;

create or replace function public.enqueue_cleared(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_report public.flood_reports;
  v_author uuid;
  rec      record;
begin
  select * into v_report from public.flood_reports where id = p_report_id;
  select user_id into v_author from public.report_authors where report_id = p_report_id;
  for rec in
    select r.id as route_id, r.user_id, r.name, r.route_line, r.buffer_m
      from public.saved_routes r
      join public.notification_preferences p on p.user_id = r.user_id
     where r.notify and p.enabled and p.notify_cleared
       and r.user_id is distinct from v_author
       and st_dwithin(r.route_line, v_report.location, r.buffer_m)
       and not exists (
         select 1 from public.flood_reports o
          where o.id <> p_report_id
            and o.status in ('active', 'disputed')
            and st_dwithin(r.route_line, o.location, r.buffer_m))
  loop
    insert into public.notification_outbox (user_id, route_id, report_id, kind, title, body, data, time_bucket)
    values (
      rec.user_id, rec.route_id, p_report_id, 'cleared',
      'Reports along your route have cleared',
      'Flood reports along "' || rec.name || '" are marked as no longer flooded. Still take care.',
      jsonb_build_object('url', 'floodescape://report/' || p_report_id::text, 'route_id', rec.route_id, 'report_id', p_report_id, 'kind', 'cleared'),
      public.notification_time_bucket(now())
    )
    on conflict do nothing;
  end loop;
end;
$$;

create trigger flood_reports_after_update_notify
  after update of status, confidence_level, severity on public.flood_reports
  for each row execute function public.flood_reports_after_update_notify();

-- ---------------------------------------------------------------------------------------------
-- Delivery trigger (pg_cron -> Edge Function) and retention
-- ---------------------------------------------------------------------------------------------
-- Reads the project URL and a shared secret from Vault so nothing sensitive lives in migrations.
-- If either is missing (local dev), the job is a no-op.
create or replace function public.trigger_send_push()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from public.notification_outbox where status = 'pending')
     and not exists (select 1 from public.notification_outbox where status = 'sent' and not receipt_checked and sent_at > now() - interval '30 minutes') then
    return;
  end if;
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_function_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_cron_secret';
  exception when others then
    return;
  end;
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;

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
  delete from public.notification_outbox where created_at < now() - interval '7 days';
  delete from public.device_push_tokens where updated_at < now() - interval '90 days';
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'send-push';
    perform cron.schedule('send-push', '* * * * *', 'select public.trigger_send_push()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------
-- Default privileges (migration 000100) already keep new functions away from public/anon.
revoke execute on function public.enqueue_for_report(uuid, text, text, text, timestamptz) from authenticated;
revoke execute on function public.enqueue_cleared(uuid) from authenticated;
revoke execute on function public.trigger_send_push() from authenticated;
revoke execute on function public.create_notification_preferences() from authenticated;
revoke execute on function public.flood_reports_after_update_notify() from authenticated;
grant execute on function public.set_notification_preferences(boolean, public.flood_severity, time, time, boolean) to authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.severity_rank(public.flood_severity) to authenticated;
grant execute on function public.in_quiet_hours(timestamptz, time, time) to authenticated;
grant select on public.notification_preferences to authenticated;
grant select on public.device_push_tokens to authenticated;
