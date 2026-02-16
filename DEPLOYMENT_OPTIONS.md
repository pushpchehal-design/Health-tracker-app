# Deployment Options (Website for Razorpay + Live App)

Razorpay onboarding typically asks for a **website URL**. You need to deploy your frontend so you have a stable, public HTTPS URL (e.g. `https://your-app.vercel.app` or a custom domain).

Your stack: **Vite + React** (frontend) and **Supabase** (auth, DB, storage, Edge Functions). Supabase already hosts your Edge Functions; you only need to deploy the **React SPA**.

---

## Recommended: **Vercel** (easiest)

- **Free tier:** Generous; fine for a small health tracker.
- **Flow:** Connect your GitHub repo → set env vars → every push to `main` deploys.
- **Vite:** Native support; no extra config.
- **Env:** Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel project settings (they get baked into the build).

### Steps

**Full step-by-step:** see **[DEPLOY_VERCEL_GITHUB.md](./DEPLOY_VERCEL_GITHUB.md)** (GitHub push commands + Vercel + Supabase redirect URLs).

Short version:

1. Push your project to **GitHub** (if not already).
2. Go to [vercel.com](https://vercel.com) → Sign in with GitHub.
3. **Add New Project** → Import your repo.
4. **Configure:**
   - Framework Preset: **Vite**
   - Root Directory: leave default (or set if app is in a subfolder).
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. **Environment Variables** (required):
   - `VITE_SUPABASE_URL` = your Supabase project URL (e.g. `https://xxxx.supabase.co`)
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon/public key
6. Deploy. You’ll get a URL like `https://health-tracker-app-xxx.vercel.app`.
7. **Razorpay:** Use this URL as your “Business website” / “App URL” in the Razorpay dashboard.
8. **Supabase:** In Authentication → URL Configuration, add this URL to **Redirect URLs** (and set it as Site URL if this is your only frontend).

Optional: add a **custom domain** in Vercel (e.g. `app.yourdomain.com`) and use that for Razorpay and Supabase instead.

---

## Alternative: **Netlify**

- Free tier, Git-based deploys, easy env vars.
- Steps: Connect repo at [netlify.com](https://netlify.com) → Build command: `npm run build`, Publish directory: `dist` → Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Site settings → Deploy.
- Use the generated URL (e.g. `https://xxx.netlify.app`) for Razorpay and Supabase redirect URLs.

---

## Alternative: **Cloudflare Pages**

- Free, fast CDN, Git integration.
- Connect repo → Build: `npm run build`, Output: `dist` → Set env vars in Cloudflare dashboard → Deploy.
- Use the `*.pages.dev` URL for Razorpay and Supabase.

---

## What *not* to use for “website” with Razorpay

- **localhost** – Razorpay won’t accept it as your business website.
- **Supabase Hosting** – Supabase doesn’t host arbitrary frontends; it hosts Edge Functions. Your React app must be deployed elsewhere (Vercel, Netlify, etc.).

---

## Checklist after first deploy

- [ ] Frontend builds and loads at the deployment URL.
- [ ] Login/signup works (Supabase redirect URL includes your deployment URL).
- [ ] Supabase **Redirect URLs**: add `https://your-deployment-url.vercel.app/**` (or your Netlify/Pages URL).
- [ ] **Razorpay:** Use the same deployment URL as your “Website” / “App URL” in dashboard.
- [ ] When you add Razorpay payment: set success/cancel return URLs to your deployment domain (e.g. `https://your-app.vercel.app/dashboard?payment=success`).

---

## Summary

| Option        | Best for              | Free tier | Env vars |
|---------------|------------------------|-----------|----------|
| **Vercel**    | Easiest, Vite support  | Yes       | In UI    |
| **Netlify**   | Simple Git deploy      | Yes       | In UI    |
| **Cloudflare Pages** | Fast global CDN | Yes   | In UI    |

Pick one (Vercel is the quickest), connect the repo, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, deploy, then use the live URL for Razorpay and Supabase.
