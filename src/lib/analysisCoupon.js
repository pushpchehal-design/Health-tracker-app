import { parseSupabaseFunctionError } from './razorpayCheckout'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {'basic'|'full'} tier
 * @param {string} code
 */
export async function grantAnalysisCoupon(supabase, tier, code) {
  const { data, error } = await supabase.functions.invoke('grant-analysis-coupon', {
    body: { tier, code: String(code ?? '').trim() },
  })
  if (error) {
    throw new Error(await parseSupabaseFunctionError(error))
  }
  if (!data?.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Coupon could not be applied')
  }
  return data
}
