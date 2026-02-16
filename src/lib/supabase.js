// Supabase connection file
// This file connects your app to your Supabase database

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file, then restart the dev server (npm run dev).'
  )
}

// Anon key is a long JWT (starts with eyJ). If you see "Invalid API key", use the "anon public" key from Supabase Dashboard → Project Settings → API.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
