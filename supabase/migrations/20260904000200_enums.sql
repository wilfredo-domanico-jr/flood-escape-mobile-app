-- Domain enums shared by later migrations. Order of severity values matters:
-- Postgres compares enums by declaration order, so `severity >= 'caution'` works.
create type public.flood_severity as enum ('passable', 'caution', 'dangerous', 'impassable');
create type public.report_status as enum ('active', 'stale', 'resolved', 'disputed');
create type public.verification_kind as enum ('confirm', 'clear');
create type public.confidence_level as enum ('low', 'medium', 'high');
