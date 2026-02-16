/**
 * Ingest Ayurveda PDFs: extract text, chunk, embed (Google gemini-embedding-001), store in Supabase.
 * Run: npm run ingest:ayurveda
 * Requires: .env with VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GEMINI_API_KEY (or VITE_SUPABASE_ANON_KEY if RLS allows insert).
 */

import { config } from 'dotenv'
import { createRequire } from 'module'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
// Load .env from project root so it works regardless of cwd
config({ path: join(ROOT, '.env') })

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const KNOWLEDGE_BASE = join(ROOT, 'ayurvedaknowledgebase')

const CHUNK_SIZE = 600
const CHUNK_OVERLAP = 100
const EMBED_DIM = 768
const BATCH_SIZE = 5
/** Process text in segments to avoid holding entire book in memory */
const SEGMENT_CHARS = 50000
/** Free tier: 100 embed requests per minute. Space batches so we stay under (6s ≈ 50 req/min). */
const DELAY_BETWEEN_BATCHES_MS = 6000
/** Supabase request timeout (default 10s can be too short on some networks). */
const SUPABASE_TIMEOUT_MS = 60000
const EMBED_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent'

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** fetch with longer timeout for Supabase (avoids Connect Timeout Error on slow networks). */
function fetchWithTimeout(url, options = {}, timeoutMs = SUPABASE_TIMEOUT_MS) {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), timeoutMs)
  return fetch(url, { ...options, signal: c.signal }).finally(() => clearTimeout(t))
}

function chunkText(text) {
  const chunks = []
  let start = 0
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned.length) return chunks
  while (start < cleaned.length) {
    let end = Math.min(start + CHUNK_SIZE, cleaned.length)
    if (end < cleaned.length) {
      const nextSpace = cleaned.lastIndexOf(' ', end)
      if (nextSpace > start) end = nextSpace + 1
    }
    const slice = cleaned.slice(start, end).trim()
    if (slice.length > 20) chunks.push(slice)
    // Always advance so we never loop forever (overlap can't go past current end)
    const nextStart = end - CHUNK_OVERLAP
    start = nextStart <= start ? end : nextStart
    if (start >= cleaned.length) break
  }
  return chunks
}

/** Get embedding with retry on 429 (rate limit). Free tier: 100 requests/minute. */
async function getEmbedding(text, apiKey, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(`${EMBED_API}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: text.slice(0, 8000) }] },
        outputDimensionality: EMBED_DIM
      })
    })
    if (res.ok) {
      const data = await res.json()
      const values = data?.embedding?.values
      if (!Array.isArray(values) || values.length !== EMBED_DIM) throw new Error('Invalid embedding response')
      return values
    }
    const errText = await res.text()
    if (res.status === 429) {
      let isDailyQuota = false
      try {
        const errJson = JSON.parse(errText)
        const quotaFailure = errJson?.error?.details?.find((d) => d['@type']?.includes('QuotaFailure'))
        const quotaId = quotaFailure?.violations?.[0]?.quotaId || ''
        if (quotaId.includes('PerDay') || /limit: 1000/.test(errText)) {
          isDailyQuota = true
        }
      } catch (_) {
        if (/limit: 1000|PerDay|per day/i.test(errText)) isDailyQuota = true
      }
      if (isDailyQuota) {
        console.error('\n  Daily embed limit (1000 requests/day) reached. Chunks ingested so far are saved in the database.')
        console.error('  You can use "Generate Ayurveda analysis" with existing chunks. Try ingestion again tomorrow.\n')
        throw new Error('Embed API daily quota exceeded. Try again tomorrow.')
      }
      if (attempt < retries) {
        let waitMs = 60000
        try {
          const errJson = JSON.parse(errText)
          const retryInfo = errJson?.error?.details?.find((d) => d['@type']?.includes('RetryInfo'))
          if (retryInfo?.retryDelay) {
            const s = String(retryInfo.retryDelay).replace('s', '')
            waitMs = Math.ceil(parseFloat(s) * 1000) || 60000
          }
        } catch (_) {
          const match = errText.match(/retry in ([\d.]+)s/i)
          if (match) waitMs = Math.ceil(parseFloat(match[1]) * 1000)
        }
        if (waitMs < 5000) waitMs = 60000
        console.log(`  Rate limited (429). Waiting ${Math.round(waitMs / 1000)}s before retry (attempt ${attempt}/${retries})...`)
        await delay(waitMs)
        continue
      }
    }
    throw new Error(`Embed API error: ${res.status} ${errText}`)
  }
  throw new Error('Embed API failed after retries')
}

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) in .env')
    process.exit(1)
  }
  if (!apiKey || !String(apiKey).trim()) {
    console.error('Missing GEMINI_API_KEY in .env (same key works for Embedding API). Run from project root so .env is loaded.')
    process.exit(1)
  }
  const apiKeyToUse = String(apiKey).trim()
  if (apiKeyToUse !== apiKey) console.warn('API key had leading/trailing whitespace; using trimmed value.')
  const keyLen = apiKeyToUse.length
  console.log('Gemini API key: length', keyLen, '(loaded from .env)')

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { fetch: (url, opts) => fetchWithTimeout(url, opts, SUPABASE_TIMEOUT_MS) }
  })

  // Fail fast if Supabase is unreachable (e.g. project paused, wrong URL)
  const { error: pingErr } = await supabase.from('ayurveda_chunks').select('id').limit(1)
  if (pingErr) {
    const msg = pingErr.message || ''
    if (/fetch failed|ECONNREFUSED|ETIMEDOUT|PGRST301/i.test(msg) || pingErr.cause) {
      console.error('Cannot reach Supabase:', msg)
      if (pingErr.cause) console.error('  Cause:', pingErr.cause)
      console.error('\n  Check: 1) Supabase project not PAUSED (Dashboard → Restore if paused)  2) VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env are correct.')
      process.exit(1)
    }
  }

  let files
  try {
    files = readdirSync(KNOWLEDGE_BASE).filter(f => f.toLowerCase().endsWith('.pdf'))
  } catch (e) {
    console.error('Could not read ayurvedaknowledgebase folder:', e.message)
    process.exit(1)
  }
  if (files.length === 0) {
    console.error('No PDF files in ayurvedaknowledgebase/')
    process.exit(1)
  }
  // Optional: ingest only one file (e.g. node script.js "filename.pdf")
  const onlyFile = process.argv[2]
  if (onlyFile) {
    const match = files.find(f => f === onlyFile || f.endsWith(onlyFile))
    if (!match) {
      console.error('File not found:', onlyFile, '\nAvailable:', files.join(', '))
      process.exit(1)
    }
    files = [match]
  }

  console.log('PDFs to ingest:', files.join(', '))

  for (const file of files) {
    const path = join(KNOWLEDGE_BASE, file)
    console.log('\nProcessing', file, '...')
    let buffer
    try {
      buffer = readFileSync(path)
    } catch (e) {
      console.error('Read failed:', e.message)
      continue
    }
    let text
    try {
      const result = await pdfParse(buffer)
      text = result?.text || ''
    } catch (e) {
      console.error('PDF parse failed:', e.message)
      continue
    }
    buffer = null
    if (!text || text.length < 100) {
      console.warn('Skipping (too little text):', file)
      continue
    }
    // Resume: skip chunks already in DB for this file (e.g. after daily quota or crash)
    const { count: existingCount } = await supabase.from('ayurveda_chunks').select('*', { count: 'exact', head: true }).eq('source', file)
    const skipCount = existingCount ?? 0
    if (skipCount > 0) {
      console.log('  Resuming: ' + skipCount + ' chunks already in DB for this file, skipping to next...')
    }
    let fileChunkIndex = 0
    let totalInserted = 0
    for (let segStart = 0; segStart < text.length; segStart += SEGMENT_CHARS) {
      const segment = text.slice(segStart, segStart + SEGMENT_CHARS).replace(/\s+/g, ' ').trim()
      if (segment.length < 50) continue
      const chunks = chunkText(segment)
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE)
        if (fileChunkIndex < skipCount) {
          fileChunkIndex += batch.length
          continue
        }
        const embeddings = await Promise.all(batch.map((c) => getEmbedding(c, apiKeyToUse)))
        const rows = batch.map((content, j) => ({
          content,
          embedding: embeddings[j],
          source: file
        }))
        const MAX_INSERT_RETRIES = 6
        const INSERT_RETRY_DELAY_MS = 15000
        let insertOk = false
        for (let tryInsert = 1; tryInsert <= MAX_INSERT_RETRIES; tryInsert++) {
          const { error } = await supabase.from('ayurveda_chunks').insert(rows)
          if (!error) {
            insertOk = true
            break
          }
          const errStr = (error.message || '') + (error.details || '')
          const isNetwork = /fetch failed|ECONNRESET|ETIMEDOUT|Connect Timeout|timeout.*10000|network/i.test(errStr) || error?.cause
          if (isNetwork && tryInsert < MAX_INSERT_RETRIES) {
            console.warn('  Insert failed (connect timeout?). Retry ' + tryInsert + '/' + MAX_INSERT_RETRIES + ' in ' + INSERT_RETRY_DELAY_MS / 1000 + 's...')
            await delay(INSERT_RETRY_DELAY_MS)
            continue
          }
          console.error('Insert error:', error.message)
          if (error.cause) console.error('  Cause:', error.cause)
          try { console.error('  Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2)) } catch (_) {}
          console.error('\n  Chunks up to this batch are saved. Run the same command again; it will RESUME from chunk ' + fileChunkIndex + '.')
          console.error('  If timeouts persist: try another network (e.g. mobile hotspot) or run ingestion later.')
          process.exit(1)
        }
        if (!insertOk) process.exit(1)
        fileChunkIndex += batch.length
        totalInserted += batch.length
        if (totalInserted % 50 < BATCH_SIZE) console.log('  Inserted', totalInserted, 'new chunks (total for file: ' + fileChunkIndex + ')')
        if (i + BATCH_SIZE < chunks.length) await delay(DELAY_BETWEEN_BATCHES_MS)
      }
    }
    console.log('Done:', file, '(' + (skipCount + totalInserted) + ' chunks total, ' + totalInserted + ' new this run)')
  }

  const { count } = await supabase.from('ayurveda_chunks').select('*', { count: 'exact', head: true })
  console.log('\nTotal chunks in DB:', count)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
