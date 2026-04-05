/**
 * Verifies ANTHROPIC_API_KEY with a minimal Anthropic Messages API call.
 *
 * Usage (never commit the key):
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/verify-anthropic-key.mjs
 *
 * Or add ANTHROPIC_API_KEY to .env in project root (gitignored), then:
 *   npm run verify:anthropic
 */

import 'dotenv/config'

const key = (process.env.ANTHROPIC_API_KEY ?? '').trim()
const model = process.env.CLAUDE_VERIFY_MODEL || 'claude-3-5-haiku-20241022'

if (!key) {
  console.error('Missing ANTHROPIC_API_KEY. Set it in the environment or in .env (do not commit .env).')
  process.exit(1)
}

if (!key.startsWith('sk-ant')) {
  console.error('Key does not start with sk-ant- — it may not be an Anthropic API key.')
  process.exit(1)
}

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model,
    max_tokens: 1,
    messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
  }),
})

const raw = await res.text()
if (!res.ok) {
  let detail = raw.slice(0, 400)
  try {
    const j = JSON.parse(raw)
    if (j?.error?.message) detail = j.error.message
  } catch {
    /* keep slice */
  }
  console.error(`Anthropic API rejected the key (HTTP ${res.status}).`)
  console.error(detail)
  process.exit(1)
}

console.log('Anthropic API key is valid (minimal message request succeeded).')
console.log(`Model used for check: ${model}`)
