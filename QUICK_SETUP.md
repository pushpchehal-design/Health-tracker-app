# 🚀 Quick Setup - Copy & Paste Commands

## 1. Get FREE Gemini API Key
👉 Go to: https://aistudio.google.com/app/apikey
👉 Click "Create API Key"
👉 Copy the key (starts with `AIza...`)

## 2. Setup Supabase CLI (No Installation Needed!)

```bash
# Navigate to project
cd "/Users/pushapkantchehal/Health Tracker/health-tracker-app"

# Login to Supabase (uses npx - no global install needed)
npx supabase login

# Link project (replace YOUR_PROJECT_REF with your actual ref)
# To find your project ref: Look at your Supabase dashboard URL
# It's the part after /project/ in the URL
# Example: https://supabase.com/dashboard/project/abcdefghijklmnop
# Your project ref would be: abcdefghijklmnop
npx supabase link --project-ref YOUR_PROJECT_REF

# Set Gemini API key (replace with your actual key)
npx supabase secrets set GEMINI_API_KEY=AIza-your-actual-key-here

# Deploy the AI function
npx supabase functions deploy analyze-health-report
```

**Note:** Using `npx` means you don't need to install Supabase globally - it downloads and runs it automatically!

## 3. Done! 🎉

Your app now has FREE AI analysis. Test it by uploading a health report!

---

**Need your project ref?**
- Supabase Dashboard → Settings → General → Reference ID

**Having issues?**
- Check `AI_SETUP_GUIDE.md` for detailed instructions
- Check Supabase Dashboard → Edge Functions → Logs
