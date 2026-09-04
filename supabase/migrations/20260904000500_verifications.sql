-- Verification votes. Each "Still flooded" / "No longer flooded" tap is its own row; the report
-- is never overwritten. Counters and status are derived by triggers in the next migrations.
set search_path = public, extensions;

create table public.report_verifications (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null unique,
  report_id           uuid not null references public.flood_reports (id) on delete cascade,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  kind                public.verification_kind not null,
  verifier_distance_m real check (verifier_distance_m is null or verifier_distance_m >= 0),
  comment             text check (comment is null or char_length(comment) <= 200),
  created_at          timestamptz not null default now()
);

create index report_verifications_report_idx on public.report_verifications (report_id, created_at desc);
create index report_verifications_user_idx on public.report_verifications (user_id, created_at desc);

alter table public.report_verifications enable row level security;

-- Who verified is private; counts are exposed on the report instead.
create policy report_verifications_select_own on public.report_verifications
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.report_verifications from anon, authenticated;
grant select on table public.report_verifications to authenticated;
