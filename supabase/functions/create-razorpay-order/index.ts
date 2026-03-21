// Edge Function: Create a Razorpay order (server-side only — uses Key Secret).
// POST body: { amount: number }  // amount in smallest currency unit (INR = paise), e.g. 9900 = ₹99
// Optional: { currency?: string, receipt?: string }  receipt max 40 chars for Razorpay
//
// Requires: Authorization: Bearer <user_jwt> and apikey header (Supabase client default).
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') ?? ''
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? ''

function getAnonKey(req: Request): string {
  return Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey') ?? ''
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Max order amount in paise (₹5,00,000) — adjust for your product */
const MAX_AMOUNT_PAISE = 50_000_000

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

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return new Response(
      JSON.stringify({
        error: 'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Edge Function secrets.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
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

    // Validate user JWT with service role (avoids "Invalid JWT" quirks from anon client on Edge)
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration: missing SUPABASE_SERVICE_ROLE_KEY' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    let userId: string | undefined
    const userResult = await supabaseAdmin.auth.getUser(token)
    if (userResult.data?.user?.id) userId = userResult.data.user.id
    if (!userId) {
      const hint = userResult.error?.message || 'Invalid or expired session'
      return new Response(JSON.stringify({ error: hint }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const body = await req.json().catch(() => ({}))
    const amountRaw = body.amount
    const currency = typeof body.currency === 'string' && body.currency.length === 3 ? body.currency.toUpperCase() : 'INR'
    let receipt = typeof body.receipt === 'string' ? body.receipt.slice(0, 40) : `ht_${userId.slice(0, 8)}_${Date.now()}`

    const amount = typeof amountRaw === 'number' ? Math.floor(amountRaw) : parseInt(String(amountRaw), 10)
    if (!Number.isFinite(amount) || amount < 100) {
      return new Response(
        JSON.stringify({ error: 'Invalid amount. Send integer paise (INR), minimum 100 (₹1).' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    if (amount > MAX_AMOUNT_PAISE) {
      return new Response(JSON.stringify({ error: 'Amount exceeds allowed maximum.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const authString = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)
    const orderPayload = {
      amount,
      currency,
      receipt,
      notes: { supabase_user_id: userId },
    }

    const rzRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authString}`,
      },
      body: JSON.stringify(orderPayload),
    })

    const rzJson = await rzRes.json().catch(() => ({}))
    if (!rzRes.ok) {
      console.error('Razorpay order error:', rzRes.status, rzJson)
      return new Response(
        JSON.stringify({
          error: (rzJson as { error?: { description?: string; code?: string } })?.error?.description || 'Razorpay order failed',
          code: (rzJson as { error?: { code?: string } })?.error?.code,
        }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const order = rzJson as { id?: string; amount?: number; currency?: string; status?: string }
    if (!order.id) {
      return new Response(JSON.stringify({ error: 'Unexpected Razorpay response' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    return new Response(
      JSON.stringify({
        orderId: order.id,
        amount: order.amount ?? amount,
        currency: order.currency ?? currency,
        keyId: RAZORPAY_KEY_ID,
        status: order.status,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  } catch (e) {
    console.error('create-razorpay-order:', e)
    return new Response(JSON.stringify({ error: (e as Error).message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
