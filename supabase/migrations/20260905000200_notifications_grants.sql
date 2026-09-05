-- The send-push Edge Function runs as service_role, which bypasses RLS but still needs table
-- grants because migration 000100 removed the default ones.
grant select, insert, update, delete on public.notification_outbox to service_role;
grant select, delete on public.device_push_tokens to service_role;
grant select on public.notification_preferences to service_role;
grant usage, select on all sequences in schema public to service_role;
