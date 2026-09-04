-- round(double precision) in Postgres rounds half to even (30.5 -> 30), which is surprising in an
-- "explainable" score. Round via numeric (half away from zero) so SQL, TypeScript and humans agree.
set search_path = public, extensions;

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

  v_score := greatest(0, least(100, round(v_raw::numeric)::integer));

  score := v_score::smallint;
  level := case when v_score >= 70 then 'high'
                when v_score >= 40 then 'medium'
                else 'low' end::public.confidence_level;
  reasons := array_remove(array[
    case
      when v_age < 60 then format('%s %s min ago',
        case when p_confirmed_later then 'Last confirmed' else 'Reported' end, round(v_age::numeric)::integer)
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
