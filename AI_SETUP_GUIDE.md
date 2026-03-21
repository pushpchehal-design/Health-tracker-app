# AI Integration Setup Guide - FREE VERSION

This guide will help you set up **Google Gemini (100% FREE)** for health report analysis.

## ✅ Why Google Gemini Free Tier?

- **100% FREE** - No credit card required
- **Generous limits:**
  - 1,000 requests per day
  - 5-15 requests per minute
  - 250,000 tokens per minute
  - Supports PDFs and images
- **Great for health reports** - Excellent vision capabilities
- **Easy setup** - Simple API integration

## 🚀 Quick Setup (10 minutes)

### Step 1: Get Free Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account (Gmail)
3. Click **"Create API Key"**
4. Select **"Create API key in new project"** (or use existing)
5. Copy the API key (starts with `AIza...`)
   - ⚠️ **Save it immediately** - you can view it again later in AI Studio

**That's it! No credit card, no payment setup needed!**

### Step 2: Login to Supabase (No Installation Needed!)

**Option A: Using npx (Recommended - No permissions issues)**
```bash
npx supabase login
```

**Option B: Install globally (if you prefer)**
```bash
npm install -g supabase
# Or on Mac with Homebrew:
brew install supabase/tap/supabase
```

Then:
```bash
supabase login
```

**We recommend Option A** - it avoids permission issues and works immediately!

This will open your browser to authenticate with Supabase.

### Step 3: Link Your Project

```bash
cd /Users/pushapkantchehal/Health\ Tracker/health-tracker-app
npx supabase link --project-ref YOUR_PROJECT_REF
```

**To find your project ref:**
- Look at your Supabase dashboard URL in your browser
- It's the part after `/project/` in the URL
- Example: `https://supabase.com/dashboard/project/abcdefghijklmnop`
- Your project ref would be: `abcdefghijklmnop`

### Step 4: Set Gemini API Key as Secret

```bash
npx supabase secrets set GEMINI_API_KEY=AIza-your-actual-api-key-here
```

Replace `AIza-your-actual-api-key-here` with the key you copied from Google AI Studio.

### Step 5: Deploy the Edge Function

```bash
npx supabase functions deploy analyze-health-report
```

You should see output like:
```
Deploying function analyze-health-report...
Function analyze-health-report deployed successfully
```

### Step 7: Verify Setup

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Edge Functions** in the sidebar
3. You should see `analyze-health-report` listed
4. Test by uploading a health report in your app!

## 📋 Complete Checklist

- [ ] Got Gemini API key from Google AI Studio
- [ ] Installed Supabase CLI
- [ ] Logged in to Supabase CLI
- [ ] Linked project with `supabase link`
- [ ] Set API key with `supabase secrets set GEMINI_API_KEY=...`
- [ ] Deployed function with `supabase functions deploy analyze-health-report`
- [ ] Verified function appears in Supabase Dashboard

## 🧪 Testing

1. **Upload a test report:**
   - Go to your app's Dashboard
   - Click "Upload Report"
   - Select a PDF or image of a health report
   - Wait for analysis (usually 10-30 seconds)

2. **Check logs if issues:**
   - Go to Supabase Dashboard → Edge Functions → `analyze-health-report`
   - Click "Logs" to see any errors

## 🆓 Free Tier Limits

**Daily Limits:**
- ✅ 1,000 requests per day
- ✅ 250,000 tokens per minute
- ✅ Supports PDFs and images

**This is plenty for:**
- ~30-50 health reports per day (very generous!)
- Multiple family members
- Regular monitoring

## 🔧 Troubleshooting

### "GEMINI_API_KEY is not set" error
**Solution:** Make sure you ran:
```bash
npx supabase secrets set GEMINI_API_KEY=your-key-here
```
Then redeploy:
```bash
npx supabase functions deploy analyze-health-report
```

### "Function not found" error
**Solution:** 
1. Check you're in the correct directory
2. Verify function exists: `ls supabase/functions/`
3. Redeploy: `npx supabase functions deploy analyze-health-report`

### "Rate limit exceeded" error
**Solution:** 
- Free tier allows 5-15 requests per minute
- Wait a minute and try again
- This is very rare unless you're testing heavily

### Analysis fails or returns empty results
**Solution:**
1. Check Edge Function logs in Supabase Dashboard
2. Verify the file uploaded correctly
3. Try with a different report format (PDF works best)
4. Check that the report image is clear and readable

## 📝 How It Works

1. **User uploads report** → Stored in Supabase Storage
2. **Frontend calls Edge Function** → Passes file URL
3. **Edge Function:**
   - Downloads the file
   - Converts to base64
   - Sends to Google Gemini API (FREE)
   - Gemini analyzes the report
   - Parses the AI response
   - Saves categorized results to database
4. **Frontend shows results** → Organized by organ systems

## 🔒 Security

- ✅ API keys stored securely in Supabase secrets
- ✅ Never exposed to frontend
- ✅ Edge functions run server-side
- ✅ Row Level Security protects user data

## 💡 Tips

1. **Best file formats:** PDF > PNG > JPEG
2. **Clear images work best** - Make sure reports are readable
3. **Wait for analysis** - Usually takes 10-30 seconds
4. **Check logs** - If something fails, logs show the error

## Optional: Claude (Anthropic) for Ayurveda recommendations

Report **parsing / vision** in `analyze-health-report` still uses **Gemini** today. The **`generate-ayurveda-recommendations`** function can use **Claude** for the final text while **RAG query embeddings stay on Gemini** (`gemini-embedding-001`).

1. Create an API key in the [Anthropic Console](https://console.anthropic.com/).
2. Add Supabase Edge Function secrets (same as `GEMINI_API_KEY`):

   ```bash
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
   npx supabase secrets set AYURVEDA_LLM_PROVIDER=claude
   ```

   Optional: `CLAUDE_MODEL` (default `claude-3-5-haiku-20241022`).

3. Redeploy: `npx supabase functions deploy generate-ayurveda-recommendations`

Unset `AYURVEDA_LLM_PROVIDER` or set it to `gemini` to use Gemini for that step again.

## 🎉 You're Done!

Your health tracker now has **FREE AI-powered report analysis**! 

Upload a report and watch the AI categorize findings by:
- Liver Health
- Heart Health  
- Kidney Health
- Blood Health
- Metabolic Health
- Thyroid Health
- Immune System

All completely FREE! 🚀
