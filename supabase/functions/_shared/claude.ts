/** Anthropic Messages API — text completion only (no embeddings). */

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
    'claude-3-5-sonnet-20241022'

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
    throw new Error(`Claude API error (${res.status}). ${detail}`)
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
    'claude-3-5-haiku-20241022'
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
