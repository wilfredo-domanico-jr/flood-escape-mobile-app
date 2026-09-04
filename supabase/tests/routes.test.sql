-- pgTAP: reports_along_route buffering and saved_routes rules.
begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000051', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());

-- A north-south route along lng 121.0300 from 14.7400 to 14.7600 (Quezon City, away from seeds).
-- Report A sits 20 m east of the line, report B about 250 m east, report C 2 km away, D is stale.
insert into public.flood_reports (id, client_id, severity, status, location, expires_at, geo_cell) values
  ('cccccccc-0000-4000-8000-000000000051', gen_random_uuid(), 'impassable', 'active', st_setsrid(st_makepoint(121.03019, 14.7500), 4326)::geography, now() + interval '6 hours', ''),
  ('cccccccc-0000-4000-8000-000000000052', gen_random_uuid(), 'caution',    'active', st_setsrid(st_makepoint(121.03232, 14.7520), 4326)::geography, now() + interval '6 hours', ''),
  ('cccccccc-0000-4000-8000-000000000053', gen_random_uuid(), 'dangerous',  'active', st_setsrid(st_makepoint(121.0500, 14.7500), 4326)::geography, now() + interval '6 hours', ''),
  ('cccccccc-0000-4000-8000-000000000054', gen_random_uuid(), 'dangerous',  'stale',  st_setsrid(st_makepoint(121.03010, 14.7450), 4326)::geography, now() - interval '1 hour', '');

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000051","role":"authenticated","is_anonymous":true}';

select is(
  (select count(*) from public.reports_along_route('{"type":"LineString","coordinates":[[121.03,14.74],[121.03,14.76]]}', 300)),
  2::bigint,
  'only active reports within the buffer are returned');

select is(
  (select id from public.reports_along_route('{"type":"LineString","coordinates":[[121.03,14.74],[121.03,14.76]]}', 300) limit 1),
  'cccccccc-0000-4000-8000-000000000051'::uuid,
  'the nearest report comes first');

select ok(
  (select distance_m from public.reports_along_route('{"type":"LineString","coordinates":[[121.03,14.74],[121.03,14.76]]}', 300) limit 1) < 75,
  'the on-route report is within 75 m');

select throws_ok(
  $$ select * from public.reports_along_route('{"type":"Point","coordinates":[121.03,14.74]}', 300) $$,
  '22023', null, 'non-LineString GeoJSON is rejected');

select lives_ok(
  $$ select * from public.save_route('Home to work', '{"type":"LineString","coordinates":[[121.03,14.74],[121.03,14.76]]}', 'Home', 'Work') $$,
  'a route can be saved');

select is((select count(*) from public.my_saved_routes), 1::bigint, 'the saved route is visible to its owner as GeoJSON');

select is(
  (select route_geojson ->> 'type' from public.my_saved_routes limit 1),
  'LineString', 'route_geojson is a LineString');

-- Cap at 10.
select throws_ok(
  $$ select public.save_route('r' || i, '{"type":"LineString","coordinates":[[121.03,14.74],[121.03,14.76]]}') from generate_series(2, 11) i $$,
  'P0001', null, 'the eleventh saved route is rejected');

select * from finish();
rollback;
