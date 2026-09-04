-- pgTAP: report_detail exposes activity without identities and knows the caller's relation.
begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000022', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());

insert into public.flood_reports (id, client_id, severity, location, expires_at, geo_cell)
values ('cccccccc-0000-4000-8000-000000000021', gen_random_uuid(), 'dangerous',
        st_setsrid(st_makepoint(121.0300, 14.7500), 4326)::geography, now() + interval '6 hours', '');
insert into public.report_authors (report_id, user_id)
values ('cccccccc-0000-4000-8000-000000000021', 'aaaaaaaa-0000-4000-8000-000000000021');
insert into public.report_verifications (client_id, report_id, user_id, kind)
values (gen_random_uuid(), 'cccccccc-0000-4000-8000-000000000021', 'bbbbbbbb-0000-4000-8000-000000000022', 'confirm');

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000021","role":"authenticated","is_anonymous":true}';

select is(
  (public.report_detail('cccccccc-0000-4000-8000-000000000021') ->> 'is_mine')::boolean,
  true, 'the author sees is_mine = true');

select is(
  public.report_detail('cccccccc-0000-4000-8000-000000000021') -> 'my_verification',
  'null'::jsonb, 'the author has no verification of their own');

select is(
  jsonb_array_length(public.report_detail('cccccccc-0000-4000-8000-000000000021') -> 'activity'),
  1, 'activity lists other users'' verifications');

select is(
  public.report_detail('cccccccc-0000-4000-8000-000000000021') -> 'activity' -> 0 ? 'user_id',
  false, 'activity entries carry no user id');

select is(
  public.report_detail('cccccccc-0000-4000-8000-000000000021') -> 'report' ->> 'severity',
  'dangerous', 'the report payload is the public view row');

select is(
  public.report_detail('99999999-0000-4000-8000-000000000000'),
  null, 'unknown ids return null rather than an error');

select * from finish();
rollback;
