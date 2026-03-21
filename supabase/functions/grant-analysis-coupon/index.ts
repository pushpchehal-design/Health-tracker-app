// Redeem a promotional coupon for one Ayurveda analysis credit (same row shape as paid entitlements).
// POST body: { tier: "basic" | "full", code: string }
// Valid code (case-insensitive): Gratitude

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const COUPON_NORMALIZED = 'gratitude'

function getAnonKey(req: Request): string {
  return Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey') ?? ''
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace(/^Bearer\s+/i, '')
    const anonKey = getAnonKey(req)
    if (!token || !anonKey) {
      return new Response(JSON.stringify({ error: 'Missing Authorization or apikey' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const userResult = await supabaseAdmin.auth.getUser(token)
    const userId = userResult.data?.user?.id
    if (!userId) {
      return new Response(JSON.stringify({ error: userResult.error?.message || 'Invalid session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const body = await req.json().catch(() => ({}))
    const tier = String(body.tier || '').toLowerCase()
    const codeRaw = String(body.code ?? '')
    const codeNorm = codeRaw.trim().toLowerCase()

    if (tier !== 'basic' && tier !== 'full') {
      return new Response(JSON.stringify({ error: 'Invalid tier' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    if (codeNorm !== COUPON_NORMALIZED) {
      return new Response(JSON.stringify({ error: 'Invalid coupon code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const suffix = crypto.randomUUID()
    const orderId = `coupon_gratitude_${suffix}`
    const paymentId = `coupon_pay_${suffix}`

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('analysis_entitlements')
      .insert({
        user_id: userId,
        tier,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
      })
      .select('id')
      .single()

    if (insErr) {
      console.error('grant-analysis-coupon insert:', insErr)
      return new Response(JSON.stringify({ error: insErr.message || 'Could not apply coupon' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    return new Response(JSON.stringify({ ok: true, entitlementId: inserted?.id, tier }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (e) {
    console.error('grant-analysis-coupon:', e)
    return new Response(JSON.stringify({ error: (e as Error).message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
