-- Route safety: reports near a route line, saved routes for alerts, and service-only tables the
-- route-safety Edge Function uses for caching provider responses and rate limiting.
set search_path = public, extensions;

-- Parses a GeoJSON LineString and validates its size. Raises on anything else.
create or replace function public.route_from_geojson(p_geojson text)
returns geography
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  g geometry;
begin
  begin
    g := st_setsrid(st_geomfromgeojson(p_geojson), 4326);
  exception when others then
    raise exception 'invalid_route' using errcode = '22023', hint = 'Route must be a GeoJSON LineString.';
  end;
  if geometrytype(g) <> 'LINESTRING' or st_npoints(g) < 2 or st_npoints(g) > 2000 then
    raise exception 'invalid_route' using errcode = '22023', hint = 'Route must be a LineString with 2 to 2000 points.';
  end if;
  return g::geography;
end;
$$;

-- Active/disputed reports within p_buffer_m of the route, nearest first. The client splits hits
-- into "on route" (<= 75 m) and "near route" (<= 300 m) and classifies risk from them.
create or replace function public.reports_along_route(p_route_geojson text, p_buffer_m integer default 300)
returns table (
  id uuid,
  severity public.flood_severity,
  effective_status public.report_status,
  stored_status public.report_status,
  lat double precision,
  lng double precision,
  location_accuracy_m real,
  geo_cell text,
  description text,
  has_photo boolean,
  photo_path text,
  confirm_count integer,
  clear_count integer,
  nearby_report_count integer,
  confidence_score smallint,
  confidence_level public.confidence_level,
  confidence_reasons text[],
  created_at timestamptz,
  last_confirmed_at timestamptz,
  expires_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz,
  distance_m double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with route as (select public.route_from_geojson(p_route_geojson) as g)
  select p.*, st_distance(r.location, route.g) as distance_m
  from route, public.public_flood_reports p
  join public.flood_reports r on r.id = p.id
  where r.status in ('active', 'disputed')
    and st_dwithin(r.location, route.g, least(greatest(p_buffer_m, 25), 500))
  order by distance_m
  limit 100;
$$;

create table public.saved_routes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 60),
  origin_label      text check (origin_label is null or char_length(origin_label) <= 120),
  destination_label text check (destination_label is null or char_length(destination_label) <= 120),
  route_line        geography(LineString, 4326) not null,
  buffer_m          smallint not null default 75 check (buffer_m between 25 and 500),
  notify            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint saved_routes_points check (st_npoints(route_line::geometry) between 2 and 2000)
);

create index saved_routes_user_idx on public.saved_routes (user_id, created_at desc);
create index saved_routes_line_gix on public.saved_routes using gist (route_line) where notify;

create trigger saved_routes_set_updated_at
  before update on public.saved_routes
  for each row execute function public.set_updated_at();

-- At most 10 saved routes per user.
create or replace function public.saved_routes_cap()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.saved_routes where user_id = new.user_id) >= 10 then
    raise exception 'too_many_routes' using errcode = 'P0001', hint = 'You can save up to 10 routes. Remove one first.';
  end if;
  return new;
end;
$$;

create trigger saved_routes_cap
  before insert on public.saved_routes
  for each row execute function public.saved_routes_cap();

alter table public.saved_routes enable row level security;
create policy saved_routes_own on public.saved_routes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on table public.saved_routes from anon, authenticated;
grant select, update (name, notify, buffer_m), delete on table public.saved_routes to authenticated;

-- Inserts go through an RPC so the GeoJSON is validated and the caller cannot spoof user_id.
create or replace function public.save_route(
  p_name              text,
  p_route_geojson     text,
  p_origin_label      text default null,
  p_destination_label text default null
)
returns table (id uuid, name text, origin_label text, destination_label text, notify boolean, created_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  insert into public.saved_routes (user_id, name, origin_label, destination_label, route_line)
  values (v_uid, btrim(p_name), p_origin_label, p_destination_label, public.route_from_geojson(p_route_geojson))
  returning saved_routes.id into v_id;
  return query
    select s.id, s.name, s.origin_label, s.destination_label, s.notify, s.created_at
    from public.saved_routes s where s.id = v_id;
end;
$$;

-- Saved routes as GeoJSON for the client (geography would arrive as WKB).
create or replace view public.my_saved_routes
with (security_invoker = true)
as
select id, name, origin_label, destination_label, buffer_m, notify, created_at, updated_at,
       st_asgeojson(route_line)::jsonb as route_geojson
from public.saved_routes;

grant select on public.my_saved_routes to authenticated;

-- Service-only tables for the Edge Function.
create table public.route_cache (
  cache_key  text primary key,
  response   jsonb not null,
  created_at timestamptz not null default now()
);
create table public.route_requests (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  created_at timestamptz not null default now()
);
create index route_requests_user_idx on public.route_requests (user_id, created_at desc);
alter table public.route_cache enable row level security;
alter table public.route_requests enable row level security;
revoke all on table public.route_cache, public.route_requests from anon, authenticated;

grant execute on function public.reports_along_route(text, integer) to authenticated;
grant execute on function public.save_route(text, text, text, text) to authenticated;
-- Pure validation; invoker-security RPCs call it on behalf of users.
grant execute on function public.route_from_geojson(text) to authenticated;
