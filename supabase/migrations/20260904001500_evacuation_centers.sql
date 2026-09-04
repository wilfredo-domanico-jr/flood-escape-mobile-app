-- Evacuation centers, hospitals, fire and police stations. Read-only for the app; maintained by
-- migrations/seed scripts. Capacity is nullable and only shown when the source provides it.
set search_path = public, extensions;

create table public.evacuation_centers (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('evacuation', 'hospital', 'fire', 'police')),
  name              text not null check (char_length(name) between 1 and 120),
  address           text,
  city              text,
  barangay          text,
  location          geography(Point, 4326) not null,
  capacity          integer check (capacity is null or capacity > 0),
  contact           text,
  is_active         boolean not null default true,
  source            text not null default 'manual',
  source_updated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint evacuation_centers_in_region check (
    st_y(location::geometry) between 4 and 22 and st_x(location::geometry) between 116 and 127
  )
);

create index evacuation_centers_gix on public.evacuation_centers using gist (location) where is_active;
create index evacuation_centers_kind_idx on public.evacuation_centers (kind) where is_active;
create unique index evacuation_centers_name_city_idx on public.evacuation_centers (kind, name, coalesce(city, ''));

create trigger evacuation_centers_set_updated_at
  before update on public.evacuation_centers
  for each row execute function public.set_updated_at();

alter table public.evacuation_centers enable row level security;
create policy evacuation_centers_select on public.evacuation_centers
  for select to anon, authenticated using (is_active);
revoke all on table public.evacuation_centers from anon, authenticated;
grant select on table public.evacuation_centers to anon, authenticated;

-- Nearest active facilities of the requested kinds (KNN on the GiST index).
create or replace function public.evacuation_centers_near(
  p_lat   double precision,
  p_lng   double precision,
  p_kinds text[] default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  kind text,
  name text,
  address text,
  city text,
  barangay text,
  lat double precision,
  lng double precision,
  capacity integer,
  contact text,
  source text,
  source_updated_at timestamptz,
  distance_m double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with origin as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g)
  select c.id, c.kind, c.name, c.address, c.city, c.barangay,
         st_y(c.location::geometry), st_x(c.location::geometry),
         c.capacity, c.contact, c.source, c.source_updated_at,
         st_distance(c.location, origin.g)
  from origin, public.evacuation_centers c
  where c.is_active
    and (p_kinds is null or c.kind = any (p_kinds))
  order by c.location <-> origin.g
  limit least(greatest(p_limit, 1), 50);
$$;

grant execute on function public.evacuation_centers_near(double precision, double precision, text[], integer) to anon, authenticated;

-- Sample facilities around Metro Manila so the screen is useful on day one. Coordinates are
-- approximate and marked as such; replace with LGU/NDRRMC open data before relying on them.
insert into public.evacuation_centers (kind, name, address, city, location, source) values
  ('evacuation', 'Marikina Sports Center',            'Shoe Ave, Sta. Elena',             'Marikina',    st_setsrid(st_makepoint(121.0987, 14.6335), 4326)::geography, 'sample - verify'),
  ('evacuation', 'Marikina Convention Center',        'Bayan-Bayanan Ave',                'Marikina',    st_setsrid(st_makepoint(121.0964, 14.6323), 4326)::geography, 'sample - verify'),
  ('hospital',   'Amang Rodriguez Memorial Medical Center', 'Sumulong Hwy, Sto. Nino',   'Marikina',    st_setsrid(st_makepoint(121.0983, 14.6247), 4326)::geography, 'sample - verify'),
  ('fire',       'Marikina Central Fire Station',     'Shoe Ave',                         'Marikina',    st_setsrid(st_makepoint(121.0972, 14.6357), 4326)::geography, 'sample - verify'),
  ('police',     'Marikina City Police Station',      'Sta. Elena',                       'Marikina',    st_setsrid(st_makepoint(121.0966, 14.6310), 4326)::geography, 'sample - verify'),
  ('evacuation', 'Pasig City Sports Center',          'Caruncho Ave, San Nicolas',        'Pasig',       st_setsrid(st_makepoint(121.0850, 14.5747), 4326)::geography, 'sample - verify'),
  ('hospital',   'The Medical City',                  'Ortigas Ave',                      'Pasig',       st_setsrid(st_makepoint(121.0692, 14.5901), 4326)::geography, 'sample - verify'),
  ('hospital',   'Rizal Medical Center',              'Pasig Blvd',                       'Pasig',       st_setsrid(st_makepoint(121.0787, 14.5648), 4326)::geography, 'sample - verify'),
  ('fire',       'Pasig City Fire Station',           'Caruncho Ave',                     'Pasig',       st_setsrid(st_makepoint(121.0842, 14.5765), 4326)::geography, 'sample - verify'),
  ('hospital',   'East Avenue Medical Center',        'East Ave, Diliman',                'Quezon City', st_setsrid(st_makepoint(121.0489, 14.6437), 4326)::geography, 'sample - verify'),
  ('hospital',   'Philippine Heart Center',           'East Ave, Diliman',                'Quezon City', st_setsrid(st_makepoint(121.0473, 14.6444), 4326)::geography, 'sample - verify'),
  ('hospital',   'Quezon City General Hospital',      'Seminary Rd, Bahay Toro',          'Quezon City', st_setsrid(st_makepoint(121.0313, 14.6652), 4326)::geography, 'sample - verify'),
  ('evacuation', 'Bagong Silangan Elementary School', 'Bagong Silangan',                  'Quezon City', st_setsrid(st_makepoint(121.0996, 14.7003), 4326)::geography, 'sample - verify'),
  ('fire',       'Quezon City Fire Station (Central)', 'East Ave',                        'Quezon City', st_setsrid(st_makepoint(121.0491, 14.6512), 4326)::geography, 'sample - verify'),
  ('police',     'Quezon City Police District HQ',    'Camp Karingal, Sikatuna Village',  'Quezon City', st_setsrid(st_makepoint(121.0605, 14.6386), 4326)::geography, 'sample - verify'),
  ('hospital',   'Philippine General Hospital',       'Taft Ave, Ermita',                 'Manila',      st_setsrid(st_makepoint(120.9863, 14.5787), 4326)::geography, 'sample - verify'),
  ('evacuation', 'Rizal Memorial Sports Complex',     'Pablo Ocampo St, Malate',          'Manila',      st_setsrid(st_makepoint(120.9925, 14.5647), 4326)::geography, 'sample - verify'),
  ('police',     'Manila Police District HQ',         'United Nations Ave, Ermita',       'Manila',      st_setsrid(st_makepoint(120.9880, 14.5810), 4326)::geography, 'sample - verify'),
  ('fire',       'Manila Fire District (Sta. Cruz)',  'Sta. Cruz',                        'Manila',      st_setsrid(st_makepoint(120.9840, 14.6010), 4326)::geography, 'sample - verify'),
  ('evacuation', 'Malabon Amphitheater',              'F. Sevilla Blvd',                  'Malabon',     st_setsrid(st_makepoint(120.9569, 14.6621), 4326)::geography, 'sample - verify'),
  ('hospital',   'Ospital ng Malabon',                'Gov. Pascual Ave',                 'Malabon',     st_setsrid(st_makepoint(120.9580, 14.6650), 4326)::geography, 'sample - verify'),
  ('evacuation', 'Cainta Municipal Hall Covered Court', 'A. Bonifacio Ave',               'Cainta',      st_setsrid(st_makepoint(121.1223, 14.5786), 4326)::geography, 'sample - verify')
on conflict do nothing;
