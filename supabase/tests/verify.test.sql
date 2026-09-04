-- pgTAP: verify_report rules and lifecycle transitions.
begin;
select plan(15);

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
select ('a' || lpad(i::text, 7, '0') || '-0000-4000-8000-000000000031')::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now()
from generate_series(1, 5) i;

-- Author is user 1; report in Quezon City.
insert into public.flood_reports (id, client_id, severity, location, expires_at, geo_cell)
values ('cccccccc-0000-4000-8000-000000000031', gen_random_uuid(), 'dangerous',
        st_setsrid(st_makepoint(121.0300, 14.7500), 4326)::geography, now() + interval '6 hours', '');
insert into public.report_authors (report_id, user_id)
values ('cccccccc-0000-4000-8000-000000000031', 'a0000001-0000-4000-8000-000000000031');

create temp table claims (n int, j text);
grant select on claims to authenticated;
insert into claims select i, format('{"sub":"a%s-0000-4000-8000-000000000031","role":"authenticated","is_anonymous":true}', lpad(i::text, 7, '0')) from generate_series(1,5) i;

-- Author cannot verify own report.
set local role authenticated;
select set_config('request.jwt.claims', (select j from claims where n = 1), true);
select throws_ok(
  $$ select public.verify_report(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000031', 'confirm', 14.7500, 121.0300) $$,
  'P0001', null, 'the author cannot verify their own report');

-- User 2, too far away.
select set_config('request.jwt.claims', (select j from claims where n = 2), true);
select throws_ok(
  $$ select public.verify_report(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000031', 'confirm', 14.6000, 121.0300) $$,
  'P0001', null, 'verifying from more than 1 km away is rejected');
select throws_ok(
  $$ select public.verify_report(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000031', 'confirm', null, null) $$,
  'P0001', null, 'verifying without a location is rejected');

-- User 2 confirms from nearby.
select lives_ok(
  $$ select public.verify_report('eeeeeeee-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000031', 'confirm', 14.7505, 121.0305) $$,
  'a nearby user can confirm');
select throws_ok(
  $$ select public.verify_report(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000031', 'confirm', 14.7505, 121.0305) $$,
  'P0001', null, 'the same kind twice within 6 h is rejected');
select lives_ok(
  $$ select public.verify_report('eeeeeeee-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000031', 'confirm', 14.7505, 121.0305) $$,
  'retrying the same client_id is idempotent');

reset role;
select is((select confirm_count from public.flood_reports where id = 'cccccccc-0000-4000-8000-000000000031'), 1, 'confirm_count is denormalised');
select is((select count(*) from public.report_verifications where report_id = 'cccccccc-0000-4000-8000-000000000031'), 1::bigint, 'the retry did not insert twice');
select ok((select confidence_score from public.flood_reports where id = 'cccccccc-0000-4000-8000-000000000031') >= 55, 'confidence rose after a confirmation');
select is((select reports_confirmed from public.profiles where id = 'a0000001-0000-4000-8000-000000000031'), 1, 'author reputation counts the first confirmation');

-- Users 3 and 4 say it cleared: 2 clears >= 1 confirm -> disputed.
set local role authenticated;
select set_config('request.jwt.claims', (select j from claims where n = 3), true);
select public.verify_report(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000031', 'clear', 14.7505, 121.0305);
select set_config('request.jwt.claims', (select j from claims where n = 4), true);
select public.verify_report(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000031', 'clear', 14.7505, 121.0305);
reset role;
select is((select status from public.flood_reports where id = 'cccccccc-0000-4000-8000-000000000031'), 'disputed'::public.report_status, 'two clears against one confirm marks the report disputed');
select is((select confidence_level from public.flood_reports where id = 'cccccccc-0000-4000-8000-000000000031'), 'low'::public.confidence_level, 'disputed reports are capped at low confidence');
select is((select reports_disputed from public.profiles where id = 'a0000001-0000-4000-8000-000000000031'), 1, 'author reputation counts the dispute');

-- Third clear with the only confirm older than 60 min -> resolved. Age the confirm first.
update public.report_verifications set created_at = now() - interval '2 hours' where kind = 'confirm';
set local role authenticated;
select set_config('request.jwt.claims', (select j from claims where n = 5), true);
select public.verify_report(gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000031', 'clear', 14.7505, 121.0305);
reset role;
select is((select status from public.flood_reports where id = 'cccccccc-0000-4000-8000-000000000031'), 'resolved'::public.report_status, 'three clears with no recent confirmation resolve the report');

-- Sweep: an expired active report becomes stale.
insert into public.flood_reports (id, client_id, severity, location, expires_at, geo_cell)
values ('cccccccc-0000-4000-8000-000000000032', gen_random_uuid(), 'caution',
        st_setsrid(st_makepoint(121.0400, 14.7600), 4326)::geography, now() - interval '1 minute', '');
select public.sweep_statuses();
select is((select status from public.flood_reports where id = 'cccccccc-0000-4000-8000-000000000032'), 'stale'::public.report_status, 'the sweep marks expired reports stale');

select * from finish();
rollback;
