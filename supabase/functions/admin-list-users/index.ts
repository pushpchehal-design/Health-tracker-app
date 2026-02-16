// Edge Function: list all auth users. Caller must be in public.admin_users.
// Requires Authorization: Bearer <user_jwt> and apikey (anon key). Validates JWT with anon client, then uses service role for admin check + listUsers.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
// Anon key: Supabase sets SUPABASE_ANON_KEY in Edge Functions by default; fallback to request apikey header
function getAnonKey(req: Request): string {
  return Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? ""
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    const token = authHeader?.replace(/^Bearer\s+/i, "")
    const anonKey = getAnonKey(req)
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }
    if (!anonKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_ANON_KEY and apikey header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Validate JWT and get user id: try getClaims(token) first, then getUser(token)
    const supabaseAnon = createClient(SUPABASE_URL, anonKey, { auth: { persistSession: false } })
    let userId: string | undefined
    let userResultError: string | undefined
    const claimsResult = await supabaseAnon.auth.getClaims(token).catch(() => ({ data: null, error: { message: "getClaims failed" } }))
    if (claimsResult.data?.claims?.sub) {
      userId = claimsResult.data.claims.sub as string
    }
    if (!userId) {
      const userResult = await supabaseAnon.auth.getUser(token)
      if (userResult.data?.user?.id) userId = userResult.data.user.id
      else userResultError = userResult.error?.message
    }
    if (!userId) {
      const claimsErr = (claimsResult as { error?: { message?: string } }).error?.message
      const errMsg = claimsErr || userResultError || "Invalid or expired token"
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    const { data: adminRow, error: adminError } = await supabaseAdmin
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle()

    if (adminError || !adminRow) {
      return new Response(
        JSON.stringify({ error: "Forbidden: admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    if (listError) {
      return new Response(
        JSON.stringify({ error: listError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const users = (listData?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? undefined,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? undefined,
    }))

    return new Response(JSON.stringify({ users }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
