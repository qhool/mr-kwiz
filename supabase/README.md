# Supabase Local Development

This directory contains the committed local Supabase CLI configuration for MrKwiz.

## Files

- `config.toml`: local stack configuration used by `supabase start`
- `seed.sql`: optional seed file applied by `supabase db reset`
- `migrations/`: timestamped SQL migrations only

## Commands

Run these from the project root:

```bash
npm run supabase:start
npm run supabase:status
npm run supabase:stop
npm run supabase:db:push
npm run supabase:db:reset
npm run supabase:migration:new -- <name>
npm run supabase:types
```