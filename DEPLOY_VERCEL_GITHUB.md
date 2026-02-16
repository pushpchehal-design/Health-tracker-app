# Deploy with GitHub + Vercel (step-by-step)

Use this to get a live URL for Razorpay and your app. Your `.env` is in `.gitignore`, so it will **not** be pushed to GitHub.

---

## 1. Push your project to GitHub

**If you don’t have a repo yet:**

1. On GitHub: **New repository** → name it e.g. `health-tracker-app` → create (no need to add README if the folder already has one).
2. In your project folder, run:

```bash
cd "/Users/pushapkantchehal/Health Tracker/health-tracker-app"
git init
git add .
git commit -m "Initial commit: health tracker + Supabase + AI"
git branch -M main
git remote add origin https://github.com/pushpchehal-design/Health-tracker-app.git
git push -u origin main
```

**If the folder is already a git repo** and you just need to add GitHub:

```bash
cd "/Users/pushapkantchehal/Health Tracker/health-tracker-app"
git remote add origin https://github.com/pushpchehal-design/Health-tracker-app.git
git branch -M main
git push -u origin main
```

**If you already have a repo and remote**, ensure everything is committed and pushed:

```bash
git add .
git commit -m "Prepare for deployment" --allow-empty
git push
```

---

## 2. Deploy on Vercel

1. Go to **[vercel.com](https://vercel.com)** and sign in with **GitHub**.
2. Click **Add New…** → **Project**.
3. **Import** your `health-tracker-app` repo (or the repo name you used).
4. **Configure project:**
   - Framework Preset: **Vite**
   - Root Directory: leave as **.** (or choose the folder if the app lives in a subfolder)
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. **Environment Variables** – click **Add** and add:

   | Name                     | Value                                      |
   |--------------------------|--------------------------------------------|
   | `VITE_SUPABASE_URL`      | Your Supabase URL (e.g. `https://xxxx.supabase.co`) |
   | `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key                     |

   Copy these from your local `.env` or from Supabase Dashboard → **Settings** → **API** (Project URL and anon public key).

6. Click **Deploy**. Wait for the build to finish.
7. You’ll get a URL like **`https://health-tracker-app-xxxx.vercel.app`**. Open it to confirm the app loads and login works.

---

## 3. Supabase: allow the deployment URL

1. Open **Supabase Dashboard** → your project → **Authentication** → **URL Configuration**.
2. **Site URL:** set to your Vercel URL, e.g. `https://health-tracker-app-xxxx.vercel.app`.
3. **Redirect URLs:** add:
   - `https://health-tracker-app-xxxx.vercel.app/**`
   - (and your exact Vercel URL if you use a custom domain later).

Save. Try signing in again on the deployed site.

---

## 4. Razorpay (when you set it up)

- In Razorpay dashboard, use your Vercel URL as the **Website** / **Business URL**.
- For payment success/cancel return URLs, use the same domain (e.g. `https://your-app.vercel.app/dashboard?payment=success`).

---

## 5. Later: custom domain (optional)

In Vercel: Project → **Settings** → **Domains** → add your domain and follow the DNS instructions. Then update Supabase redirect URLs and Razorpay to use that domain.

---

## Quick reference

| Step | Where | What |
|------|--------|------|
| 1 | Terminal | Push code to GitHub |
| 2 | Vercel | Import repo, set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`, deploy |
| 3 | Supabase | Site URL + Redirect URLs = your Vercel URL |
| 4 | Razorpay | Website URL = your Vercel URL |

After step 3 you have a live site; step 4 is for when you add payments.
