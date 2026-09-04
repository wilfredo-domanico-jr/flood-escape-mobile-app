-- Profiles: one row per auth user, created by trigger. Holds only what the app needs
-- (display name, anonymous flag, reputation counters). Never exposed to other users.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  display_name      text check (display_name is null or char_length(display_name) between 1 and 40),
  is_anonymous      boolean not null default true,
  -- Reputation counters, maintained only by triggers in later migrations.
  reports_confirmed integer not null default 0 check (reports_confirmed >= 0),
  reports_disputed  integer not null default 0 check (reports_disputed >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is 'Per-user profile. Visible only to the owner.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create the profile row when an auth user is created (anonymous or not).
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, is_anonymous)
  values (new.id, coalesce(new.is_anonymous, false))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Keep is_anonymous in sync when an anonymous user links an email.
create or replace function public.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_anonymous is distinct from old.is_anonymous then
    update public.profiles
       set is_anonymous = coalesce(new.is_anonymous, false)
     where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update of is_anonymous on auth.users
  for each row execute function public.handle_auth_user_updated();

-- Row level security: owners only. Inserts/deletes happen via triggers and cascades.
alter table public.profiles enable row level security;

create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Column-level privileges: clients may only change display_name.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

-- Public-facing RPC: what the client shows on the "You" tab.
create or replace function public.get_my_profile()
returns public.profiles
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.profiles where id = (select auth.uid());
$$;

grant execute on function public.get_my_profile() to authenticated;
