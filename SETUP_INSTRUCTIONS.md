# Complete Setup Instructions - Health Tracker App

Follow these steps in order to set up your Health Tracker application.

## Prerequisites

- Node.js installed (v18 or higher)
- A Supabase account (free tier works)
- A Google account (for free Gemini API)

## Step 1: Database Setup

### 1.1 Create Database Tables

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **SQL Editor**
4. Run the SQL from `supabase-health-reports-setup.sql`

This creates:
- `health_reports` table
- `health_analysis` table
- Row Level Security policies

### 1.2 Create Storage Bucket

1. In Supabase Dashboard, go to **Storage**
2. Click **"New bucket"**
3. Name: `health-reports`
4. **Public:** No (keep it private)
5. Click **"Create bucket"**

### 1.3 Set Storage Policies

1. Go back to **SQL Editor**
2. Run the SQL from `supabase-storage-policies.sql`

This allows users to upload/read/delete their own files.

## Step 2: AI Setup (FREE with Google Gemini)

### 2.1 Get Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with Google
3. Click **"Create API Key"**
4. Copy the key (starts with `AIza...`)

### 2.2 Install Supabase CLI

```bash
npm install -g supabase
```

### 2.3 Login to Supabase

```bash
supabase login
```

### 2.4 Link Your Project

```bash
cd /Users/pushapkantchehal/Health\ Tracker/health-tracker-app
supabase link --project-ref YOUR_PROJECT_REF
```

Find your project ref in: Supabase Dashboard → Settings → General → Reference ID

### 2.5 Set API Key

```bash
supabase secrets set GEMINI_API_KEY=AIza-your-key-here
```

### 2.6 Deploy Edge Function

```bash
supabase functions deploy analyze-health-report
```

## Step 3: Run the App

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Step 4: Test Everything

1. **Sign up** with a new account
2. **Create your profile** (name, age, etc.)
3. **Add family members** (optional)
4. **Upload a health report** (PDF or image)
5. **Wait for AI analysis** (10-30 seconds)
6. **View categorized results** by organ system

## Troubleshooting

### Database errors
- Make sure you ran all SQL scripts
- Check Supabase Dashboard → Database → Tables

### Storage errors
- Verify bucket `health-reports` exists
- Check storage policies are set

### AI analysis not working
- Check Edge Function logs in Supabase Dashboard
- Verify `GEMINI_API_KEY` is set: `supabase secrets list`
- Make sure function is deployed

### File upload fails
- Check file size (max 10MB)
- Verify file format (PDF, Word, or Image)
- Check browser console for errors

## Need Help?

- Check `AI_SETUP_GUIDE.md` for detailed AI setup
- Check Supabase Dashboard logs
- Review browser console for frontend errors

## What's Next?

Your app is now ready! Users can:
- ✅ Sign up and create profiles
- ✅ Add family members
- ✅ Upload health reports
- ✅ Get FREE AI-powered analysis
- ✅ View categorized health insights

Enjoy your Health Tracker! 🎉
