/**
 * Load Ayurvedic remedies from CSV into Supabase table ayurveda_remedy_lookup.
 * Usage: node scripts/load-ayurveda-remedies.js path/to/ayurveda_remedies.csv
 * Requires .env with VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY).
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env') })

const csvPath = process.argv[2] || join(__dirname, '..', 'ayurveda_remedies.csv')

if (!existsSync(csvPath)) {
  console.error('CSV file not found:', csvPath)
  console.error('Usage: node scripts/load-ayurveda-remedies.js <path-to-csv>')
  process.exit(1)
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) in .env')
  process.exit(1)
}

import { createClient } from '@supabase/supabase-js'
const supabase = createClient(url, key)

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const header = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''))
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const obj = {}
    header.forEach((h, idx) => { obj[h] = (values[idx] ?? '').replace(/^"|"$/g, '') })
    rows.push(obj)
  }
  return rows
}

function parseCSVLine(line) {
  const values = []
  let current = ''
  let inQuotes = false
  for (let j = 0; j < line.length; j++) {
    const c = line[j]
    if (c === '"') inQuotes = !inQuotes
    else if (c === ',' && !inQuotes) {
      values.push(current)
      current = ''
    } else current += c
  }
  values.push(current)
  return values
}

async function main() {
  const text = readFileSync(csvPath, 'utf8')
  const rows = parseCSV(text)
  const required = ['marker_name', 'condition', 'remedy_text']
  const valid = rows.filter((r) => {
    const ok = required.every((k) => r[k] != null && String(r[k]).trim())
    if (!ok && (r.marker_name || r.remedy_text)) console.warn('Skipping row (missing required):', r)
    return ok
  })
  const normalized = valid.map((r) => ({
    marker_name: String(r.marker_name).trim(),
    condition: String(r.condition).trim().toLowerCase() === 'high' ? 'high' : 'low',
    remedy_text: String(r.remedy_text).trim(),
    dosage_notes: r.dosage_notes != null ? String(r.dosage_notes).trim() || null : null,
    precautions: r.precautions != null ? String(r.precautions).trim() || null : null,
    source: r.source != null ? String(r.source).trim() || null : null,
  }))

  console.log('Upserting', normalized.length, 'rows into ayurveda_remedy_lookup...')
  const { data, error } = await supabase.from('ayurveda_remedy_lookup').upsert(normalized, {
    onConflict: 'marker_name,condition',
  })
  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
  console.log('Done.')
}

main()
