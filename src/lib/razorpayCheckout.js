/**
 * Load Razorpay Checkout script once, create order via Edge Function, open payment modal.
 * Amount is in paise (INR): 100 = ₹1, 10000 = ₹100
 */

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'

export function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Razorpay runs in the browser only'))
      return
    }
    if (window.Razorpay) {
      resolve()
      return
    }
    const existing = document.querySelector(`script[src="${CHECKOUT_SCRIPT}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay')))
      return
    }
    const script = document.createElement('script')
    script.src = CHECKOUT_SCRIPT
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Razorpay Checkout'))
    document.body.appendChild(script)
  })
}

/** Default test amount ₹100 — override with VITE_RAZORPAY_AMOUNT_PAISE in .env */
export function getDefaultPayAmountPaise() {
  const raw = import.meta.env.VITE_RAZORPAY_AMOUNT_PAISE
  if (raw != null && raw !== '') {
    const n = parseInt(String(raw), 10)
    if (Number.isFinite(n) && n >= 100) return n
  }
  return 10000
}

/** Pull JSON/text from Supabase functions.invoke error (shows real Edge message, not only "non-2xx"). */
export async function parseSupabaseFunctionError(error) {
  if (!error) return 'Request failed'
  let msg = error.message || 'Request failed'
  const ctx = error.context
  if (!ctx) return msg
  try {
    if (typeof ctx.clone === 'function' && typeof ctx.text === 'function') {
      const text = await ctx.clone().text()
      if (text) {
        try {
          const j = JSON.parse(text)
          if (typeof j.error === 'string') return j.error
          if (j.error?.description) return j.error.description
          if (typeof j.message === 'string') return j.message
        } catch {
          return text.length > 280 ? `${text.slice(0, 280)}…` : text
        }
      }
    }
    if (typeof ctx.json === 'function') {
      const j = await ctx.json()
      if (typeof j.error === 'string') return j.error
      if (j.error?.description) return j.error.description
      if (typeof j.message === 'string') return j.message
    }
  } catch (e) {
    console.warn('parseSupabaseFunctionError', e)
  }
  return msg
}

/**
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabase
 * @param {number} opts.amountPaise
 * @param {string} [opts.userEmail]
 * @param {string} [opts.userName]
 * @param {function} [opts.onSuccess] - (response) => void — razorpay_payment_id, order_id, signature
 * @param {function} [opts.onDismiss] - modal closed without pay
 */
export async function openRazorpayPay(opts) {
  const { supabase, amountPaise, userEmail, userName, onSuccess, onDismiss } = opts
  if (!supabase) throw new Error('Not signed in (Supabase client missing)')

  const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession()
  if (refreshErr) {
    console.warn('refreshSession before pay:', refreshErr.message)
  }
  const session = refreshData?.session ?? (await supabase.auth.getSession()).data.session
  const accessToken = session?.access_token
  if (!accessToken) {
    throw new Error('Please sign in again to pay.')
  }

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.')
  }

  // Use fetch (not functions.invoke) so Authorization is exactly the user JWT — invoke can confuse the gateway.
  const orderRes = await fetch(`${supabaseUrl}/functions/v1/create-razorpay-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR' }),
  })

  const data = await orderRes.json().catch(() => ({}))
  if (!orderRes.ok) {
    const errText =
      typeof data?.error === 'string'
        ? data.error
        : data?.error?.description || data?.message || `Payment setup failed (${orderRes.status})`
    console.error('create-razorpay-order HTTP error:', orderRes.status, data)
    throw new Error(errText)
  }

  if (!data || data.error) {
    const errText = typeof data?.error === 'string' ? data.error : data?.error?.description || 'Order failed'
    throw new Error(errText)
  }

  const { orderId, amount, currency, keyId } = data
  if (!orderId || !keyId) {
    throw new Error('Invalid response from payment server')
  }

  await loadRazorpayScript()

  return new Promise((resolve, reject) => {
    const options = {
      key: keyId,
      amount,
      currency: currency || 'INR',
      name: 'Health Tracker',
      description: 'Payment',
      order_id: orderId,
      handler(response) {
        if (onSuccess) onSuccess(response)
        resolve(response)
      },
      prefill: {
        email: userEmail || '',
        name: userName || '',
      },
      theme: { color: '#6366f1' },
      modal: {
        ondismiss() {
          if (onDismiss) onDismiss()
          resolve(null)
        },
      },
    }

    try {
      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', function (response) {
        reject(new Error(response?.error?.description || 'Payment failed'))
      })
      rzp.open()
    } catch (e) {
      reject(e)
    }
  })
}
