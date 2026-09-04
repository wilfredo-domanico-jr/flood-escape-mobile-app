-- Flood reports: the public-safe base table (no reporter identity), the private author link,
-- media, an audit table, public views, and the viewport/radius read RPCs.

-- PostGIS lives in the extensions schema; make its types visible for this migration script.
set search_path = public, extensions;

-- Coarse grid cell (0.05 deg, about 5.5 km at Manila) used to scope Realtime subscriptions.
-- Mirrored in src/lib/geo/cells.ts. Keep the formats identical.
create or replace function public.geo_cell_for(p_location geography)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select to_char(floor(st_y(p_location::geometry) / 0.05) * 0.05, 'FM9990.00')
      || '_'
      || to_char(floor(st_x(p_location::geometry) / 0.05) * 0.05, 'FM9990.00');
$$;

create table public.flood_reports (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null unique,
  severity            public.flood_severity not null,
  status              public.report_status not null default 'active',
  location            geography(Point, 4326) not null,
  location_accuracy_m real check (location_accuracy_m is null or location_accuracy_m >= 0),
  geo_cell            text not null,
  description         text check (description is null or char_length(description) <= 500),
  has_photo           boolean not null default false,
  confirm_count       integer not null default 0 check (confirm_count >= 0),
  clear_count         integer not null default 0 check (clear_count >= 0),
  nearby_report_count integer not null default 0 check (nearby_report_count >= 0),
  confidence_score    smallint not null default 0 check (confidence_score between 0 and 100),
  confidence_level    public.confidence_level not null default 'low',
  confidence_reasons  text[] not null default '{}',
  created_at          timestamptz not null default now(),
  last_confirmed_at   timestamptz not null default now(),
  expires_at          timestamptz not null,
  resolved_at         timestamptz,
  updated_at          timestamptz not null default now(),
  -- Philippines bounding box. Widen in a later migration if the app expands.
  constraint flood_reports_in_region check (
    st_y(location::geometry) between 4 and 22 and st_x(location::geometry) between 116 and 127
  )
);

comment on table public.flood_reports is
  'Crowdsourced flood reports. Safe to expose: contains no reporter identity.';

create index flood_reports_location_gix on public.flood_reports using gist (location);
create index flood_reports_active_gix on public.flood_reports using gist (location)
  where status in ('active', 'disputed');
create index flood_reports_geo_cell_idx on public.flood_reports (geo_cell, created_at desc);
create index flood_reports_created_idx on public.flood_reports (created_at desc);
create index flood_reports_status_expires_idx on public.flood_reports (status, expires_at);

create or replace function public.flood_reports_before_write()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if tg_op = 'INSERT' or new.location::text is distinct from old.location::text then
    new.geo_cell = public.geo_cell_for(new.location);
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

create trigger flood_reports_before_write
  before insert or update on public.flood_reports
  for each row execute function public.flood_reports_before_write();

-- Private: who reported what. Never exposed to other users; not in the Realtime publication.
create table public.report_authors (
  report_id           uuid primary key references public.flood_reports (id) on delete cascade,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  reputation_snapshot real not null default 0.5 check (reputation_snapshot between 0 and 1),
  created_at          timestamptz not null default now()
);

create index report_authors_user_idx on public.report_authors (user_id, created_at desc);

create table public.report_media (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.flood_reports (id) on delete cascade,
  storage_path text not null unique,
  width        integer check (width is null or width > 0),
  height       integer check (height is null or height > 0),
  bytes        integer check (bytes is null or bytes between 1 and 2097152),
  created_at   timestamptz not null default now()
);

create index report_media_report_idx on public.report_media (report_id);

-- Audit of every lifecycle transition. Service-only; used for debugging and counter rebuilds.
create table public.report_events (
  id          bigint generated always as identity primary key,
  report_id   uuid not null references public.flood_reports (id) on delete cascade,
  event       text not null,
  from_status public.report_status,
  to_status   public.report_status,
  actor_id    uuid,
  created_at  timestamptz not null default now()
);

create index report_events_report_idx on public.report_events (report_id, created_at);

-- Row level security -------------------------------------------------------------------

alter table public.flood_reports enable row level security;
alter table public.report_authors enable row level security;
alter table public.report_media enable row level security;
alter table public.report_events enable row level security;

create policy flood_reports_select on public.flood_reports
  for select to authenticated using (true);

create policy report_authors_select_own on public.report_authors
  for select to authenticated using (user_id = (select auth.uid()));

create policy report_media_select on public.report_media
  for select to authenticated using (true);

-- No policies on report_events: service role only.

revoke all on table public.flood_reports, public.report_authors, public.report_media, public.report_events
  from anon, authenticated;
grant select on table public.flood_reports, public.report_authors, public.report_media to authenticated;

-- Views -----------------------------------------------------------------------------------

-- Public projection: lat/lng as plain floats, first photo path, and a status that already
-- reflects expiry even if the cron sweep has not run yet.
create view public.public_flood_reports
with (security_invoker = true)
as
select
  r.id,
  r.severity,
  case
    when r.status in ('resolved', 'disputed') then r.status
    when r.expires_at < now() then 'stale'::public.report_status
    else r.status
  end as effective_status,
  r.status as stored_status,
  st_y(r.location::geometry) as lat,
  st_x(r.location::geometry) as lng,
  r.location_accuracy_m,
  r.geo_cell,
  r.description,
  r.has_photo,
  (select m.storage_path from public.report_media m
    where m.report_id = r.id order by m.created_at limit 1) as photo_path,
  r.confirm_count,
  r.clear_count,
  r.nearby_report_count,
  r.confidence_score,
  r.confidence_level,
  r.confidence_reasons,
  r.created_at,
  r.last_confirmed_at,
  r.expires_at,
  r.resolved_at,
  r.updated_at
from public.flood_reports r;

-- The caller's own reports (RLS on report_authors restricts the join to their rows).
create view public.my_reports
with (security_invoker = true)
as
select p.*, a.user_id as reporter_id
from public.public_flood_reports p
join public.report_authors a on a.report_id = p.id;

grant select on public.public_flood_reports, public.my_reports to authenticated;

-- Read RPCs -------------------------------------------------------------------------------

-- Reports inside the visible map region. Client clamps the region to about 0.5 deg and caps results.
create or replace function public.reports_in_bbox(
  p_min_lat       double precision,
  p_min_lng       double precision,
  p_max_lat       double precision,
  p_max_lng       double precision,
  p_include_stale boolean default true,
  p_limit         integer default 200
)
returns setof public.public_flood_reports
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select p.*
  from public.public_flood_reports p
  join public.flood_reports r on r.id = p.id
  where r.location && st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)::geography
    and (r.status in ('active', 'disputed') or (p_include_stale and r.status = 'stale'))
    and r.created_at > now() - interval '24 hours'
  order by r.confidence_score desc, r.created_at desc
  limit least(greatest(p_limit, 1), 500);
$$;

-- Active reports within a radius of a point, nearest first (KNN on the GiST index).
create or replace function public.reports_near(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m integer default 2000,
  p_limit    integer default 100
)
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
  with origin as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g
  )
  select p.*, st_distance(r.location, origin.g) as distance_m
  from origin, public.public_flood_reports p
  join public.flood_reports r on r.id = p.id
  where r.status in ('active', 'disputed')
    and st_dwithin(r.location, origin.g, least(greatest(p_radius_m, 50), 10000))
  order by r.location <-> origin.g
  limit least(greatest(p_limit, 1), 500);
$$;

grant execute on function public.reports_in_bbox(double precision, double precision, double precision, double precision, boolean, integer) to authenticated;
grant execute on function public.reports_near(double precision, double precision, integer, integer) to authenticated;
