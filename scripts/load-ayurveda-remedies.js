/**
 * Load Ayurvedic remedies into Supabase ayurveda_remedy_lookup.
 *
 * Supports:
 * 1. CSV (comma-separated, header): category, marker_name, condition, remedy_text, lifestyle_modification[, dosage_notes, precautions, source]
 * 2. Semicolon-delimited: category ; marker_name ; condition ; remedy_text ; lifestyle_modification [; dietary_recommendations]. Header row (Category;Marker;...) is auto-skipped.
 * 3. Packed CSV: comma-delimited file where the first column is a quoted value containing semicolon-separated fields (Category;Marker;Condition;"Remedy";"Lifestyle";"Dietary"). Auto-detected when first line starts with " and contains ";".
 *
 * Usage: node scripts/load-ayurveda-remedies.js <path-to-file>
 * Marker names (e.g. "Hemoglobin (HB)") are mapped to canonical (e.g. "Hemoglobin") via blood_marker_reference.
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env') })

const filePath = process.argv[2] || join(__dirname, '..', 'ayurveda_remedies.csv')

if (!existsSync(filePath)) {
  console.error('File not found:', filePath)
  console.error('Usage: node scripts/load-ayurveda-remedies.js <path-to-csv-or-semicolon-file>')
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
  const header = parseDelimLine(lines[0], ',').map((h) => h.toLowerCase().replace(/^"|"$/g, ''))
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseDelimLine(lines[i], ',')
    const obj = {}
    header.forEach((h, idx) => { obj[h] = (values[idx] ?? '').replace(/^"|"$/g, '').trim() })
    rows.push(obj)
  }
  return rows
}

/** Split by semicolon, respecting double-quoted regions ("" = escaped quote). */
function parseSemicolonWithQuotes(str) {
  const parts = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (c === '"') {
      if (inQuotes && str[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (c === ';' && !inQuotes) {
      parts.push(current.replace(/""/g, '"').trim())
      current = ''
    } else {
      current += c
    }
  }
  parts.push(current.replace(/""/g, '"').trim())
  return parts
}

/** Extract the first quoted value from a line. Content has commas and inner quotes, so we find the cell end by locating the last "," that is followed only by commas to end of line. */
function extractFirstQuotedCell(line) {
  const start = line.indexOf('"')
  if (start === -1) return ''
  // Find last "," such that rest of line is only commas (and maybe whitespace)
  let endIdx = -1
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"' && line[i + 1] === ',') {
      const after = line.slice(i + 2).replace(/,/g, '').trim()
      if (after === '') {
        endIdx = i
      }
    }
  }
  if (endIdx === -1) return line.slice(start + 1).replace(/""/g, '"').trim()
  return line.slice(start + 1, endIdx).replace(/""/g, '"').trim()
}

/** Packed CSV: one comma-delimited column whose value is semicolon-separated (Category;Marker;Condition;"R";"L";"D"). Inner content may contain commas, so we extract the single quoted cell by hand. */
function parsePackedCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const rows = []
  const isHeader = (parts) => {
    const p0 = (parts[0] || '').toLowerCase()
    const p1 = (parts[1] || '').toLowerCase()
    return p0 === 'category' && (p1 === 'marker' || p1 === 'marker_name')
  }
  for (const line of lines) {
    const cell = extractFirstQuotedCell(line).trim()
    if (!cell) continue
    const parts = parseSemicolonWithQuotes(cell)
    if (parts.length < 5) continue
    if (isHeader(parts)) continue
    rows.push({
      category: parts[0] || '',
      marker_name: parts[1] || '',
      condition: parts[2] || '',
      remedy_text: parts[3] || '',
      lifestyle_modification: parts[4] || '',
      dietary_recommendations: parts[5] != null ? String(parts[5]).trim() || null : null,
    })
  }
  return rows
}

function parseFile(text) {
  const firstLine = text.split(/\r?\n/)[0] || ''
  const first = firstLine.toLowerCase()
  if (firstLine.startsWith('"') && firstLine.includes(';')) {
    return parsePackedCSV(text)
  }
  const isCSV = (first.includes('marker_name') || first.includes('category')) && first.includes(',')
  return isCSV ? parseCSV(text) : parseSemicolon(text)
}

function buildMarkerMap(ref) {
  const map = new Map()
  for (const r of ref || []) {
    const name = (r.name || '').trim()
    if (!name) continue
    map.set(name.toLowerCase(), name)
    for (const a of r.aliases || []) {
      const al = String(a).trim().toLowerCase()
      if (al) map.set(al, name)
    }
  }
  return map
}

function parseDelimLine(line, delim = ',') {
  const values = []
  let current = ''
  let inQuotes = false
  for (let j = 0; j < line.length; j++) {
    const c = line[j]
    if (c === '"') inQuotes = !inQuotes
    else if (c === delim && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else current += c
  }
  values.push(current.trim())
  return values
}

/** Semicolon format: category ; marker_name ; condition ; remedy_text ; lifestyle_modification [; dietary_recommendations].
 * Optional 6th column = dietary_recommendations. First line is skipped if it looks like a header (Category;Marker;Condition;...).
 */
function parseSemicolon(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const rows = []
  const isHeader = (parts) => {
    const p0 = (parts[0] || '').toLowerCase()
    const p1 = (parts[1] || '').toLowerCase()
    return p0 === 'category' && (p1 === 'marker' || p1 === 'marker_name')
  }
  for (let i = 0; i < lines.length; i++) {
    const parts = parseDelimLine(lines[i], ';')
    if (parts.length < 5) continue
    if (i === 0 && isHeader(parts)) continue
    rows.push({
      category: parts[0] || '',
      marker_name: parts[1] || '',
      condition: parts[2] || '',
      remedy_text: parts[3] || '',
      lifestyle_modification: parts[4] || '',
      dietary_recommendations: parts[5] != null ? String(parts[5]).trim() || null : null,
    })
  }
  return rows
}

async function main() {
  const text = readFileSync(filePath, 'utf8')
  const rows = parseFile(text)
  if (rows.length === 0) {
    console.error('No valid rows. Use CSV (header + comma) or semicolon format: category ; marker_name ; condition ; remedy_text ; lifestyle_modification')
    process.exit(1)
  }
  const { data: refData } = await supabase.from('blood_marker_reference').select('name, aliases')
  const markerMap = buildMarkerMap(refData)

  const required = ['marker_name', 'condition', 'remedy_text']
  const valid = rows.filter((r) => {
    const ok = required.every((k) => r[k] != null && String(r[k]).trim())
    if (!ok && (r.marker_name || r.remedy_text)) console.warn('Skipping row (missing required):', r)
    return ok
  })
  // Prefer exact reference name so e.g. "Urea" stays "Urea" even if BUN has "Urea" as alias
  const exactRefName = (raw) => {
    const r = refData.find((row) => (row.name || '').trim().toLowerCase() === raw.toLowerCase())
    return r?.name?.trim() || null
  }
  // Master CSV uses these names; reference may not have them as alias — map to canonical for app lookup
  const fallbackMarkerNames = {
    'SGPT (ALT)': 'ALT',
    'ALP (Alkaline Phosphatase)': 'Alkaline Phosphatase',
    'Bilirubin Direct': 'Bilirubin (Direct)',
    'Bilirubin Indirect': 'Bilirubin (Indirect)',
  }
  const categoryMap = { cbc: 'Blood', lipid: 'Heart', lft: 'Liver', kft: 'Kidney' }
  const normalized = valid.map((r) => {
    const raw = String(r.marker_name).trim()
    const canonical = exactRefName(raw) || markerMap.get(raw.toLowerCase()) || fallbackMarkerNames[raw] || raw
    if (canonical !== raw) console.log('  Mapped "' + raw + '" → "' + canonical + '"')
    let cat = r.category != null ? String(r.category).trim() || null : null
    if (cat) cat = categoryMap[cat.toLowerCase()] || cat
    return {
      category: cat,
      marker_name: canonical,
      condition: (() => { const c = String(r.condition).trim().toLowerCase(); return (c === 'high' || c === 'high risk' || c === 'positive') ? 'high' : 'low'; })(),
      remedy_text: String(r.remedy_text).trim(),
      lifestyle_modification: r.lifestyle_modification != null ? String(r.lifestyle_modification).trim() || null : null,
      dietary_recommendations: (r.dietary_recommendations ?? r['dietary recommendations']) != null ? String(r.dietary_recommendations ?? r['dietary recommendations']).trim() || null : null,
      dosage_notes: r.dosage_notes != null ? String(r.dosage_notes).trim() || null : null,
      precautions: r.precautions != null ? String(r.precautions).trim() || null : null,
      source: r.source != null ? String(r.source).trim() || null : null,
    }
  })

  // Deduplicate by (marker_name, condition) - last wins (e.g. Urine Albumin and Urine Protein both map to Urine Protein)
  const seen = new Map()
  const deduped = []
  for (const row of normalized) {
    const key = `${row.marker_name}|${row.condition}`
    seen.set(key, row)
  }
  for (const row of seen.values()) deduped.push(row)

  console.log('Upserting', deduped.length, 'rows into ayurveda_remedy_lookup...')
  const { data, error } = await supabase.from('ayurveda_remedy_lookup').upsert(deduped, {
    onConflict: 'marker_name,condition',
  })
  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
  console.log('Done.')
}

main()
