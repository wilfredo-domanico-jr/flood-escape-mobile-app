-- pgTAP: delete_my_data removes only the caller's footprint.
begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000041', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000042', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());

insert into public.flood_reports (id, client_id, severity, location, expires_at, geo_cell) values
  ('cccccccc-0000-4000-8000-000000000041', gen_random_uuid(), 'caution', st_setsrid(st_makepoint(121.03, 14.75), 4326)::geography, now() + interval '6 hours', ''),
  ('cccccccc-0000-4000-8000-000000000042', gen_random_uuid(), 'caution', st_setsrid(st_makepoint(121.04, 14.76), 4326)::geography, now() + interval '6 hours', '');
insert into public.report_authors (report_id, user_id) values
  ('cccccccc-0000-4000-8000-000000000041', 'aaaaaaaa-0000-4000-8000-000000000041'),
  ('cccccccc-0000-4000-8000-000000000042', 'bbbbbbbb-0000-4000-8000-000000000042');
insert into public.report_verifications (client_id, report_id, user_id, kind) values
  (gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000042', 'aaaaaaaa-0000-4000-8000-000000000041', 'confirm'),
  (gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000041', 'bbbbbbbb-0000-4000-8000-000000000042', 'confirm');

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000041","role":"authenticated","is_anonymous":true}';
select lives_ok($$ select public.delete_my_data() $$, 'delete_my_data runs for the caller');
reset role;

select is((select count(*) from public.flood_reports where id = 'cccccccc-0000-4000-8000-000000000041'), 0::bigint, 'the caller''s report is gone');
select is((select count(*) from public.flood_reports where id = 'cccccccc-0000-4000-8000-000000000042'), 1::bigint, 'other users'' reports remain');
select is((select count(*) from public.report_verifications where user_id = 'aaaaaaaa-0000-4000-8000-000000000041'), 0::bigint, 'the caller''s votes are gone');

select * from finish();
rollback;
