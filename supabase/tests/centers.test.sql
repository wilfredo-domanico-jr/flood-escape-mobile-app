-- pgTAP: evacuation_centers_near ordering, filtering and access.
begin;
select plan(5);

-- Anonymous (no session) can read facilities: they matter most when things go wrong.
set local role anon;
select ok((select count(*) from public.evacuation_centers) > 10, 'facilities are readable by anon');

select is(
  (select name from public.evacuation_centers_near(14.6335, 121.0987, null, 1)),
  'Marikina Sports Center',
  'the nearest facility to the Marikina Sports Center is itself');

select is(
  (select kind from public.evacuation_centers_near(14.6335, 121.0987, array['hospital'], 1)),
  'hospital',
  'kind filtering works');

select ok(
  (select bool_and(a.distance_m <= b.distance_m)
   from (select distance_m, row_number() over () as n from public.evacuation_centers_near(14.60, 121.05, null, 10)) a
   join (select distance_m, row_number() over () as n from public.evacuation_centers_near(14.60, 121.05, null, 10)) b
     on b.n = a.n + 1),
  'results are ordered by distance');

reset role;
select throws_ok(
  $$ set local role authenticated; insert into public.evacuation_centers (kind, name, location)
     values ('hospital', 'x', st_setsrid(st_makepoint(121, 14.6), 4326)::geography) $$,
  '42501', null, 'clients cannot insert facilities');

select * from finish();
rollback;
