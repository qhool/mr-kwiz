-- Grant service_role full access to all existing tables and sequences in the public schema.
-- Required for direct Supabase client access using the service role key (e.g. smoke tests,
-- admin operations).  Safe to re-run: GRANT is idempotent.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Ensure tables and sequences created by future migrations automatically receive the same grants.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
