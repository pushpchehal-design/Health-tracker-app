# Edge Function troubleshooting

## 503 BOOT_ERROR – "Function failed to start"

This usually means an **import failed** at cold start (e.g. the `unpdf` PDF library). The function code now loads `unpdf` **inside** the request handler (dynamic import) so the function can start even if that dependency is slow or fails later.

1. **Redeploy** after pulling the latest code:
   ```bash
   npx supabase functions deploy analyze-health-report
   ```
2. In **Supabase Dashboard → Edge Functions → analyze-health-report → Logs**, check the first error line when the function starts; it will show the exact failing import or runtime error.
3. Ensure **Supabase injects env vars** (Dashboard → Project Settings → Edge Functions): `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set automatically; you only need `GEMINI_API_KEY` if you use AI fallback.

---

## "Failed to send request" / CORS

If you see **"Failed to send a request to Edge function"** or **"Cannot reach Edge Function"**, check the following.

## 1. Deploy the function

From the project root (where `supabase/` lives):

```bash
npx supabase functions deploy analyze-health-report
```

You must be logged in: `npx supabase login`. The project must be linked: `npx supabase link` (use your project ref from Supabase Dashboard → Settings → General).

## 2. Check .env

In the project root, `.env` should have (no quotes, no trailing slash on URL):

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

- Get both from **Supabase Dashboard → Project Settings → API** (Project URL and anon public key).
- After changing `.env`, restart the dev server: stop it, then `npm run dev`.

## 3. Confirm the function is live

- **Supabase Dashboard → Edge Functions** → you should see `analyze-health-report` and a green/active state.
- Or open in browser (will return 405 for GET, which is normal):  
  `https://YOUR_PROJECT_REF.supabase.co/functions/v1/analyze-health-report`

## 4. Browser / network

- Try in an incognito/private window (to rule out extensions blocking the request).
- Check the browser console (F12 → Console) when you trigger analysis; the exact error message will appear there.

## 5. CORS

The function already sends CORS headers. If you still see CORS errors, ensure you’re using the same Supabase project (same `VITE_SUPABASE_URL`) for the app and the deployed function.

---

**Quick test from terminal** (replace `YOUR_PROJECT_REF` and `YOUR_ANON_KEY`):

```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/analyze-health-report" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "apikey: YOUR_ANON_KEY" \
  -d '{"fileType":"pdf","reportId":"00000000-0000-0000-0000-000000000000"}'
```

- If you get a **404**, the function isn’t deployed or the URL is wrong.
- If you get **400** or a JSON body (e.g. "Missing fileUrl or filePath"), the request is reaching the function and the remaining issue is with the real payload (e.g. file path/URL).
