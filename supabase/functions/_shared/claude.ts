/** Anthropic Messages API — text completion only (no embeddings).
 * Default model IDs must match https://docs.anthropic.com/en/docs/about-claude/models (retired IDs → 404).
 */

/** Strip BOM, whitespace, and wrapping quotes (common when pasting or using `--env-file`). */
export function normalizeAnthropicApiKey(raw: string): string {
  let k = (raw ?? '').replace(/^\uFEFF/, '').trim()
  if (
    (k.startsWith('"') && k.endsWith('"') && k.length >= 2) ||
    (k.startsWith("'") && k.endsWith("'") && k.length >= 2)
  ) {
    k = k.slice(1, -1).trim()
  }
  return k
}

function anthropic401Hint(): string {
  const base =
    ' Set ANTHROPIC_API_KEY in Supabase → Edge Functions → Secrets to a valid key from https://console.anthropic.com/ (must start with sk-ant-). Do not wrap the value in quotes. If you use `supabase secrets set --env-file .env`, use ANTHROPIC_API_KEY=sk-ant-... with no quotes.'
  try {
    const h = new URL(Deno.env.get('SUPABASE_URL') || 'https://invalid').hostname
    if (h && h !== 'invalid' && h.includes('supabase')) {
      return `${base} This Edge Function reads secrets for Supabase host ${h} — your app’s VITE_SUPABASE_URL must be this same project, or you’ll be editing secrets in the wrong place.`
    }
  } catch {
    /* ignore */
  }
  return base
}

/** PDF + vision report extraction (override with CLAUDE_VISION_MODEL secret). */
const DEFAULT_VISION_MODEL = 'claude-sonnet-4-20250514'

/** Text-only e.g. Ayurveda (override with CLAUDE_MODEL). Use a current id from Anthropic if this 404s. */
const DEFAULT_TEXT_MODEL = 'claude-3-5-haiku-20241022'

export type ClaudeReportMedia =
  | { kind: 'pdf'; base64: string }
  | { kind: 'image'; base64: string; mediaType: 'image/jpeg' | 'image/png' }

/**
 * Vision / PDF lab report → model returns JSON text (same contract as Gemini extraction).
 * Uses CLAUDE_VISION_MODEL or falls back to Claude Sonnet (PDF + images).
 */
export async function extractLabReportJsonWithClaude(opts: {
  apiKey: string
  prompt: string
  media: ClaudeReportMedia
  maxTokens?: number
}): Promise<string> {
  const model =
    Deno.env.get('CLAUDE_VISION_MODEL') ||
    Deno.env.get('CLAUDE_MODEL') ||
    DEFAULT_VISION_MODEL

  const content: unknown[] = []
  if (opts.media.kind === 'pdf') {
    content.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: opts.media.base64,
      },
    })
  } else {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: opts.media.mediaType,
        data: opts.media.base64,
      },
    })
  }
  content.push({ type: 'text', text: opts.prompt })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 16384,
      messages: [{ role: 'user', content }],
    }),
  })

  const raw = await res.text()
  if (!res.ok) {
    let detail = raw.slice(0, 500)
    try {
      const j = JSON.parse(raw) as { error?: { message?: string; type?: string } }
      if (j?.error?.message) detail = j.error.message
    } catch {
      /* keep slice */
    }
    let hint = ''
    if (res.status === 404) {
      hint =
        ' If the model was retired, set secret CLAUDE_VISION_MODEL to an ID from Anthropic’s model docs.'
    } else if (res.status === 401) {
      hint = ` ${anthropic401Hint()}`
    }
    throw new Error(`Claude API error (${res.status}). ${detail}${hint}`)
  }

  let j: { content?: Array<{ type?: string; text?: string }> }
  try {
    j = JSON.parse(raw)
  } catch {
    throw new Error('Claude returned invalid JSON envelope.')
  }
  const blocks = j?.content
  if (!Array.isArray(blocks)) {
    throw new Error('Invalid Claude response shape')
  }
  let text = ''
  for (const b of blocks) {
    if (b?.type === 'text' && typeof b.text === 'string') text += b.text
  }
  const out = text.trim()
  if (!out) {
    throw new Error('Claude returned no text. Try again, another model, or use Gemini.')
  }
  return out
}

export async function completeWithClaude(opts: {
  apiKey: string
  prompt: string
  model?: string
  maxTokens?: number
}): Promise<string> {
  const model =
    opts.model ||
    Deno.env.get('CLAUDE_MODEL') ||
    DEFAULT_TEXT_MODEL
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 4096,
      messages: [{ role: 'user', content: opts.prompt }],
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    if (res.status === 401) {
      throw new Error(`Claude API error (401). invalid x-api-key${anthropic401Hint()}`)
    }
    throw new Error(`Claude API ${res.status}: ${t.slice(0, 600)}`)
  }
  const j = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>
  }
  const blocks = j?.content
  if (!Array.isArray(blocks)) {
    throw new Error('Invalid Claude response shape')
  }
  let text = ''
  for (const b of blocks) {
    if (b?.type === 'text' && typeof b.text === 'string') text += b.text
  }
  return text.trim()
}
