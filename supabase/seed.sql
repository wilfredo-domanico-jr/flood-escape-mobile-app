-- Local development seed. Applied by `supabase db reset` / `supabase start` only.
-- Creates one seed reporter and a handful of reports around Marikina / Pasig.

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', null, true, now(), now())
on conflict (id) do nothing;

with seed(client_id, severity, status, lat, lng, accuracy, description, age, confirms, clears, score, level, reasons) as (
  values
    ('10000000-0000-4000-8000-000000000001'::uuid, 'impassable'::public.flood_severity, 'active'::public.report_status,
      14.6337, 121.0988, 12, 'Waist-deep along Shoe Ave near the sports center', interval '25 minutes', 3, 0, 84, 'high'::public.confidence_level,
      array['Reported 25 min ago', '3 people confirmed', 'Photo attached']),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'dangerous', 'active',
      14.6284, 121.0951, 30, 'Knee-deep, motorcycles turning back', interval '1 hour 10 minutes', 1, 0, 52, 'medium',
      array['Reported 1.2 h ago', '1 person confirmed']),
    ('10000000-0000-4000-8000-000000000003'::uuid, 'caution', 'active',
      14.6410, 121.1060, 55, 'Ankle-deep at the corner, still passable for cars', interval '15 minutes', 0, 0, 44, 'medium',
      array['Reported 15 min ago']),
    ('10000000-0000-4000-8000-000000000004'::uuid, 'passable', 'stale',
      14.6200, 121.0900, 20, null, interval '7 hours', 0, 0, 9, 'low',
      array['Reported 7 h ago']),
    ('10000000-0000-4000-8000-000000000005'::uuid, 'dangerous', 'disputed',
      14.6100, 121.0800, 18, 'Reported flooded near the bridge', interval '2 hours', 1, 2, 22, 'low',
      array['Reported 2 h ago', '1 person confirmed', '2 say it has cleared'])
)
insert into public.flood_reports
  (client_id, severity, status, location, location_accuracy_m, description,
   confirm_count, clear_count, confidence_score, confidence_level, confidence_reasons,
   created_at, last_confirmed_at, expires_at, geo_cell)
select client_id, severity, status,
       st_setsrid(st_makepoint(lng, lat), 4326)::geography, accuracy, description,
       confirms, clears, score, level, reasons,
       now() - age, now() - age, now() - age + interval '6 hours', ''
from seed
on conflict (client_id) do nothing;

insert into public.report_authors (report_id, user_id)
select id, '00000000-0000-4000-8000-000000000001' from public.flood_reports
on conflict (report_id) do nothing;
