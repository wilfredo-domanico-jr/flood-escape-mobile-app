-- pgTAP tests for profiles. Run with: npx supabase test db  (requires the local stack / Docker)
begin;
select plan(9);

-- Two synthetic auth users: one anonymous, one with an email.
insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.com', false, now(), now());

select is(
  (select count(*) from public.profiles where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
  2::bigint,
  'trigger creates a profile for every new auth user'
);

select is(
  (select is_anonymous from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  true,
  'anonymous flag is copied from auth.users'
);

-- Act as user A (anonymous).
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","is_anonymous":true}';

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'a user sees only their own profile'
);

select is(
  (select id from public.profiles limit 1),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'the visible profile is the caller''s own'
);

select lives_ok(
  $$ update public.profiles set display_name = 'Juan' where id = '11111111-1111-1111-1111-111111111111' $$,
  'a user can change their own display_name'
);

select throws_ok(
  $$ update public.profiles set reports_confirmed = 99 where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'reputation counters are not client-writable'
);

select throws_ok(
  $$ insert into public.profiles (id) values ('33333333-3333-3333-3333-333333333333') $$,
  '42501',
  null,
  'clients cannot insert profiles'
);

select is(
  (select count(*) from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'another user''s profile is invisible even when addressed directly'
);

select is(
  (select id from public.get_my_profile()),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'get_my_profile returns the caller''s row'
);

select * from finish();
rollback;
