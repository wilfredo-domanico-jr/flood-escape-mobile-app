-- pgTAP: flood_reports privacy and read RPCs. Run with `npm run test:db`.
begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());

insert into public.flood_reports (id, client_id, severity, location, expires_at, geo_cell)
values
  ('cccccccc-0000-4000-8000-000000000001', gen_random_uuid(), 'dangerous',
    st_setsrid(st_makepoint(121.0300, 14.7500), 4326)::geography, now() + interval '6 hours', ''),
  ('cccccccc-0000-4000-8000-000000000002', gen_random_uuid(), 'caution',
    st_setsrid(st_makepoint(121.0400, 14.7600), 4326)::geography, now() - interval '1 hour', '');

insert into public.report_authors (report_id, user_id) values
  ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002');

select is(
  (select geo_cell from public.flood_reports where id = 'cccccccc-0000-4000-8000-000000000001'),
  '14.75_121.00',
  'geo_cell is computed by trigger in the documented format'
);

select is(
  (select effective_status from public.public_flood_reports where id = 'cccccccc-0000-4000-8000-000000000002'),
  'stale'::public.report_status,
  'view reports stale as soon as expires_at passes, before any cron sweep'
);

select throws_ok(
  $$ insert into public.flood_reports (client_id, severity, location, expires_at, geo_cell)
     values (gen_random_uuid(), 'caution', st_setsrid(st_makepoint(0, 0), 4326)::geography, now(), '') $$,
  '23514',
  null,
  'coordinates outside the Philippines are rejected'
);

-- Act as user A.
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}';

select is((select count(*) from public.flood_reports where id in ('cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002')), 2::bigint, 'any user can read every report');
select is((select count(*) from public.report_authors), 1::bigint, 'a user sees only their own author rows');
select is((select count(*) from public.my_reports), 1::bigint, 'my_reports shows only the caller''s reports');
select throws_ok(
  $$ select count(*) from public.report_events $$,
  '42501',
  null,
  'report_events is not readable by clients'
);
select throws_ok(
  $$ insert into public.flood_reports (client_id, severity, location, expires_at, geo_cell)
     values (gen_random_uuid(), 'caution', st_setsrid(st_makepoint(121.0, 14.6), 4326)::geography, now(), '') $$,
  '42501',
  null,
  'clients cannot insert reports directly'
);

select is(
  (select count(*) from public.reports_in_bbox(14.7, 121.0, 14.8, 121.1, true, 100)),
  2::bigint,
  'reports_in_bbox returns active and stale reports in the box'
);
select is(
  (select id from public.reports_near(14.7501, 121.0301, 2000, 10) limit 1),
  'cccccccc-0000-4000-8000-000000000001'::uuid,
  'reports_near returns the active report nearest first and excludes stale ones'
);

select * from finish();
rollback;
