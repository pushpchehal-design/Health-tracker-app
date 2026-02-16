# Deploy Supabase Edge Functions

**Use the npm scripts or `npx supabase`—don't run `supabase` by itself or you'll get "Unknown command: supabase".**

## One-time setup

1. **Log in to Supabase CLI** (opens browser):
   ```bash
   npm run supabase:login
   ```

2. **Link this project** (project ref from your `.env` URL).  
   If it asks for your database password, you can avoid typing/pasting it by setting it once in the same terminal:
   ```bash
   export SUPABASE_DB_PASSWORD='your_database_password_from_dashboard'
   npm run supabase:link
   ```
   (Get the password from Dashboard → **Database** in the left sidebar → **Database** / **Settings**.)

3. **Set Edge Function secrets** (required for AI and RAG).  
   If the dashboard won’t update the key, set it from your machine instead:
   - Put your new Gemini API key in `.env` as `GEMINI_API_KEY=your_new_key` (no quotes).
   - Run: `npm run supabase:secrets:from-env` (pushes `.env` to Edge Function secrets).
   - Then: `npm run supabase:deploy`.  
   Or set one secret manually: `npx supabase secrets set GEMINI_API_KEY=your_key_here`  
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set automatically by Supabase when the function runs.

## Deploy

```bash
npm run supabase:deploy
```

This deploys (using Supabase API—**no Docker required**):
- `analyze-health-report`
- `generate-ayurveda-recommendations`

If you prefer to use Docker for bundling instead, install [Docker Desktop](https://docs.docker.com/desktop), start it, and change the script to remove `@beta` and `--use-api`.

## Manual commands (always use `npx supabase`, not `supabase`)

- Login: `npx supabase login` or `npm run supabase:login`
- Link: `npx supabase link --project-ref ogxcdxenrrrdpwlnwjhp` or `npm run supabase:link`
- Deploy both: `npm run supabase:deploy` or `npx supabase functions deploy analyze-health-report && npx supabase functions deploy generate-ayurveda-recommendations`
- Deploy one: `npx supabase functions deploy <function-name>`
