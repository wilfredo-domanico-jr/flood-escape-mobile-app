-- Phase 1: extensions only. Schema arrives in later migrations.

-- Geospatial types, indexes and functions (geography(Point,4326), ST_DWithin, KNN).
create extension if not exists postgis with schema extensions;

-- Scheduled jobs: staleness sweep, retention, notification outbox drain.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Async HTTP from Postgres (cron → Edge Function).
create extension if not exists pg_net with schema extensions;

-- Lock down the public schema for unauthenticated callers by default.
-- Every table/function is explicitly granted to `authenticated` in later migrations.
revoke all on schema public from anon;
grant usage on schema public to anon;
alter default privileges in schema public revoke execute on functions from public, anon;
