/** Ayurveda analysis products (amounts fixed server-side in Edge Function). */

export const TIER_BASIC = 'basic'
export const TIER_FULL = 'full'

export const ANALYSIS_TIERS = [
  {
    id: TIER_BASIC,
    title: 'Ayurvedic remedies only',
    priceInr: 89,
    /** Shown struck through next to sale price (marketing). */
    listPriceInr: 289,
    pricePaise: 8900,
    blurb: 'Ayurvedic remedies for each abnormal parameter.',
  },
  {
    id: TIER_FULL,
    title: 'Full Ayurveda analysis',
    priceInr: 249,
    listPriceInr: 549,
    pricePaise: 24900,
    blurb: 'Remedies + dietary recommendations + lifestyle modifications. With AI on: personalized notes as well.',
  },
]

export function getTierMeta(tierId) {
  return ANALYSIS_TIERS.find((t) => t.id === tierId) || ANALYSIS_TIERS[0]
}
