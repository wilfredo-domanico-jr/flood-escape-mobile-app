-- Explainable confidence scoring and the helpers that feed it.
-- compute_confidence() is pure and mirrored exactly in src/lib/confidence/confidence.ts.
-- A fixture generated from this function is committed and both test suites assert against it.
set search_path = public, extensions;

-- How long a report stays "active" without a fresh confirmation. Severe floods persist longer;
-- a "passable" observation describes a moment. Tune here only; the client reads the same table.
create or replace function public.stale_window(p_severity public.flood_severity)
returns interval
language sql
immutable
as $$
  select case p_severity
    when 'impassable' then interval '6 hours'
    when 'dangerous'  then interval '6 hours'
    when 'caution'    then interval '4 hours'
    else                   interval '3 hours'
  end;
$$;

-- Laplace-smoothed ratio of confirmed vs disputed past reports, clamped so it can never dominate.
-- New and anonymous users sit at 0.5 (neutral).
create or replace function public.reputation_for(p_user uuid)
returns real
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select least(0.9, greatest(0.2,
        (p.reports_confirmed + 1)::real / (p.reports_confirmed + p.reports_disputed + 2)::real))
     from public.profiles p where p.id = p_user),
    0.5::real);
$$;

-- Pure scoring function. Inputs:
--   p_age_min          minutes since last confirmation (or creation)
--   p_confirms         distinct users who said "still flooded" in the last 6 h
--   p_clears           distinct users who said "no longer flooded" in the last 6 h
--   p_nearby           distinct other reporters within 150 m in the last 6 h
--   p_has_photo        evidence attached
--   p_reputation       reporter reputation in [0.2, 0.9], 0.5 = neutral
--   p_confirmed_later  whether the age refers to a confirmation rather than the original report
create or replace function public.compute_confidence(
  p_age_min         double precision,
  p_confirms        integer,
  p_clears          integer,
  p_nearby          integer,
  p_has_photo       boolean,
  p_reputation      double precision,
  p_confirmed_later boolean default false
)
returns table (score smallint, level public.confidence_level, reasons text[])
language plpgsql
immutable
as $$
declare
  v_raw   double precision;
  v_score integer;
  v_age   double precision := greatest(0, coalesce(p_age_min, 0));
begin
  v_raw := 45.0 * power(2.0, -v_age / 180.0)          -- recency, half-life 3 h, max 45
         + 12.0 * least(coalesce(p_confirms, 0), 4)   -- confirmations, max 48
         + 8.0  * least(coalesce(p_nearby, 0), 3)     -- independent nearby reports, max 24
         + case when p_has_photo then 10.0 else 0.0 end
         + 10.0 * (coalesce(p_reputation, 0.5) - 0.5) -- -3 .. +4
         - 15.0 * least(coalesce(p_clears, 0), 3);    -- contradictions, min -45

  v_score := greatest(0, least(100, round(v_raw)::integer));

  score := v_score::smallint;
  level := case when v_score >= 70 then 'high'
                when v_score >= 40 then 'medium'
                else 'low' end::public.confidence_level;
  reasons := array_remove(array[
    case
      when v_age < 60 then format('%s %s min ago',
        case when p_confirmed_later then 'Last confirmed' else 'Reported' end, round(v_age)::integer)
      else format('%s %s h ago',
        case when p_confirmed_later then 'Last confirmed' else 'Reported' end, round((v_age / 60.0)::numeric, 1))
    end,
    case when coalesce(p_confirms, 0) > 0 then
      format('%s %s confirmed', p_confirms, case when p_confirms = 1 then 'person' else 'people' end) end,
    case when coalesce(p_nearby, 0) > 0 then
      format('%s other nearby report%s', p_nearby, case when p_nearby = 1 then '' else 's' end) end,
    case when p_has_photo then 'Photo attached' end,
    case when coalesce(p_clears, 0) > 0 then
      format('%s %s it has cleared', p_clears, case when p_clears = 1 then 'person says' else 'people say' end) end,
    case when coalesce(p_reputation, 0.5) >= 0.7 then 'Trusted reporter' end
  ], null);
  return next;
end;
$$;

-- Gathers the live inputs for one report and writes the denormalised counters + confidence.
create or replace function public.recompute_confidence(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r          public.flood_reports%rowtype;
  v_author   uuid;
  v_confirms integer;
  v_clears   integer;
  v_nearby   integer;
  v_rep      double precision;
  v_age      double precision;
  v_score    smallint;
  v_level    public.confidence_level;
  v_reasons  text[];
begin
  select * into r from public.flood_reports where id = p_report_id;
  if not found then return; end if;

  select a.user_id, a.reputation_snapshot into v_author, v_rep
  from public.report_authors a where a.report_id = p_report_id;

  select count(distinct user_id) filter (where kind = 'confirm'),
         count(distinct user_id) filter (where kind = 'clear')
    into v_confirms, v_clears
  from public.report_verifications
  where report_id = p_report_id and created_at > now() - interval '6 hours';

  select count(distinct a.user_id) into v_nearby
  from public.flood_reports o
  join public.report_authors a on a.report_id = o.id
  where o.id <> p_report_id
    and o.created_at > now() - interval '6 hours'
    and (v_author is null or a.user_id <> v_author)
    and st_dwithin(o.location, r.location, 150);

  v_age := extract(epoch from (now() - r.last_confirmed_at)) / 60.0;

  select c.score, c.level, c.reasons into v_score, v_level, v_reasons
  from public.compute_confidence(
    v_age, v_confirms, v_clears, v_nearby, r.has_photo, coalesce(v_rep, 0.5),
    r.last_confirmed_at > r.created_at + interval '1 second') c;

  -- While disputed, confidence is capped at "low" regardless of the raw score.
  if r.status = 'disputed' then
    v_score := least(v_score, 39);
    v_level := 'low';
  end if;

  update public.flood_reports
     set confirm_count       = v_confirms,
         clear_count         = v_clears,
         nearby_report_count = v_nearby,
         confidence_score    = v_score,
         confidence_level    = v_level,
         confidence_reasons  = v_reasons
   where id = p_report_id;
end;
$$;

-- Photo evidence feeds confidence.
create or replace function public.report_media_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.flood_reports set has_photo = true where id = new.report_id and has_photo = false;
  perform public.recompute_confidence(new.report_id);
  return new;
end;
$$;

create trigger report_media_after_insert
  after insert on public.report_media
  for each row execute function public.report_media_after_insert();

-- Only the RPCs call these; never the client.
revoke execute on function public.recompute_confidence(uuid) from public, anon, authenticated;
revoke execute on function public.reputation_for(uuid) from public, anon, authenticated;
grant execute on function public.compute_confidence(double precision, integer, integer, integer, boolean, double precision, boolean) to authenticated;
grant execute on function public.stale_window(public.flood_severity) to authenticated;
