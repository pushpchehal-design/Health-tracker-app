// Edge Function: After Checkout success — verify Razorpay signature, confirm payment, grant analysis entitlement.
// POST body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Tier is read from Razorpay order notes (set at order creation) — not from client.
//
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (same as create order)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') ?? ''
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? ''

const TIER_AMOUNTS_PAISE: Record<string, number> = {
  basic: 8900,
  full: 24900,
}

function getAnonKey(req: Request): string {
  return Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey') ?? ''
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function verifySignature(orderId: string, paymentId: string, signature: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(`${orderId}|${paymentId}`))
  const hex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hex === signature || hex.toLowerCase() === (signature || '').toLowerCase()
}

function basicAuthHeader(): string {
  return `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`
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

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || !SUPABASE_SERVICE_ROLE_KEY) {
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
    const orderId = body.razorpay_order_id ?? body.order_id
    const paymentId = body.razorpay_payment_id ?? body.payment_id
    const signature = body.razorpay_signature ?? body.signature
    if (!orderId || !paymentId || !signature) {
      return new Response(JSON.stringify({ error: 'Missing order id, payment id, or signature' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const sigOk = await verifySignature(String(orderId), String(paymentId), String(signature), RAZORPAY_KEY_SECRET)
    if (!sigOk) {
      return new Response(JSON.stringify({ error: 'Invalid payment signature' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const payRes = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: basicAuthHeader() },
    })
    const payJson = await payRes.json().catch(() => ({}))
    if (!payRes.ok) {
      return new Response(JSON.stringify({ error: 'Could not verify payment with Razorpay' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    const payOrderId = (payJson as { order_id?: string }).order_id
    if (payOrderId !== orderId) {
      return new Response(JSON.stringify({ error: 'Payment does not match order' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    const status = (payJson as { status?: string }).status
    if (status !== 'captured' && status !== 'authorized') {
      return new Response(JSON.stringify({ error: `Payment not completed (status: ${status || 'unknown'})` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const ordRes = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: basicAuthHeader() },
    })
    const ordJson = await ordRes.json().catch(() => ({}))
    if (!ordRes.ok) {
      return new Response(JSON.stringify({ error: 'Could not load order from Razorpay' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const notes = (ordJson as { notes?: Record<string, string> }).notes || {}
    const noteUser = notes.supabase_user_id
    const tier = (notes.tier || '').toLowerCase()
    if (noteUser !== userId) {
      return new Response(JSON.stringify({ error: 'Order does not belong to this account' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    if (tier !== 'basic' && tier !== 'full') {
      return new Response(JSON.stringify({ error: 'Invalid order product' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const orderAmount = (ordJson as { amount?: number }).amount
    if (orderAmount !== TIER_AMOUNTS_PAISE[tier]) {
      return new Response(JSON.stringify({ error: 'Order amount mismatch' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { data: existing } = await supabaseAdmin
      .from('analysis_entitlements')
      .select('id')
      .eq('razorpay_payment_id', paymentId)
      .maybeSingle()

    if (existing?.id) {
      return new Response(JSON.stringify({ ok: true, entitlementId: existing.id, alreadyRecorded: true, tier }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('analysis_entitlements')
      .insert({
        user_id: userId,
        tier,
        razorpay_order_id: String(orderId),
        razorpay_payment_id: String(paymentId),
      })
      .select('id')
      .single()

    if (insErr) {
      console.error('insert entitlement:', insErr)
      return new Response(JSON.stringify({ error: insErr.message || 'Could not save entitlement' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    return new Response(
      JSON.stringify({ ok: true, entitlementId: inserted?.id, tier }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  } catch (e) {
    console.error('verify-razorpay-analysis-payment:', e)
    return new Response(JSON.stringify({ error: (e as Error).message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
