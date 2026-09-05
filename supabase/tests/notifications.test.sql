-- pgTAP: notification preferences, push tokens, and route alert enqueueing rules.
begin;
select plan(16);

-- A reports, B watches a route, C is a bystander.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at) values
  ('aaaaaaaa-0000-4000-8000-000000000071', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000072', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000073', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());

select is(
  (select count(*) from public.notification_preferences where user_id in ('aaaaaaaa-0000-4000-8000-000000000071', 'aaaaaaaa-0000-4000-8000-000000000072')),
  2::bigint, 'a preferences row is created with each profile');

-- B saves a north-south route along lng 121.0300 (Quezon City, away from seeds).
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000072","role":"authenticated","is_anonymous":true}';
select lives_ok(
  $$ select * from public.save_route('Home to work', '{"type":"LineString","coordinates":[[121.03,14.74],[121.03,14.76]]}', 'Home', 'Work') $$,
  'B saves a route');

select lives_ok(
  $$ select public.register_push_token('ExponentPushToken[abc123_-XYZ]', 'android') $$,
  'a well-formed Expo push token registers');
select throws_ok(
  $$ select public.register_push_token('not-a-token', 'android') $$,
  '23514', null, 'a malformed token is rejected');

select is(
  (select enabled from public.set_notification_preferences(false, 'dangerous', '22:00', '07:00', true)),
  false, 'preferences can be updated through the RPC');
select is(
  (select count(*) from public.notification_preferences), 1::bigint,
  'RLS shows a user only their own preferences row');
select is(
  (select count(*) from public.device_push_tokens), 1::bigint,
  'RLS shows a user only their own tokens');
-- Back to defaults for the enqueue checks.
select is(
  (select min_severity from public.set_notification_preferences(true, 'caution', '23:00', '06:00', false)),
  'caution'::public.flood_severity, 'preferences reset to defaults');
reset role;

-- A reports 20 m from B's route.
insert into public.flood_reports (id, client_id, severity, status, location, expires_at, geo_cell) values
  ('cccccccc-0000-4000-8000-000000000071', gen_random_uuid(), 'dangerous', 'active', st_setsrid(st_makepoint(121.03019, 14.7500), 4326)::geography, now() + interval '6 hours', ''),
  ('cccccccc-0000-4000-8000-000000000072', gen_random_uuid(), 'passable',  'active', st_setsrid(st_makepoint(121.03019, 14.7510), 4326)::geography, now() + interval '3 hours', ''),
  ('cccccccc-0000-4000-8000-000000000073', gen_random_uuid(), 'caution',   'active', st_setsrid(st_makepoint(121.03019, 14.7520), 4326)::geography, now() + interval '4 hours', ''),
  ('cccccccc-0000-4000-8000-000000000074', gen_random_uuid(), 'impassable','active', st_setsrid(st_makepoint(121.03019, 14.7530), 4326)::geography, now() + interval '6 hours', ''),
  ('cccccccc-0000-4000-8000-000000000075', gen_random_uuid(), 'dangerous', 'active', st_setsrid(st_makepoint(121.0500, 14.7500), 4326)::geography, now() + interval '6 hours', '');
insert into public.report_authors (report_id, user_id) values
  ('cccccccc-0000-4000-8000-000000000071', 'aaaaaaaa-0000-4000-8000-000000000071'),
  ('cccccccc-0000-4000-8000-000000000072', 'aaaaaaaa-0000-4000-8000-000000000071'),
  ('cccccccc-0000-4000-8000-000000000073', 'aaaaaaaa-0000-4000-8000-000000000071'),
  ('cccccccc-0000-4000-8000-000000000074', 'aaaaaaaa-0000-4000-8000-000000000071'),
  ('cccccccc-0000-4000-8000-000000000075', 'aaaaaaaa-0000-4000-8000-000000000071');

-- Use a fixed daytime instant so quiet hours do not depend on when the tests run.
-- 2026-09-05 14:00 Manila = 06:00 UTC.
select is(
  public.enqueue_for_report('cccccccc-0000-4000-8000-000000000071', 'new_report', 't', 'b {route}', '2026-09-05 06:00+00'),
  1, 'a dangerous report on the route queues one push for the watcher');
select is(
  (select kind || ':' || status from public.notification_outbox where user_id = 'aaaaaaaa-0000-4000-8000-000000000072' limit 1),
  'new_report:pending', 'the queued row is a pending new_report');
select is(
  public.enqueue_for_report('cccccccc-0000-4000-8000-000000000074', 'new_report', 't', 'b {route}', '2026-09-05 06:10+00'),
  0, 'a second push for the same route within 30 minutes is throttled');
select is(
  public.enqueue_for_report('cccccccc-0000-4000-8000-000000000072', 'new_report', 't', 'b {route}', '2026-09-05 07:00+00'),
  0, 'a passable report is below the default caution threshold');
-- 2026-09-05 02:00 Manila = 2026-09-04 18:00 UTC, inside the 23:00-06:00 quiet window.
select is(
  public.enqueue_for_report('cccccccc-0000-4000-8000-000000000073', 'new_report', 't', 'b {route}', '2026-09-04 18:00+00'),
  0, 'a caution report during quiet hours is suppressed');
select is(
  public.enqueue_for_report('cccccccc-0000-4000-8000-000000000074', 'new_report', 't', 'b {route}', '2026-09-04 18:30+00'),
  1, 'an impassable report gets through quiet hours');
select is(
  public.enqueue_for_report('cccccccc-0000-4000-8000-000000000075', 'new_report', 't', 'b {route}', '2026-09-05 09:00+00'),
  0, 'a report 2 km from the route does not match');

-- The watcher's own report never notifies the watcher.
insert into public.flood_reports (id, client_id, severity, status, location, expires_at, geo_cell) values
  ('cccccccc-0000-4000-8000-000000000076', gen_random_uuid(), 'impassable', 'active', st_setsrid(st_makepoint(121.03019, 14.7540), 4326)::geography, now() + interval '6 hours', '');
insert into public.report_authors (report_id, user_id) values ('cccccccc-0000-4000-8000-000000000076', 'aaaaaaaa-0000-4000-8000-000000000072');
select is(
  public.enqueue_for_report('cccccccc-0000-4000-8000-000000000076', 'new_report', 't', 'b {route}', '2026-09-05 10:00+00'),
  0, 'the author of a report is not notified about it');

select * from finish();
rollback;
