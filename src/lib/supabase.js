// Supabase connection file
// This file connects your app to your Supabase database

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

export const configMissing = !supabaseUrl || !supabaseAnonKey

// Anon key is a long JWT (starts with eyJ). If you see "Invalid API key", use the "anon public" key from Supabase Dashboard → Project Settings → API.
export const supabase = configMissing ? null : createClient(supabaseUrl, supabaseAnonKey)
