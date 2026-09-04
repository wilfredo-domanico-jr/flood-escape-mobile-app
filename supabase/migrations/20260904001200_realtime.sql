-- Realtime: only flood_reports is published. It carries no identity, and every derived change
-- (verification counts, confidence, status, photo) lands on this row, so one table is enough.
-- Clients filter by geo_cell (single-column filter) to scope events to their viewport.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'flood_reports'
  ) then
    alter publication supabase_realtime add table public.flood_reports;
  end if;
end;
$$;
