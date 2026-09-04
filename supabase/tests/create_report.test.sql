-- pgTAP: create_flood_report rules (validation, idempotency, duplicate folding, rate limit),
-- attach_report_media authorship, and confidence side effects. Run with `npm run test:db`.
begin;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.com', false, now(), now());

-- Act as anonymous user A (Quezon City, far from seed data).
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000011","role":"authenticated","is_anonymous":true}';

select throws_ok(
  $$ select * from public.create_flood_report('dddddddd-0000-4000-8000-000000000001', 0, 0, 'caution') $$,
  '22023', null, 'coordinates outside the region are rejected');

select throws_ok(
  $$ select * from public.create_flood_report('dddddddd-0000-4000-8000-000000000001', 14.75, 121.03, 'caution', 10, repeat('x', 501)) $$,
  '22023', null, 'descriptions over 500 characters are rejected');

select lives_ok(
  $$ select * from public.create_flood_report('dddddddd-0000-4000-8000-000000000001', 14.7500, 121.0300, 'dangerous', 12, '  Knee deep  ') $$,
  'a valid report is created');

select is(
  (select description from public.flood_reports where client_id = 'dddddddd-0000-4000-8000-000000000001'),
  'Knee deep', 'description is trimmed');

select is(
  (select confidence_level from public.flood_reports where client_id = 'dddddddd-0000-4000-8000-000000000001'),
  'medium'::public.confidence_level, 'a fresh unconfirmed report starts at medium confidence');

select is(
  (select count(*) from public.flood_reports where client_id = 'dddddddd-0000-4000-8000-000000000001'),
  1::bigint, 'exactly one row exists for the client_id');

-- Retry with the same client_id returns the same report instead of creating another.
select is(
  (select id from public.create_flood_report('dddddddd-0000-4000-8000-000000000001', 14.7500, 121.0300, 'dangerous', 12, 'Knee deep')),
  (select id from public.flood_reports where client_id = 'dddddddd-0000-4000-8000-000000000001'),
  'retrying with the same client_id is idempotent');

-- A new client_id within 50 m by the same user folds into the existing report.
select is(
  (select id from public.create_flood_report('dddddddd-0000-4000-8000-000000000002', 14.7501, 121.0301, 'impassable', 8, null)),
  (select id from public.flood_reports where client_id = 'dddddddd-0000-4000-8000-000000000001'),
  'a same-user duplicate within 50 m re-confirms the existing report');

select is(
  (select severity from public.flood_reports where client_id = 'dddddddd-0000-4000-8000-000000000001'),
  'impassable'::public.flood_severity, 'folding updates the severity');

reset role;
select is(
  (select count(*) from public.report_events where event = 'duplicate_folded'),
  1::bigint, 'folding is recorded in the audit table');
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000011","role":"authenticated","is_anonymous":true}';

-- Anonymous rate limit: 3 per 15 minutes. One exists; two more at distinct spots are fine, the fourth fails.
select lives_ok(
  $$ select * from public.create_flood_report('dddddddd-0000-4000-8000-000000000003', 14.7600, 121.0400, 'caution') $$,
  'second distinct report allowed');
select lives_ok(
  $$ select * from public.create_flood_report('dddddddd-0000-4000-8000-000000000004', 14.7700, 121.0500, 'caution') $$,
  'third distinct report allowed');
select throws_ok(
  $$ select * from public.create_flood_report('dddddddd-0000-4000-8000-000000000005', 14.7800, 121.0600, 'caution') $$,
  'P0001', null, 'the fourth report inside 15 minutes is rate limited for anonymous users');

-- Media: another user cannot attach to A's report.
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-4000-8000-000000000012","role":"authenticated","is_anonymous":false}';
select throws_ok(
  format($$ select public.attach_report_media('%s', 'reports/%s.jpg', 1280, 960, 200000) $$,
    (select id from public.flood_reports where client_id = 'dddddddd-0000-4000-8000-000000000001'),
    (select id from public.flood_reports where client_id = 'dddddddd-0000-4000-8000-000000000001')),
  '42501', null, 'only the author can attach media');

select * from finish();
rollback;
