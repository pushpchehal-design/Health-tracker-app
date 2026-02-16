// Supabase Edge Function for Health Report Analysis
// NO-AI path: Extract text from PDF → parse with blood_marker_reference → save. No Gemini.
// Fallback: If no text (e.g. scanned PDF) or not PDF, optional Gemini analysis when API key is set.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// unpdf is imported dynamically inside the handler to avoid BOOT_ERROR at cold start

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

interface AnalysisRequest {
  fileUrl?: string
  filePath?: string
  fileType: string
  reportId: string
  useAiFallback?: boolean
}

interface RefRow {
  name: string
  aliases: string[] | null
  unit: string
  normal_low: number
  normal_high: number
  category: string
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Numbers that appear inside the parameter name (e.g. 25 from "25-OH Vitamin D"). We must not use these as the result value. */
function numbersInParamName(paramName: string): number[] {
  const matches = paramName.match(/\d+/g)
  if (!matches) return []
  return [...new Set(matches.map(s => parseInt(s, 10)))].filter(n => !Number.isNaN(n))
}

/** Find the first number in str, optionally after startIndex. Handles decimals and commas. */
function extractNumberAfter(str: string, startIndex: number = 0): { value: number; raw: string } | null {
  const slice = str.slice(startIndex)
  const match = slice.match(/(\d+[.,]\d+|\d+)/)
  if (!match) return null
  const raw = match[1].replace(',', '.')
  const value = parseFloat(raw)
  return Number.isNaN(value) ? null : { value, raw: match[1] }
}

/** Find first number in str that looks like a result value (not part of "X - Y" range). Scans up to maxChars. */
function findNextResultNumber(str: string, maxChars: number = 400): { value: number; raw: string } | null {
  const chunk = str.slice(0, maxChars)
  const numRe = /\d+[.,]\d+|\d+/g
  let m: RegExpExecArray | null
  while ((m = numRe.exec(chunk)) !== null) {
    const raw = m[0]
    const before = chunk.slice(Math.max(0, m.index - 4), m.index)
    const after = chunk.slice(m.index + raw.length, m.index + raw.length + 8)
    if (/-\s*$/.test(before)) continue
    if (/^\s*-\s*[\d.,]/.test(after)) continue
    const valueStr = raw.replace(',', '.')
    const value = parseFloat(valueStr)
    if (Number.isNaN(value)) continue
    return { value, raw }
  }
  return null
}

/** Whether a value is plausible for a parameter (wide bounds so we don't reject real lab values). */
function isPlausibleValue(value: number, normalLow: number, normalHigh: number): boolean {
  const low = Number(normalLow)
  const high = Number(normalHigh)
  const minPlausible = Math.max(0, Math.min(low * 0.05, low - 15))
  const maxPlausible = Math.min(high * 4, high + 200)
  return value >= minPlausible && value <= maxPlausible
}

/** Find first result-like number in str that is plausible for the given reference range. Rejects e.g. 102,103 (address) for CO2, or 1.0 (from another test) for Potassium. */
function findNextPlausibleResultNumber(str: string, normalLow: number, normalHigh: number, maxChars: number = 400): { value: number; raw: string } | null {
  const chunk = str.slice(0, maxChars)
  const numRe = /\d+[.,]\d+|\d+/g
  let m: RegExpExecArray | null
  while ((m = numRe.exec(chunk)) !== null) {
    const raw = m[0]
    const before = chunk.slice(Math.max(0, m.index - 4), m.index)
    const after = chunk.slice(m.index + raw.length, m.index + raw.length + 8)
    if (/-\s*$/.test(before)) continue
    if (/^\s*-\s*[\d.,]/.test(after)) continue
    if (/^\s*,\s*\d/.test(after)) continue
    const valueStr = raw.replace(',', '.')
    const value = parseFloat(valueStr)
    if (Number.isNaN(value)) continue
    if (!isPlausibleValue(value, normalLow, normalHigh)) continue
    return { value, raw }
  }
  return null
}

/** Like findNextPlausibleResultNumber but also accepts values in 10^3 scale (e.g. 7.55 when range is 4500-11000). Returns the value AS PRINTED (e.g. 7.55), not scaled. */
function findNextPlausibleResultNumberOrScaled(str: string, normalLow: number, normalHigh: number, maxChars: number = 400): { value: number; raw: string; unitAsIs?: string } | null {
  const chunk = str.slice(0, maxChars)
  const numRe = /\d+[.,]\d+|\d+/g
  let m: RegExpExecArray | null
  while ((m = numRe.exec(chunk)) !== null) {
    const raw = m[0]
    const before = chunk.slice(Math.max(0, m.index - 12), m.index)
    const after = chunk.slice(m.index + raw.length, m.index + raw.length + 20)
    if (/-\s*$/.test(before)) continue
    if (/[\d.,]\s*-\s*\d*$/.test(before)) continue
    if (/^\s*-\s*[\d.,]/.test(after)) continue
    if (/^\s*,\s*\d/.test(after)) continue
    const valueStr = raw.replace(',', '.')
    const value = parseFloat(valueStr)
    if (Number.isNaN(value)) continue
    if (isPlausibleValue(value, normalLow, normalHigh)) return { value, raw }
    if (value < 1000 && normalHigh > 100 && isPlausibleValue(value * 1000, normalLow, normalHigh))
      return { value, raw, unitAsIs: '10^3/µL' }
  }
  return null
}

/** Context that indicates a number is NOT a lab result (ID, date, address, etc.). */
const NOT_RESULT_CONTEXT = /REG\s*NO|Patient\s*ID|Lab\s*ID|Flat\s*No|Ref\s*By|Page\s+\d|DOB\s*:|Age\s*:\s*$|ID\s*:\s*\d|No\.\s*\d|:\s*16-\d{2}-20\d{2}|20\d{2}\s*\/\s*\d{2}|Collected\s*:|Received\s*:|Reported\s*:|BS\s*$|Client\s*$/i

/** All result-like numbers in str with their start offset. Skips 10^3/10^6, ranges, addresses, years, ID/date context. */
function findAllResultNumbers(
  str: string,
  maxChars: number = 800,
  contextBefore: string = ''
): Array<{ start: number; value: number; raw: string; hasDecimal: boolean }> {
  const chunk = str.slice(0, maxChars)
  const out: Array<{ start: number; value: number; raw: string; hasDecimal: boolean }> = []
  const numRe = /\d+[.,]\d+|\d+/g
  let m: RegExpExecArray | null
  while ((m = numRe.exec(chunk)) !== null) {
    const raw = m[0]
    const before = chunk.slice(Math.max(0, m.index - 4), m.index)
    const after = chunk.slice(m.index + raw.length, m.index + raw.length + 8)
    if (/-\s*$/.test(before)) continue
    if (/^\s*-\s*[\d.,]/.test(after)) continue
    if (/^\s*,\s*\d/.test(after)) continue
    if (/10\^$/.test(before)) continue
    if (/^\^/.test(after)) continue
    const valueStr = raw.replace(',', '.')
    const value = parseFloat(valueStr)
    if (Number.isNaN(value)) continue
    if (value === 10 && /^\^[36]/.test(after)) continue
    if (Number.isInteger(value) && value >= 1900 && value <= 2099) continue
    const preceding = (contextBefore + chunk.slice(0, m.index)).slice(-60)
    if (NOT_RESULT_CONTEXT.test(preceding)) continue
    const hasDecimal = /[.,]\d|\d[.,]/.test(raw)
    out.push({ start: m.index, value, raw, hasDecimal })
  }
  return out
}

/** True if line looks like a result value: "0.83", "H 13", "18.90", or "70.90 µg/dL" (value + optional unit). Rejects ref ranges and address-style (comma). */
function isValueOnlyLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  if (/,/.test(t)) return false
  if (/[\d.,]+\s*-\s*[\d.,]/.test(t)) return false
  const m = t.match(/^\s*(H|L)?\s*([\d.,]+)\s*(.*)$/)
  if (!m) return false
  const rest = m[3].trim()
  if (!rest) return true
  return looksLikeUnit(rest) || /^(mg|g|mmol|mEq|µg|ug|ng|pg|U|%|fL|Pg|ratio|mm)\s*\/?\s*(dL|L|mL|mcL|hpf|min)/i.test(rest)
    || /^10\^[36]\s*\/\s*[μµu]?L$/i.test(rest) || /^[μµu]?g\/dL$/i.test(rest)
}

/** Boilerplate / header / method lines we should not treat as parameter lines (address, footer, labels, method names). */
const PARAM_LINE_SKIP = /^(Unit Biological Ref\. Interval|Parameter Result|Processed At|Location|Gender|CRM|Collected|Received|DOB|Age|Ref By|Client|Reported|Lab ID|Page \d|Flat No|H-High L- Low|Clinical significance|Ayushman|Novocura|Lifecell|Consultant|This is a computer|Sample Quality|Reg NO|DR\.|Mr\.|Ms\.|Years|Status|Final|--------|Nil|Absent|Negative|Clear|Pale Yellow|Normal|Adequate|Within normal|Microscopy|Visual|Differential|Absolute|Leucocytes|Platelets|PBS Findings|RBC Morphology|WBC Morphology|Thalassaemia|Mentzer|Strong suspect|Kindly correlate|Calculated|ENZYMATIC|Direct ISE|DIAZO|IFCC|GOD-POD|CLIA|HPLC|Colorimetric|Electrical Impedance|Flowcytometry|Westergren|BIURET|BCG|CHOP-PAP|GPO|DIRECT|UREASE|Arsenazo|Ferrene|Ferrozine|Immuno|Immunoturbidimetry|Xylidyl Blue|PHOSPHO|URICASE|Lactate to pyruvate)/i

/** Detect if a string looks like a unit (mg/dL, U/L, %, 10^3/μL, etc.). */
function looksLikeUnit(s: string): boolean {
  const t = s.trim()
  return /^(mg\/dL|g\/dL|gm\/dL|mmol\/L|mEq\/L|μIU\/mL|uIU\/mL|μg\/dL|ug\/dL|ng\/mL|pg\/mL|U\/L|%|fL|Pg|ratio|mm\/hr|10\^3|10\^6|\/hpf|ml\/min)/i.test(t)
    || /^(10\^[36]\/[μµu]?L|10\^[36]\s*\/\s*[μµu]?L|cells\/[μµu]?L|million\/mcL|×\s*10\^[36])/i.test(t)
    || /\/[a-zA-Z]/.test(t) || /^%\s*$/.test(t) || /^[μµu]?L\s*$/i.test(t)
}

/** Extract parameter name from a line that looks like "Ref\tUnit\tParameter Name" or "Unit\tParameter Name". Returns null if not a parameter line. */
function parseParameterLine(line: string): { paramName: string; unit?: string } | null {
  const t = line.trim()
  if (!t || t.length < 4 || PARAM_LINE_SKIP.test(t)) return null
  let parts = t.split(/\t/)
  if (parts.length === 1) parts = t.split(/\s{2,}/)
  if (parts.length >= 3) {
    const paramPart = parts[parts.length - 1].trim()
    const mid = parts[parts.length - 2].trim()
    if (paramPart && /[a-zA-Z]/.test(paramPart) && paramPart !== 'Result' && paramPart !== 'Parameter') {
      if (looksLikeUnit(mid)) return { paramName: paramPart, unit: mid }
      return { paramName: paramPart }
    }
  }
  if (parts.length === 2) {
    const a = parts[0].trim()
    const b = parts[1].trim()
    if (b && /[a-zA-Z]/.test(b) && b !== 'Result' && b !== 'Parameter') {
      if (looksLikeUnit(a)) return { paramName: b, unit: a }
      if (/[\d.,\s\-]+/.test(a) && !/^[\d.,\s\-]+$/.test(b)) return { paramName: b }
    }
  }
  if (parts.length === 1 && /[a-zA-Z]/.test(t)) {
    if (/^[0-9.,\s\-]+\s+[a-zA-Z]/.test(t)) {
      const match = t.match(/\s+([A-Za-z].+)$/)
      if (match) return { paramName: match[1].trim() }
    }
    if (/[\d.,]\s*-\s*[\d.,]/.test(t)) {
      const m = t.match(/^.+?\s+([A-Za-z][A-Za-z0-9\s\-\/\(\)\,]+)$/)
      if (m && m[1].length >= 2 && m[1].length <= 80) return { paramName: m[1].trim() }
    }
    if (/^[A-Za-z][A-Za-z0-9\s\/\-\(\)\,]+$/.test(t) && t.length >= 2 && t.length <= 80) {
      if (/^(eGFR|ESR|MPV|PDW|RDW|MCV|MCH|MCHC|TIBC|UIBC|LDH|CRP|HbA1c|BUN|RBC|WBC|Neutrophils|Lymphocytes|Monocytes|Eosinophils|Basophils|PlateletCrit|PLCR)$/i.test(t)) return { paramName: t }
      if (/,\s*Serum$|,\s*Plasma$|,\s*Blood$|,\s*Urine$/i.test(t)) return { paramName: t }
    }
  }
  return null
}

/** If line contains a reference param name/alias at word boundary, return that row (longest match first). */
function paramNameFromLineByReference(line: string, referenceRows: RefRow[]): { paramName: string; row: RefRow } | null {
  const t = line.trim()
  if (!t || t.length < 2 || isValueOnlyLine(line) || PARAM_LINE_SKIP.test(t)) return null
  const lineLower = t.toLowerCase()
  const allNames: { name: string; row: RefRow }[] = []
  for (const row of referenceRows) {
    allNames.push({ name: row.name, row })
    for (const a of row.aliases || []) allNames.push({ name: a, row })
  }
  allNames.sort((a, b) => b.name.length - a.name.length)
  for (const { name, row } of allNames) {
    if (name.length < 2) continue
    const nameLower = name.toLowerCase()
    if (!lineLower.includes(nameLower)) continue
    const idx = lineLower.indexOf(nameLower)
    if (idx > 0 && /[a-z0-9]/.test(lineLower[idx - 1])) continue
    if (idx + name.length < line.length && /[a-z0-9]/.test(lineLower[idx + name.length])) continue
    const after = t.slice(idx + name.length).trim()
    if (after && !looksLikeUnit(after) && !/^[\d.,\s\-]+$/.test(after)) continue
    return { paramName: name, row }
  }
  return null
}

/** Max lines to look ahead for a value after a parameter line (covers method/boilerplate lines). */
const STRUCTURE_VALUE_WINDOW = 15

/** Structure-based extraction: each "Ref Unit Parameter" line is paired with the first VALUE-ONLY line in the next N lines
 *  that is PLAUSIBLE for that parameter's reference range (if known), and each value line is used at most once.
 *  This fixes wrong pairing (e.g. Phosphorus getting Creatinine's value) and recovers all Electrolytes. */
function extractAllParametersByStructure(
  text: string,
  referenceRows: RefRow[]
): Array<{ paramName: string; value: number; raw: string; unit?: string }> {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const out: Array<{ paramName: string; value: number; raw: string; unit?: string }> = []
  const usedValueLineIndex = new Set<number>()

  for (let i = 0; i < lines.length; i++) {
    let parsed = parseParameterLine(lines[i])
    if (!parsed) {
      const refMatch = paramNameFromLineByReference(lines[i], referenceRows)
      parsed = refMatch ? { paramName: refMatch.paramName, unit: undefined } : null
    }
    if (!parsed) continue
    const refRow = findReferenceRow(parsed.paramName, referenceRows)
    const nameNumbers = numbersInParamName(parsed.paramName)
    for (let j = i + 1; j < Math.min(i + 1 + STRUCTURE_VALUE_WINDOW, lines.length); j++) {
      if (!isValueOnlyLine(lines[j]) || usedValueLineIndex.has(j)) continue
      const numResult = extractNumberAfter(lines[j], 0)
      if (!numResult) continue
      if (nameNumbers.some(n => Math.abs(numResult.value - n) < 0.01)) continue
      if (refRow) {
        const low = Number(refRow.normal_low)
        const high = Number(refRow.normal_high)
        let valForCheck = numResult.value
        if (parsed.unit && /10\^3/i.test(parsed.unit) && high > 100) valForCheck = numResult.value * 1000
        else if (numResult.value < 1000 && high > 100 && isPlausibleValue(numResult.value * 1000, low, high)) valForCheck = numResult.value * 1000
        if (!isPlausibleValue(valForCheck, low, high)) continue
      }
      usedValueLineIndex.add(j)
      out.push({
        paramName: parsed.paramName,
        value: numResult.value,
        raw: numResult.raw,
        unit: parsed.unit
      })
      break
    }
  }
  return out
}

/** Find reference row that best matches paramName (name or any alias). Prefer exact then longest match. */
function findReferenceRow(paramName: string, referenceRows: RefRow[]): RefRow | null {
  const nameLower = paramName.toLowerCase().trim()
  let best: RefRow | null = null
  let bestLen = 0
  let exact = false
  for (const row of referenceRows) {
    const namesToTry = [row.name, ...(row.aliases || [])].filter(Boolean)
    for (const n of namesToTry) {
      const nLower = n.toLowerCase()
      const isExact = nameLower === nLower
      const isContained = nameLower.includes(nLower) || nLower.includes(nameLower)
      if (isExact || isContained) {
        if (isExact && !exact) {
          best = row
          bestLen = n.length
          exact = true
        } else if (!exact && isContained && n.length > bestLen) {
          bestLen = n.length
          best = row
        }
      }
    }
  }
  return best
}

/** Line-by-line parsing: PRIMARY = structure-based (all params in one pass); FALLBACK = same-line, value-on-next-line, whole-text. */
function parseTextWithReference(text: string, referenceRows: RefRow[]): { categories: Record<string, { parameters: any[]; risk_level: string }>; parameterRows: Array<{ category: string; parameter_name: string; parameter_value: string; normal_range: string; status: string }> } {
  const categories: Record<string, { parameters: any[]; risk_level: string }> = {}
  const parameterRows: Array<{ category: string; parameter_name: string; parameter_value: string; normal_range: string; status: string }> = []
  const foundParams = new Set<string>()

  const addParam = (row: RefRow, value: number, raw: string, reportParamName?: string, reportUnit?: string) => {
    const low = Number(row.normal_low)
    const high = Number(row.normal_high)
    let valForPlausibility = value
    if (value < 1000 && high > 100 && (reportUnit && /10\^3/i.test(reportUnit) || row.unit && /10\^3|cells\/mcL|cells\/μL/i.test(row.unit)))
      valForPlausibility = value * 1000
    if (row.name === 'Carbon Dioxide' && valForPlausibility > 50) return
    const refNameNumbers = numbersInParamName(row.name)
    for (const a of row.aliases || []) refNameNumbers.push(...numbersInParamName(a))
    if ([...new Set(refNameNumbers)].some(n => Math.abs(value - n) < 0.01)) return
    if (!isPlausibleValue(valForPlausibility, low, high)) return
    const normalRangeStr = `${row.normal_low} - ${row.normal_high} ${row.unit}`
    const status = valForPlausibility >= low && valForPlausibility <= high ? 'normal' : 'abnormal'
    const displayName = (reportParamName && reportParamName.trim()) || row.name
    const valueStrAsOnReport = reportUnit ? `${raw} ${reportUnit}`.trim() : `${raw} ${row.unit}`.trim()
    if (!categories[row.category]) categories[row.category] = { parameters: [], risk_level: 'Low' }
    categories[row.category].parameters.push({
      name: displayName,
      value: valueStrAsOnReport,
      normal_range: normalRangeStr,
      status
    })
    parameterRows.push({
      category: row.category,
      parameter_name: displayName,
      parameter_value: valueStrAsOnReport,
      normal_range: normalRangeStr,
      status
    })
    foundParams.add(row.name)
  }

  const addedOtherNames = new Set<string>()
  const addParamFromExtracted = (paramName: string, value: number, raw: string, unit?: string) => {
    const row = findReferenceRow(paramName, referenceRows)
    if (row && !foundParams.has(row.name)) {
      const low = Number(row.normal_low)
      const high = Number(row.normal_high)
      let valForCheck = value
      if (value < 1000 && high > 100 && (unit && /10\^3/i.test(unit))) valForCheck = value * 1000
      if (!isPlausibleValue(valForCheck, low, high)) return
      addParam(row, value, raw, paramName.trim(), unit)
      return
    }
    if (row) return
    const displayName = paramName.trim()
    if (addedOtherNames.has(displayName.toLowerCase())) return
    if (value > 500 || (unit && /mEq|mmol/i.test(unit) && value > 200)) return
    addedOtherNames.add(displayName.toLowerCase())
    const valueStr = `${raw} ${unit || ''}`.trim()
    if (!categories['Other']) categories['Other'] = { parameters: [], risk_level: 'Low' }
    categories['Other'].parameters.push({
      name: displayName,
      value: valueStr,
      normal_range: '-',
      status: 'unknown'
    })
    parameterRows.push({
      category: 'Other',
      parameter_name: displayName,
      parameter_value: valueStr,
      normal_range: '-',
      status: 'unknown'
    })
  }

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const textLower = text.toLowerCase()

  // PASS -2: Line-order pairing — param lines and value lines in document order; pair 1st with 1st, 2nd with 2nd.
  // Also: same-line value — "Ref Unit ParamName  Value" on one line (many CBC reports put value on same line).
  const paramOrder: { lineIdx: number; paramName: string; row: RefRow | null; unit?: string }[] = []
  const valueOrder: { lineIdx: number; value: number; raw: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const parsed = parseParameterLine(line)
    if (parsed) {
      const row = findReferenceRow(parsed.paramName, referenceRows)
      let addedFromSameLine = false
      if (row && !foundParams.has(row.name)) {
        const paramIdx = line.indexOf(parsed.paramName)
        if (paramIdx >= 0) {
          const afterParam = line.slice(paramIdx + parsed.paramName.length).trim()
          const low = Number(row.normal_low)
          const high = Number(row.normal_high)
          const numResult = findNextPlausibleResultNumberOrScaled(afterParam, low, high, 120)
          if (numResult) {
            const nameNumbers = numbersInParamName(parsed.paramName)
            if (!nameNumbers.some(n => Math.abs(numResult.value - n) < 0.01)) {
              const reportUnit = parsed.unit || numResult.unitAsIs
              addParam(row, numResult.value, numResult.raw, parsed.paramName, reportUnit)
              addedFromSameLine = true
            }
          }
        }
      }
      if (!addedFromSameLine) paramOrder.push({ lineIdx: i, paramName: parsed.paramName, row, unit: parsed.unit })
    } else {
      const refMatch = paramNameFromLineByReference(line, referenceRows)
      let addedFromRefMatchSameLine = false
      if (refMatch && !foundParams.has(refMatch.row.name)) {
        const paramIdx = line.toLowerCase().indexOf(refMatch.paramName.toLowerCase())
        if (paramIdx >= 0) {
          const afterParam = line.slice(paramIdx + refMatch.paramName.length).trim()
          const low = Number(refMatch.row.normal_low)
          const high = Number(refMatch.row.normal_high)
          const numResult = findNextPlausibleResultNumberOrScaled(afterParam, low, high, 120)
          if (numResult) {
            const nameNumbers = numbersInParamName(refMatch.paramName)
            if (!nameNumbers.some(n => Math.abs(numResult.value - n) < 0.01)) {
              addParam(refMatch.row, numResult.value, numResult.raw, refMatch.paramName, numResult.unitAsIs)
              addedFromRefMatchSameLine = true
            }
          }
        }
      }
      if (!addedFromRefMatchSameLine && refMatch && (/[\d.,\s\-]/.test(line) || line.length < 60)) {
        paramOrder.push({ lineIdx: i, paramName: refMatch.paramName, row: refMatch.row, unit: undefined })
      }
    }
    if (isValueOnlyLine(line)) {
      const numResult = extractNumberAfter(line, 0)
      if (numResult) {
        const prevLine = i > 0 ? lines[i - 1].trim() : ''
        const skipIdLike = (line === '4809' || line === 'BS4809') && (prevLine.endsWith('BS') || /BS\s*$/i.test(prevLine))
        if (!skipIdLike) valueOrder.push({ lineIdx: i, value: numResult.value, raw: numResult.raw })
      }
    }
  }
  // Pair each param to first UNUSED PLAUSIBLE value (skips header/footer junk). Store value AS ON REPORT.
  const usedValueIdx = new Set<number>()
  for (const p of paramOrder) {
    if (p.row && foundParams.has(p.row.name)) continue
    const row = p.row || findReferenceRow(p.paramName, referenceRows)
    for (let j = 0; j < valueOrder.length; j++) {
      if (usedValueIdx.has(j)) continue
      const v = valueOrder[j]
      const nameNumbers = numbersInParamName(p.paramName)
      if (nameNumbers.some(n => Math.abs(v.value - n) < 0.01)) continue
      if (row) {
        const low = Number(row.normal_low)
        const high = Number(row.normal_high)
        let valForCheck = v.value
        if (p.unit && /10\^3/i.test(p.unit) && high > 100) valForCheck = v.value * 1000
        if (!isPlausibleValue(valForCheck, low, high)) continue
        if (row.name === 'Carbon Dioxide' && v.value > 50) continue
        usedValueIdx.add(j)
        addParam(row, v.value, v.raw, p.paramName, p.unit)
      } else {
        if (addedOtherNames.has(p.paramName.toLowerCase())) continue
        if (v.value > 500) continue
        usedValueIdx.add(j)
        addParamFromExtracted(p.paramName, v.value, v.raw, p.unit)
      }
      break
    }
  }

  // PASS -1: Whole-text scan — find each param name in the raw text, then the next plausible number after it (no line logic).
  const paramOccurrences: { position: number; row: RefRow; nameLen: number }[] = []
  const normalizeForSearch = (s: string) => s.replace(/\s*\(\s*/g, '(').replace(/\s+/g, ' ').trim()
  for (const row of referenceRows) {
    if (foundParams.has(row.name)) continue
    const rawNames = [row.name, ...(row.aliases || [])].filter(Boolean)
    const namesToTry = [...new Set([...rawNames, ...rawNames.map(normalizeForSearch)])].sort((a, b) => b.length - a.length)
    let bestPos = -1
    let bestLen = 0
    for (const name of namesToTry) {
      if (name.length < 2) continue
      const nameLower = name.toLowerCase()
      let idx = textLower.indexOf(nameLower)
      while (idx !== -1) {
        if (idx > 0 && /[a-z0-9]/.test(textLower[idx - 1])) { idx = textLower.indexOf(nameLower, idx + 1); continue }
        if (idx + name.length < text.length && /[a-z]/.test(textLower[idx + name.length])) { idx = textLower.indexOf(nameLower, idx + 1); continue }
        if (bestPos === -1 || idx < bestPos) {
          bestPos = idx
          bestLen = name.length
        }
        break
      }
    }
    if (bestPos >= 0) paramOccurrences.push({ position: bestPos, row, nameLen: bestLen })
  }
  paramOccurrences.sort((a, b) => a.position - b.position)
  const usedValueStarts = new Set<number>()
  const WHOLE_TEXT_WINDOW = 2000
  const WHOLE_TEXT_BEFORE = 400
  for (const { position, row, nameLen } of paramOccurrences) {
    if (foundParams.has(row.name)) continue
    const windowStart = position + nameLen
    const window = text.slice(windowStart, windowStart + WHOLE_TEXT_WINDOW)
    const contextBefore = text.slice(Math.max(0, windowStart - 60), windowStart)
    const numbers = findAllResultNumbers(window, WHOLE_TEXT_WINDOW, contextBefore)
    const nameNumbers = numbersInParamName(row.name)
    for (const a of row.aliases || []) nameNumbers.push(...numbersInParamName(a))
    const low = Number(row.normal_low)
    const high = Number(row.normal_high)
    const plausible = numbers.map(num => ({ ...num, globalStart: windowStart + num.start }))
      .filter(num => {
        if (nameNumbers.some(n => Math.abs(num.value - n) < 0.01)) return false
        if (row.name === 'Carbon Dioxide' && num.value > 50) return false
        let valForCheck = num.value
        if (num.value < 1000 && high > 1000) valForCheck = num.value * 1000
        return isPlausibleValue(valForCheck, low, high)
      })
    if (plausible.length === 0) {
      const beforeStart = Math.max(0, position - WHOLE_TEXT_BEFORE)
      const beforeWindow = text.slice(beforeStart, position)
      const beforeNumbers = findAllResultNumbers(beforeWindow, WHOLE_TEXT_BEFORE, '')
      const plausibleBefore = beforeNumbers
        .map(num => ({ ...num, globalStart: beforeStart + num.start }))
        .filter(num => {
          if (nameNumbers.some(n => Math.abs(num.value - n) < 0.01)) return false
          if (row.name === 'Carbon Dioxide' && num.value > 50) return false
          let valForCheck = num.value
          if (num.value < 1000 && high > 1000) valForCheck = num.value * 1000
          return isPlausibleValue(valForCheck, low, high)
        })
        .sort((a, b) => b.globalStart - a.globalStart)
      for (const num of plausibleBefore) {
        if (usedValueStarts.has(num.globalStart)) continue
        const reportUnit = (num.value < 1000 && high > 1000) ? '10^3/µL' : undefined
        usedValueStarts.add(num.globalStart)
        addParam(row, num.value, num.raw, undefined, reportUnit)
        break
      }
      continue
    }
    const byPreference = plausible.sort((a, b) => (b.hasDecimal ? 1 : 0) - (a.hasDecimal ? 1 : 0))
    for (const num of byPreference) {
      if (usedValueStarts.has(num.globalStart)) continue
      const reportUnit = (num.value < 1000 && high > 1000) ? '10^3/µL' : undefined
      usedValueStarts.add(num.globalStart)
      addParam(row, num.value, num.raw, undefined, reportUnit)
      break
    }
  }

  // PASS 0: Same-line first (name + value on one line; try longest names first e.g. "Iron, Serum" before "Iron")
  for (const line of lines) {
    const lineLower = line.toLowerCase()
    for (const row of referenceRows) {
      if (foundParams.has(row.name)) continue
      const namesToTry = [row.name, ...(row.aliases || [])].filter(Boolean)
        .sort((a, b) => b.length - a.length)
      for (const name of namesToTry) {
        const nameLower = name.toLowerCase()
        const idx = lineLower.indexOf(nameLower)
        if (idx === -1) continue
        if (idx > 0 && /[a-z0-9]/.test(lineLower[idx - 1])) continue
        const afterIdx = idx + name.length
        if (afterIdx < line.length && /[a-z]/.test(lineLower[afterIdx])) continue
        const afterName = line.slice(afterIdx)
        const numAfter = extractNumberAfter(afterName, 0)
        let numResult = numAfter
        if (numResult == null && idx > 0) {
          const before = line.slice(0, idx).trim()
          if (!/[\d.,]+\s*-\s*[\d.,]/.test(before)) numResult = extractNumberAfter(before, 0)
        }
        if (numResult == null) continue
        if (numAfter != null) {
          const afterNum = afterName.slice(afterName.indexOf(numAfter.raw) + numAfter.raw.length)
          if (/^\s*,\s*\d/.test(afterNum)) continue
        }
        addParam(row, numResult.value, numResult.raw, name, undefined)
        break
      }
    }
  }

  // PASS 0b: Tab- or multi-space-separated columns (e.g. "Param\tValue", "Param  Value", "Ref\tUnit\tParam\tValue")
  for (const line of lines) {
    let parts = line.split(/\t/).map(p => p.trim())
    if (parts.length < 2) parts = line.split(/\s{2,}/).map(p => p.trim())
    if (parts.length < 2) continue
    for (const row of referenceRows) {
      if (foundParams.has(row.name)) continue
      const namesToTry = [row.name, ...(row.aliases || [])].filter(Boolean)
      for (const name of namesToTry) {
        const nameLower = name.toLowerCase()
        const colIdx = parts.findIndex(p => p.toLowerCase().includes(nameLower) || nameLower.includes(p.toLowerCase()))
        if (colIdx === -1) continue
        for (let c = 0; c < parts.length; c++) {
          if (c === colIdx) continue
          if (/[\d.,]+\s*-\s*[\d.,]/.test(parts[c])) continue
          if (looksLikeUnit(parts[c]) || /Cells\/|10\^|\/μL|\/dL|\/L\s*$/i.test(parts[c])) continue
          const numResult = extractNumberAfter(parts[c], 0)
          if (numResult == null) continue
          if (row.name === 'Carbon Dioxide' && numResult.value > 50) continue
          if (!isPlausibleValue(numResult.value, Number(row.normal_low), Number(row.normal_high))) continue
          addParam(row, numResult.value, numResult.raw, parts[colIdx], undefined)
          break
        }
        break
      }
    }
  }

  // PASS 1: Structure-based — param line then value in next N lines
  const structurePairs = extractAllParametersByStructure(text, referenceRows)
  for (const p of structurePairs) {
    addParamFromExtracted(p.paramName, p.value, p.raw, p.unit)
  }

  // Pass 1.5: value on next line(s) — for reports where "Ref Unit Parameter" is on one line and result on the next
  const pending: RefRow[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineLower = line.toLowerCase()
    if (isValueOnlyLine(line) && pending.length > 0) {
      const numResult = extractNumberAfter(line, 0)
      if (numResult) {
        const row = pending.shift()!
        addParam(row, numResult.value, numResult.raw)
      }
      continue
    }
    lineLoop: for (const row of referenceRows) {
      if (foundParams.has(row.name)) continue
      const namesToTry = [row.name, ...(row.aliases || [])].filter(Boolean)
      for (const name of namesToTry) {
        const nameLower = name.toLowerCase()
        const idx = lineLower.indexOf(nameLower)
        if (idx === -1) continue
        if (idx > 0 && /[a-z0-9]/.test(lineLower[idx - 1])) continue
        const afterIdx = idx + name.length
        if (afterIdx < line.length && /[a-z]/.test(lineLower[afterIdx])) continue
        const afterName = line.slice(afterIdx)
        if (extractNumberAfter(afterName, 0) != null) continue
        pending.push(row)
        break lineLoop
      }
    }
  }

  // PASS 2: Position-based — param list and value list in document order; pair 1st param with 1st plausible value, etc.
  // Handles CBC/lab reports where all param lines then all value lines (or interleaved). Each param gets next unused plausible value.
  const paramLines: { lineIdx: number; paramName: string; unit?: string }[] = []
  const valueLines: { lineIdx: number; value: number; raw: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const parsed = parseParameterLine(line)
    if (parsed) {
      paramLines.push({ lineIdx: i, paramName: parsed.paramName, unit: parsed.unit })
    } else {
      const t = line.trim()
      if (t.length >= 2 && t.length <= 80 && /^[A-Za-z][A-Za-z0-9\s\-\(\)\,]+$/.test(t) && !PARAM_LINE_SKIP.test(t)) {
        const row = findReferenceRow(t, referenceRows)
        if (row) paramLines.push({ lineIdx: i, paramName: t, unit: undefined })
      } else {
        const refMatch = paramNameFromLineByReference(line, referenceRows)
        if (refMatch && (/[\d.,\s\-]/.test(line) || line.length < 60)) {
          paramLines.push({ lineIdx: i, paramName: refMatch.paramName, unit: undefined })
        }
      }
    }
    if (isValueOnlyLine(line)) {
      const numResult = extractNumberAfter(line, 0)
      if (numResult) valueLines.push({ lineIdx: i, value: numResult.value, raw: numResult.raw })
    }
  }
  const usedValueLineIdx = new Set<number>()
  for (const p of paramLines) {
    const row = findReferenceRow(p.paramName, referenceRows)
    if (row && foundParams.has(row.name)) continue
    const nameNumbers = numbersInParamName(p.paramName)
    for (let j = 0; j < valueLines.length; j++) {
      if (usedValueLineIdx.has(j)) continue
      const v = valueLines[j]
      if (nameNumbers.some(n => Math.abs(v.value - n) < 0.01)) continue
      if (row) {
        const low = Number(row.normal_low)
        const high = Number(row.normal_high)
        let valForPlausible = v.value
        if (p.unit && /10\^3/i.test(p.unit) && high > 100) valForPlausible = v.value * 1000
        else if (p.unit && /10\^6/i.test(p.unit) && high >= 100) valForPlausible = v.value * 1e6
        if (!isPlausibleValue(valForPlausible, low, high)) continue
        if (row.name === 'Carbon Dioxide' && v.value > 50) continue
      }
      usedValueLineIdx.add(j)
      addParamFromExtracted(p.paramName, v.value, v.raw, p.unit)
      break
    }
  }

  // Third pass: whole-text regex (name immediately followed by number) — prefer decimals (lab results), reject address-style "102, 103"
  for (const row of referenceRows) {
    if (foundParams.has(row.name)) continue
    const namesToTry = [row.name, ...(row.aliases || [])].filter(Boolean)
    const low = Number(row.normal_low)
    const high = Number(row.normal_high)
    for (const name of namesToTry) {
      const escaped = escapeRegex(name)
      const base = escaped.replace(/\s+/g, '\\s*') + '[\\s:\\-]*'
      const reDecimal = new RegExp(base + '([0-9]+[.,][0-9]+)', 'gi')
      const reAny = new RegExp(base + '([0-9]+[.,][0-9]+|[0-9]+)', 'gi')
      const match = text.match(reDecimal) || text.match(reAny)
      if (match) {
        const numMatch = match[0].match(/([0-9]+[.,][0-9]+|[0-9]+)/)
        if (numMatch) {
          const valueStr = numMatch[1].replace(',', '.')
          const value = parseFloat(valueStr)
          if (Number.isNaN(value)) break
          const afterNumber = match[0].slice(match[0].indexOf(numMatch[1]) + numMatch[1].length)
          if (/^\s*,\s*\d/.test(afterNumber)) break
          if (row.name === 'Carbon Dioxide' && value > 50) break
          if (!isPlausibleValue(value, low, high)) break
          addParam(row, value, valueStr, name, undefined)
          break
        }
      }
    }
  }

  for (const cat of Object.keys(categories)) {
    const data = categories[cat]
    const abnormalCount = data.parameters.filter(p => p.status === 'abnormal').length
    data.risk_level = abnormalCount === 0 ? 'Low' : abnormalCount / data.parameters.length < 0.3 ? 'Moderate' : 'High'
  }

  return { categories, parameterRows }
}

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
}

serve(async (req) => {
  const method = req.method
  console.log('=== Edge Function invoked ===')
  console.log('Method:', method)
  console.log('URL:', req.url)
  
  // Handle CORS preflight requests - MUST be first, before any other logic
  if (method === 'OPTIONS') {
    console.log('Handling CORS preflight request')
    return new Response('ok', { 
      status: 200,
      headers: corsHeaders 
    })
  }

  if (method !== 'POST') {
    console.log('Invalid method, returning 405')
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    )
  }

  try {
    console.log('=== Starting POST request processing ===')
    // Safe log to verify which key the function actually receives (do not log full key)
    const keyLen = GEMINI_API_KEY ? GEMINI_API_KEY.length : 0
    const keyPrefix = GEMINI_API_KEY ? GEMINI_API_KEY.slice(0, 6) + '...' : '(not set)'
    console.log('GEMINI_API_KEY: present=', !!GEMINI_API_KEY, 'length=', keyLen, 'prefix=', keyPrefix)

    // Get auth header (optional - Edge Functions can work without auth, but it's good to verify)
    const authHeader = req.headers.get('authorization')
    console.log('Auth header present:', !!authHeader)

    let requestBody: AnalysisRequest
    try {
      requestBody = await req.json()
    } catch (parseError) {
      console.error('Error parsing request body:', parseError)
      throw new Error('Invalid request body')
    }
    
    const { fileUrl, filePath, fileType, reportId, useAiFallback = false } = requestBody
    const useAi = useAiFallback === true
    console.log('Request body parsed:', { filePath, fileType, reportId, hasFileUrl: !!fileUrl, useAiFallback, useAi })
    console.log(useAi ? 'User requested AI: will use Gemini for extraction (exact names & all values).' : 'AI not requested: no-AI parser may run if PDF text is extracted.')

    // Test Gemini API connectivity (no file needed)
    const bodyAny = requestBody as Record<string, unknown>
    if (bodyAny.action === 'testGemini') {
      if (!GEMINI_API_KEY) {
        return new Response(
          JSON.stringify({ success: false, error: 'GEMINI_API_KEY is not set in Edge Function secrets.' }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        )
      }
      const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`
      try {
        const res = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Reply with exactly: OK' }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 10 }
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          const errText = data?.error?.message || await res.text()
          console.error('Gemini test error:', errText)
          return new Response(
            JSON.stringify({ success: false, error: `Gemini API error (${res.status}): ${errText}` }),
            { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          )
        }
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        console.log('Gemini test response:', text)
        return new Response(
          JSON.stringify({ success: true, message: 'Gemini 2.5 Flash API is working.', response: text?.trim() || 'OK' }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        )
      } catch (err: any) {
        console.error('Gemini test exception:', err)
        return new Response(
          JSON.stringify({ success: false, error: err?.message || 'Failed to call Gemini API.' }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        )
      }
    }

    if ((!fileUrl && !filePath) || !fileType) {
      throw new Error('Missing required parameters: fileUrl or filePath, and fileType')
    }

    // Initialize Supabase client with service role (can access private files)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Get file from storage - prefer filePath (direct access) over fileUrl
    let arrayBuffer: ArrayBuffer
    
    try {
      if (filePath) {
        console.log('Downloading file from storage:', filePath)
        // Access file directly from storage using service role
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('health-reports')
          .download(filePath)
        
        if (downloadError) {
          console.error('Error downloading file from storage:', downloadError)
          throw new Error('Failed to download file from storage: ' + downloadError.message)
        }
        
        if (!fileData) {
          throw new Error('File data is null')
        }
        
        arrayBuffer = await fileData.arrayBuffer()
        console.log('File downloaded successfully, size:', arrayBuffer.byteLength, 'bytes')
      } else if (fileUrl) {
        console.log('Fetching file from URL:', fileUrl)
        // Fallback: fetch from signed URL
        const fileResponse = await fetch(fileUrl)
        if (!fileResponse.ok) {
          throw new Error(`Failed to fetch file from URL: ${fileResponse.status} ${fileResponse.statusText}`)
        }
        arrayBuffer = await fileResponse.arrayBuffer()
        console.log('File fetched successfully, size:', arrayBuffer.byteLength, 'bytes')
      } else {
        throw new Error('No file path or URL provided')
      }
    } catch (fileError: any) {
      console.error('Error getting file:', fileError)
      throw new Error('Failed to get file: ' + fileError.message)
    }

    // Check file size (Gemini has limits)
    // Note: Gemini 2.5 Flash supports up to 1M tokens input, which roughly translates to ~20MB for images/PDFs
    // For very large files, we may need to split or compress
    const maxSize = 20 * 1024 * 1024 // 20MB limit for Gemini
    const fileSizeMB = arrayBuffer.byteLength / 1024 / 1024
    console.log('File size:', fileSizeMB.toFixed(2), 'MB')
    
    if (arrayBuffer.byteLength > maxSize) {
      throw new Error(`File too large: ${fileSizeMB.toFixed(2)}MB. Maximum size is 20MB. Please compress or split the file.`)
    }
    
    // Step 1: Try to extract text from PDF. If successful, we use NO-AI path and NEVER call Gemini (zero API cost).
    let extractedText: string | null = null
    let useTextAnalysis = false
    let extractionError: string | null = null

    if (fileType.includes('pdf')) {
      console.log('=== Step 1: PDF text extraction (if successful, Gemini will NOT be called - zero API cost) ===')
      try {
        const { configureUnPDF, extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.0")
        await configureUnPDF({ pdfjs: () => import("https://esm.sh/unpdf@0.12.0/pdfjs") })
        const pdfBytes = new Uint8Array(arrayBuffer)
        const pdf = await getDocumentProxy(pdfBytes)
        const { text: fullText } = await extractText(pdf, { mergePages: true })

        if (fullText && fullText.trim().length > 0) {
          extractedText = fullText.trim()
          useTextAnalysis = true
          console.log('NO-AI PATH: PDF text extracted successfully. Text length:', extractedText.length, '- Gemini will NOT be called. Zero API cost.')
        } else {
          extractionError = 'Extraction returned no text (empty or whitespace only)'
          console.warn('PDF text extraction returned no text:', extractionError)
        }
      } catch (pdfError: any) {
        extractionError = pdfError?.message || pdfError?.toString() || 'Unknown extraction error'
        console.warn('PDF text extraction failed:', extractionError)
      }
    }

    // When user has turned AI ON: always use Gemini (skip no-AI parser). Ensures correct names & values from report.
    if (useAi) {
      useTextAnalysis = false
      console.log('AI enabled: forcing Gemini path. No-AI parser will NOT run.')
    }
    
    // If text extraction failed or not a PDF, we will use Gemini (API cost).
    let base64: string | null = null
    let mimeType = 'image/jpeg'
    
    if (!useTextAnalysis) {
      console.log('=== API PATH: No extractable text (scanned PDF or image). Gemini 2.5 Flash will be called - this uses your paid quota. ===')
      
      // Warn if file is large (close to limit) - may cause response truncation
      if (fileSizeMB > 10) {
        console.warn('Large file detected:', fileSizeMB.toFixed(2), 'MB. Response may be truncated. Consider splitting the file.')
      }

      // Convert file to base64 for Gemini Vision API
      console.log('Converting file to base64...')
      try {
        // For large files, convert in chunks to avoid memory issues
        const bytes = new Uint8Array(arrayBuffer)
        const chunkSize = 8192 // Process in 8KB chunks
        let binaryString = ''
        
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize)
          binaryString += String.fromCharCode(...chunk)
        }
        
        base64 = btoa(binaryString)
        console.log('Base64 conversion complete, length:', base64.length)
      } catch (encodeError: any) {
        console.error('Error encoding to base64:', encodeError)
        throw new Error('Failed to encode file to base64: ' + encodeError.message)
      }
      
      // Determine MIME type for Gemini
      if (fileType.includes('pdf')) {
        mimeType = 'application/pdf'
      } else if (fileType.includes('word') || fileType.includes('docx')) {
        // Note: Gemini doesn't directly support Word docs, we'll need to handle this differently
        // For now, we'll try to process as image if possible
        mimeType = 'image/jpeg'
      } else if (fileType.includes('image/png')) {
        mimeType = 'image/png'
      } else if (fileType.includes('image/jpeg') || fileType.includes('image/jpg')) {
        mimeType = 'image/jpeg'
      }
    }

    // NO-AI PATH: Only when user did NOT request AI and we have extracted text. If user requested AI we must not run this.
    if (!useAi && useTextAnalysis && extractedText && extractedText.length > 0) {
      console.log('=== NO-AI PATH: User did not request AI. Parsing extracted text with blood_marker_reference. Gemini was NOT called. ===')
      const { data: refRows, error: refError } = await supabase
        .from('blood_marker_reference')
        .select('name, aliases, unit, normal_low, normal_high, category')

      if (refError) {
        console.error('Failed to fetch blood_marker_reference:', refError)
        throw new Error('Failed to load reference ranges: ' + refError.message)
      }

      const refList: RefRow[] = (refRows || [])
        .map((r: any) => ({
          name: r.name,
          aliases: r.aliases || [],
          unit: r.unit || '',
          normal_low: Number(r.normal_low),
          normal_high: Number(r.normal_high),
          category: r.category || 'Other'
        }))
        .sort((a, b) => (b.name.length + (b.aliases?.[0]?.length ?? 0)) - (a.name.length + (a.aliases?.[0]?.length ?? 0)))

      const { categories: parsedCategories, parameterRows: parsedParamRows } = parseTextWithReference(extractedText, refList)
      const analysisResult = { categories: parsedCategories }

      const { data: reportRow, error: reportError } = await supabase
        .from('health_reports')
        .select('user_id, family_member_id, report_date')
        .eq('id', reportId)
        .single()

      if (reportError || !reportRow) {
        throw new Error('Failed to fetch report: ' + (reportError?.message || 'not found'))
      }

      const recordedAt = (reportRow as any).report_date
        ? new Date((reportRow as any).report_date + 'T12:00:00Z').toISOString()
        : new Date().toISOString()
      const userId = (reportRow as any).user_id
      const familyMemberId = (reportRow as any).family_member_id ?? null

      for (const [category, data] of Object.entries(parsedCategories)) {
        const catData = data as { parameters: any[]; risk_level: string }
        await supabase.from('health_analysis').insert({
          report_id: reportId,
          category,
          findings: { parameters: catData.parameters },
          summary: catData.parameters.map((p: any) => `${p.name}: ${p.value} (${p.normal_range}) - ${p.status}`).join('; '),
          recommendations: '',
          risk_level: catData.risk_level
        })
      }

      await supabase
        .from('health_reports')
        .update({ analysis_status: 'completed', analyzed_at: recordedAt })
        .eq('id', reportId)

      if (parsedParamRows.length > 0 && userId) {
        const rows = parsedParamRows.map(p => ({
          user_id: userId,
          family_member_id: familyMemberId,
          report_id: reportId,
          recorded_at: recordedAt,
          category: p.category,
          parameter_name: p.parameter_name,
          parameter_value: p.parameter_value,
          normal_range: p.normal_range,
          status: p.status
        }))
        await supabase.from('health_parameter_readings').insert(rows)
        console.log('No-AI path: saved', rows.length, 'parameter readings')
      }

      return new Response(
        JSON.stringify({ success: true, analysis: analysisResult }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    // AI was not requested and we have no extracted text → tell user to enter manually
    if (!useAi) {
      await supabase
        .from('health_reports')
        .update({ analysis_status: 'failed' })
        .eq('id', reportId)
      const errMsg = extractionError
        ? `PDF text could not be extracted. ${extractionError} AI is off — please enter values manually.`
        : 'PDF text could not be extracted (scanned PDF or image?). AI is off. Please enter values manually.'
      return new Response(
        JSON.stringify({
          success: false,
          error: errMsg,
          analysis: { categories: {} }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }
    if (!GEMINI_API_KEY) {
      throw new Error('PDF text could not be extracted (scanned PDF or image?). Add values manually, or set GEMINI_API_KEY for AI fallback.')
    }

    const CATEGORIES = ['Heart', 'Liver', 'Kidney', 'Blood', 'Metabolic', 'Thyroid', 'Electrolytes', 'Urine']
    const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

    // Fetch reference parameters once so we can guide the model and validate output (accuracy + cost control)
    const { data: refRowsAll, error: refErr } = await supabase
      .from('blood_marker_reference')
      .select('name, aliases, unit, normal_low, normal_high, category')
    if (refErr) {
      console.error('Failed to fetch blood_marker_reference:', refErr)
    }
    const refByCategory: Record<string, RefRow[]> = {}
    for (const r of refRowsAll || []) {
      const row = { name: r.name, aliases: r.aliases || [], unit: r.unit || '', normal_low: Number(r.normal_low), normal_high: Number(r.normal_high), category: r.category || 'Other' }
      if (!refByCategory[row.category]) refByCategory[row.category] = []
      refByCategory[row.category].push(row)
    }

    const analysisResult: { categories: { [key: string]: any } } = { categories: {} }

    // Single Gemini call: extract EVERY parameter from the report with EXACT names and values as printed. No per-category calls that drop params or substitute names.
    const fullPrompt = `You are reading a health lab report (image/PDF). Your job is to list EVERY lab parameter that appears on the report.

RULES - FOLLOW EXACTLY:
1. Parameter name: Copy the EXACT text as printed on the report. Do NOT shorten. Do NOT substitute. Examples: "WBC -Total Leucocytes Count", "Hemoglobin (HB), EDTA Blood", "RBC", "PCV (Hematocrit)". Whatever is written on the report is what you must output.
2. Value: Copy the EXACT result value and unit as printed. Do NOT convert units. Do NOT multiply. If the report shows 7.55 with unit 10^3/µL, output "7.55 10^3/µL" — not 7550.
3. Include EVERY parameter you see in the report. Do not skip any. Count them and list all.
4. Normal range: If the report shows a reference/biological interval for that parameter, copy it. Otherwise use "N/A".
5. Status: "n" if result is within the shown normal range, "a" if outside or flagged.

Return ONLY valid JSON (no markdown, no explanation):
{"p":[{"n":"Exact Parameter Name As On Report","v":"exact value and unit as printed","r":"normal range or N/A","s":"n or a"}]}

Example: {"p":[{"n":"WBC -Total Leucocytes Count","v":"7.55 10^3/µL","r":"4.5-11.0","s":"n"},{"n":"RBC","v":"4.82 million/mcL","r":"4.2-5.4","s":"n"}]}`

    const payload: any = {
      contents: [{
        parts: useTextAnalysis
          ? [{ text: `${fullPrompt}\n\nHealth Report Text:\n${extractedText}` }]
          : [
              { text: fullPrompt },
              { inline_data: { mime_type: mimeType, data: base64 } }
            ]
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 16384,
        topP: 0.95,
        topK: 40
      }
    }

    console.log('Calling Gemini once to extract ALL parameters (exact names and values from report)')
    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      console.error('Gemini error:', await res.text())
      throw new Error('AI analysis failed. Please try again or add values manually.')
    }

    const data = await res.json()
    let text = ''
    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.text) text += part.text
      }
    }

    if (!text) {
      throw new Error('AI returned no content. Please try again or add values manually.')
    }

    let jsonStr = text.replace(/```json?\s*/g, '').replace(/```/g, '').trim()
    const brace = jsonStr.match(/\{[\s\S]*\}/)
    if (brace) jsonStr = brace[0]

    function parseGeminiJson(str: string): { p: any[] } {
      const parsed = JSON.parse(str)
      const arr = Array.isArray(parsed.p) ? parsed.p : (Array.isArray(parsed.parameters) ? parsed.parameters : [])
      return { p: arr }
    }

    let parsed: { p: any[] }
    try {
      parsed = parseGeminiJson(jsonStr)
    } catch (firstErr) {
      console.warn('First JSON parse failed, attempting repair:', (firstErr as Error).message)
      let repaired = jsonStr
        .replace(/\}\s*\n\s*\{/g, '},\n{')
        .replace(/\}\s*\{/g, '},{')
      try {
        parsed = parseGeminiJson(repaired)
        console.log('JSON repair (missing comma) succeeded')
      } catch (_) {
        const msg = String((firstErr as Error).message)
        const posMatch = msg.match(/position (\d+)/)
        const errPos = posMatch ? parseInt(posMatch[1], 10) : Math.floor(repaired.length * 0.85)
        const lastPair = repaired.lastIndexOf('},{', Math.min(errPos + 300, repaired.length))
        if (lastPair > 10) {
          repaired = repaired.slice(0, lastPair + 1) + ']}'
          try {
            parsed = parseGeminiJson(repaired)
            console.log('JSON repair (truncation) succeeded at last complete object')
          } catch (__) {
            throw firstErr
          }
        } else {
          throw firstErr
        }
      }
    }

    try {
      const rawParams = Array.isArray(parsed?.p) ? parsed.p : []
      const refRowsFlat: RefRow[] = (refRowsAll || []).map((r: any) => ({
        name: r.name,
        aliases: r.aliases || [],
        unit: r.unit || '',
        normal_low: Number(r.normal_low),
        normal_high: Number(r.normal_high),
        category: r.category || 'Other'
      }))

      function categoryForParam(paramName: string): string {
        const nameLower = paramName.toLowerCase().trim()
        for (const ref of refRowsFlat) {
          if (ref.name.toLowerCase() === nameLower) return ref.category
          if ((ref.aliases || []).some((a: string) => String(a).toLowerCase() === nameLower)) return ref.category
          if (nameLower.includes(ref.name.toLowerCase()) || ref.name.toLowerCase().includes(nameLower)) return ref.category
        }
        return 'Other'
      }

      const byCategory: Record<string, { p: any[]; rl: string }> = {}
      function valueLooksNumeric(val: string): boolean {
        const t = val.trim()
        const numMatch = t.replace(/,/g, '.').match(/^-?\d+\.?\d*/)
        if (!numMatch) return false
        const num = parseFloat(numMatch[0])
        return Number.isFinite(num) && t.length < 80
      }

      for (const param of rawParams) {
        const name = (param.n ?? param.name ?? '').trim()
        const valueStr = String(param.v ?? param.value ?? '').trim()
        if (!name || !valueStr) continue
        const category = categoryForParam(name)
        if (!byCategory[category]) byCategory[category] = { p: [], rl: 'Low' }
        const refRow = refRowsFlat.find((r: RefRow) => {
          const n = name.toLowerCase()
          const rn = r.name.toLowerCase()
          if (rn === n) return true
          if ((r.aliases || []).some((a: string) => String(a).toLowerCase() === n)) return true
          if (n.includes(rn) || rn.includes(n)) return true
          return false
        })
        const isNumericValue = valueLooksNumeric(valueStr)
        const exactOrAliasMatch = refRow && (
          name.toLowerCase() === refRow.name.toLowerCase() ||
          (refRow.aliases || []).some((a: string) => String(a).toLowerCase() === name.toLowerCase())
        )
        let normalRange: string
        let status: string
        if (isNumericValue && exactOrAliasMatch && refRow) {
          normalRange = `${refRow.normal_low} - ${refRow.normal_high} ${refRow.unit}`.trim()
          status = (param.s === 'a' || param.s === 'abnormal' || param.status === 'abnormal') ? 'abnormal' : 'normal'
        } else {
          normalRange = (param.r ?? param.normal_range ?? '').trim() || 'N/A'
          if (!isNumericValue) status = 'normal'
          else status = (param.s === 'a' || param.s === 'abnormal' || param.status === 'abnormal') ? 'abnormal' : 'normal'
        }
        byCategory[category].p.push({ n: name, v: valueStr, r: normalRange, s: status })
      }

      for (const [cat, obj] of Object.entries(byCategory)) {
        if (obj.p.length > 0) analysisResult.categories[cat] = obj
      }
      const totalParams = rawParams.filter((p: any) => (p.n ?? p.name ?? '').trim() && (p.v ?? p.value ?? '').trim()).length
      console.log(`AI extracted ${totalParams} parameters; grouped into ${Object.keys(analysisResult.categories).length} categories. Names and values kept as on report.`)
    } catch (e) {
      console.error('Failed to parse Gemini response:', e)
      throw new Error('AI response could not be parsed. Please try again or add values manually.')
    }

    if (Object.keys(analysisResult.categories).length === 0) {
      analysisResult.categories['General'] = { p: [], rl: 'Low' }
      console.warn('No parameters extracted; added General fallback')
    }

    // Category-by-category results are in analysisResult; normalize and save below.
    
    // Validate the structure
    if (!analysisResult || typeof analysisResult !== 'object') {
      throw new Error('Parsed result is not an object')
    }
    if (!analysisResult.categories || typeof analysisResult.categories !== 'object') {
      analysisResult.categories = { 'General': { p: [], rl: 'Low' } }
    }

    // Normalize format (expand compact keys p,n,v,r,s,rl)
    {
        // Normalize all categories to use the simplified format
        // Map abbreviations to full names for display
        const abbreviationMap: { [key: string]: string } = {
          // Categories
          'L': 'Liver', 'K': 'Kidney', 'B': 'Blood', 'H': 'Heart', 'M': 'Metabolic', 'T': 'Thyroid',
          // Liver
          'BT': 'Bilirubin Total', 'BD': 'Bilirubin Direct', 'BI': 'Bilirubin Indirect', 'TP': 'Protein Total', 'Alb': 'Albumin',
          // Kidney
          'U': 'Urea', 'Cr': 'Creatinine', 'Ca': 'Calcium', 'Na': 'Sodium', 'Cl': 'Chloride', 'P': 'Phosphorous',
          // Blood
          'Hb': 'Hemoglobin', 'Plt': 'Platelets', 'HCT': 'Hematocrit', 'Neut': 'Neutrophils', 'Lym': 'Lymphocytes',
          'Mon': 'Monocytes', 'Eos': 'Eosinophils', 'Bas': 'Basophils', 'PCt': 'PlateletCrit', 'PLCR': 'PLCR',
          // Heart
          'TC': 'Cholesterol Total', 'TG': 'Triglycerides',
          // Metabolic
          'Glu': 'Glucose', 'Ins': 'Insulin',
          // Thyroid
          'FT3': 'Free T3', 'FT4': 'Free T4'
        }
        
        // Risk level abbreviations
        const riskLevelMap: { [key: string]: string } = {
          'L': 'Low', 'M': 'Moderate', 'H': 'High'
        }
        
        for (const [categoryName, categoryData] of Object.entries(analysisResult.categories)) {
          const data = categoryData as any
          
          // Expand category name if abbreviated
          let displayCategoryName = abbreviationMap[categoryName] || categoryName
          
          // ULTRA-COMPACT format: expand short keys (p, n, v, r, s, rl)
          if (data.p && Array.isArray(data.p)) {
            data.parameters = data.p
            delete data.p
          }
          if (data.rl) {
            data.risk_level = riskLevelMap[data.rl] || data.rl
            delete data.rl
          }
          if (data.parameters && Array.isArray(data.parameters)) {
            data.parameters = data.parameters.map((param: any) => {
              const expanded = {
                name: param.n ?? param.name ?? 'Unknown',
                value: param.v ?? param.value ?? '',
                normal_range: param.r ?? param.normal_range ?? 'N/A',
                status: (param.s === 'a' || param.s === 'abnormal' || param.status === 'abnormal') ? 'abnormal' : 'normal'
              }
              return expanded
            })
          }
          
          // NEW FORMAT: Check if we have parameters array (new structured format)
          if (data.parameters && Array.isArray(data.parameters)) {
            // Ensure each parameter has required fields (already expanded above if compact)
            data.parameters = data.parameters.map((param: any) => ({
              name: param.name || 'Unknown',
              value: param.value || '',
              normal_range: param.normal_range || 'N/A',
              status: param.status === 'abnormal' ? 'abnormal' : 'normal'
            }))
          } else {
            // OLD FORMAT: Convert to new format for backward compatibility
            // Try to extract parameters from old format
            let parameters: any[] = []
            
            // Handle old readings format
            if (data.readings && typeof data.readings === 'string' && !data.readings.includes('Extraction incomplete')) {
              // Try to parse comma-separated values like "ALT:45,AST:38,BT:0.8"
              const readingsParts = data.readings.split(',')
              for (const part of readingsParts) {
                // Match patterns like "Name:value" or "Name: value unit"
                const match = part.trim().match(/([^:]+):\s*([^\s]+(?:\s+[^\s]+)*)/)
                if (match) {
                  const paramName = match[1].trim()
                  const paramValue = match[2].trim()
                  // Skip if it's an error message
                  if (!paramName.toLowerCase().includes('extraction') && 
                      !paramName.toLowerCase().includes('incomplete') &&
                      !paramName.toLowerCase().includes('truncated')) {
                    parameters.push({
                      name: paramName,
                      value: paramValue,
                      normal_range: 'N/A - Please consult reference ranges',
                      status: 'normal' // Default to normal for old format (no analysis available)
                    })
                  }
                }
              }
            }
            
            // Handle old findings format
            if (data.findings && typeof data.findings === 'object' && !Array.isArray(data.findings)) {
              for (const [key, value] of Object.entries(data.findings)) {
                if (value !== null && value !== undefined) {
                  parameters.push({
                    name: key,
                    value: String(value),
                    normal_range: 'N/A - Please consult reference ranges',
                    status: 'normal'
                  })
                }
              }
            }
            
            // If we extracted parameters, use them
            if (parameters.length > 0) {
              data.parameters = parameters
            } else if (data.readings && !data.readings.includes('Extraction incomplete')) {
              // If readings exist but couldn't parse, show it as a single entry
              data.parameters = [{
                name: 'Report Data',
                value: data.readings,
                normal_range: 'N/A - Analysis format not recognized',
                status: 'normal'
              }]
            } else {
              // Only create error parameter if we truly have no data
              data.parameters = [{
                name: 'Analysis Error',
                value: data.readings || 'Unable to extract data from report',
                normal_range: 'N/A',
                status: 'normal'
              }]
            }
          }
          
          // Ensure risk_level exists
          if (!data.risk_level) {
            // Calculate risk level based on abnormal parameters
            const abnormalCount = data.parameters?.filter((p: any) => p.status === 'abnormal').length || 0
            const totalCount = data.parameters?.length || 0
            if (abnormalCount === 0) {
              data.risk_level = 'Low'
            } else if (abnormalCount / totalCount < 0.3) {
              data.risk_level = 'Moderate'
            } else {
              data.risk_level = 'High'
            }
          }
          
          // Remove old format fields
          delete data.readings
          delete data.summary
          delete data.recommendations
          delete data.findings
          delete data.r
          delete data.rl
          
          // Update category name if it was abbreviated
          if (displayCategoryName !== categoryName) {
            analysisResult.categories[displayCategoryName] = data
            delete analysisResult.categories[categoryName]
          }
        }
    }
    console.log('Successfully parsed analysis result with', Object.keys(analysisResult.categories).length, 'categories')

    // Save analysis results to database
    if (analysisResult.categories) {
      // Fetch report to get user_id and family_member_id for parameter readings table
      const { data: reportRow, error: reportError } = await supabase
        .from('health_reports')
        .select('user_id, family_member_id')
        .eq('id', reportId)
        .single()

      if (reportError || !reportRow) {
        console.error('Failed to fetch report for parameter storage:', reportError)
      }

      const recordedAt = new Date().toISOString()
      const userId = reportRow?.user_id ?? null
      const familyMemberId = reportRow?.family_member_id ?? null

      const analysisPromises = Object.entries(analysisResult.categories).map(([category, data]: [string, any]) => {
        // Store structured parameters in findings JSONB field
        const findings = {
          parameters: data.parameters || []
        }
        
        // Create a summary text from parameters for backward compatibility
        let summaryText = ''
        if (data.parameters && Array.isArray(data.parameters) && data.parameters.length > 0) {
          summaryText = data.parameters.map((p: any) => 
            `${p.name}: ${p.value} (Normal: ${p.normal_range}) - ${p.status === 'abnormal' ? '⚠️ Abnormal' : '✅ Normal'}`
          ).join('; ')
        } else {
          summaryText = 'No parameters found'
        }
        
        return supabase
          .from('health_analysis')
          .insert({
            report_id: reportId,
            category: category,
            findings: findings, // Store structured parameters array
            summary: summaryText, // Store human-readable summary
            recommendations: '', // Can be used for future recommendations
            risk_level: data.risk_level || 'Low'
          })
      })

      await Promise.all(analysisPromises)

      // Update report status and analyzed_at
      await supabase
        .from('health_reports')
        .update({
          analysis_status: 'completed',
          analyzed_at: recordedAt
        })
        .eq('id', reportId)

      // Save each parameter to health_parameter_readings for historical comparison
      if (userId && reportRow) {
        const parameterRows: { user_id: string; family_member_id: string | null; report_id: string; recorded_at: string; category: string; parameter_name: string; parameter_value: string; normal_range: string; status: string }[] = []
        for (const [category, data] of Object.entries(analysisResult.categories)) {
          const catData = data as any
          const params = catData.parameters || []
          for (const p of params) {
            parameterRows.push({
              user_id: userId,
              family_member_id: familyMemberId,
              report_id: reportId,
              recorded_at: recordedAt,
              category: category,
              parameter_name: p.name || 'Unknown',
              parameter_value: p.value || '',
              normal_range: p.normal_range ?? '',
              status: p.status === 'abnormal' ? 'abnormal' : 'normal'
            })
          }
        }
        if (parameterRows.length > 0) {
          const { error: paramError } = await supabase
            .from('health_parameter_readings')
            .insert(parameterRows)
          if (paramError) {
            console.error('Failed to save parameter readings for comparison:', paramError)
          } else {
            console.log('Saved', parameterRows.length, 'parameter readings for historical comparison')
          }
        }
      }

      // RAG + AI: generate recommendations (what to do + Ayurveda & home remedies) when AI was used
      if (useAi && GEMINI_API_KEY && reportRow && analysisResult.categories) {
        try {
          const abnormals: string[] = []
          for (const [_cat, data] of Object.entries(analysisResult.categories)) {
            const params = (data as any).parameters || []
            for (const p of params) {
              if (p.status === 'abnormal') abnormals.push(`${p.name}: ${p.value} (ref: ${p.normal_range})`)
            }
          }
          let profileContext = ''
          if (userId) {
            const { data: profile } = await supabase.from('user_profiles').select('pre_existing_conditions, family_history, allergies').eq('id', userId).single()
            if (profile) {
              const conditions = (profile as any).pre_existing_conditions
              if (Array.isArray(conditions) && conditions.length) profileContext += `Pre-existing: ${conditions.join(', ')}. `
              if ((profile as any).family_history) profileContext += `Family history: ${(profile as any).family_history}. `
              if ((profile as any).allergies?.length) profileContext += `Allergies: ${(profile as any).allergies.join(', ')}. `
            }
          }
          if (familyMemberId) {
            const { data: member } = await supabase.from('family_members').select('name, pre_existing_conditions, medical_history, family_history, allergies').eq('id', familyMemberId).single()
            if (member) {
              profileContext += `Patient: ${(member as any).name || 'Member'}. `
              const c = (member as any).pre_existing_conditions
              if (Array.isArray(c) && c.length) profileContext += `Conditions: ${c.join(', ')}. `
              if ((member as any).medical_history) profileContext += `Medical history: ${(member as any).medical_history}. `
              if ((member as any).family_history) profileContext += `Family history: ${(member as any).family_history}. `
              if ((member as any).allergies?.length) profileContext += `Allergies: ${(member as any).allergies.join(', ')}. `
            }
          }
          const queryForEmbed = `Abnormal lab: ${abnormals.join('; ')}. ${profileContext}`.trim().slice(0, 8000)
          const embedRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: { parts: [{ text: queryForEmbed }] }, outputDimensionality: 768 })
          })
          if (embedRes.ok) {
            const embedData = await embedRes.json()
            const queryEmbedding = embedData?.embedding?.values as number[] | undefined
            if (Array.isArray(queryEmbedding) && queryEmbedding.length === 768) {
              const { data: chunks, error: rpcErr } = await supabase.rpc('match_ayurveda_chunks', { query_embedding: queryEmbedding, match_count: 10 })
              const ragText = (rpcErr || !chunks?.length) ? '' : (chunks as { content: string }[]).map((c: { content: string }) => c.content).join('\n\n---\n\n')
              console.log('RAG ayurveda chunks (inline):', Array.isArray(chunks) ? chunks.length : 0, 'ragText length:', ragText.length)
              const prompt = ragText
                ? `You are a health advisor. Use the AYURVEDA PASSAGES below for remedies. Complete report.

ABNORMAL LAB FINDINGS:
${abnormals.length ? abnormals.join('\n') : 'None identified.'}

PATIENT CONTEXT:
${profileContext || 'Not provided.'}

----- AYURVEDA PASSAGES (MUST use for remedies – cite herbs, foods, practices) -----
${ragText}
----- END PASSAGES -----

Use minimal tokens. Format: Marker >> Condition >> One-line remedy.
**Key Findings:** 2–5 one-line bullets.
**What to do & remedies:** For each finding: Marker >> Condition >> Brief remedy from PASSAGES. One line each.
**When to see a doctor:** 1 sentence.
Output only report text. No greeting. Start with **Key Findings:**.`
                : `You are a health advisor. No Ayurveda passages available.

ABNORMAL LAB FINDINGS:
${abnormals.length ? abnormals.join('\n') : 'None identified.'}

PATIENT CONTEXT:
${profileContext || 'Not provided.'}

Use minimal tokens. Format: Marker >> Condition >> One-line remedy.
**Key Findings:** 2–5 one-line bullets.
**What to do & remedies:** One line per finding.
**When to see a doctor:** 1 sentence.
Output only report text. No greeting. Start with **Key Findings:**.`
              const genRes = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }],
                  generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
                })
              })
              if (genRes.ok) {
                const genData = await genRes.json()
                let recText = ''
                for (const part of genData?.candidates?.[0]?.content?.parts || []) {
                  if (part.text) recText += part.text
                }
                if (recText.trim()) {
                  await supabase.from('health_analysis').insert({
                    report_id: reportId,
                    category: 'Recommendations',
                    findings: {},
                    summary: 'AI-generated: what to do + Ayurveda & home remedies',
                    recommendations: recText.trim(),
                    risk_level: 'Low'
                  })
                  analysisResult.categories['Recommendations'] = { parameters: [{ name: 'Report', value: recText.trim(), normal_range: 'N/A', status: 'normal' }], risk_level: 'Low' }
                  console.log('RAG recommendations saved')
                }
              }
            }
          }
        } catch (ragErr: any) {
          console.warn('RAG recommendations failed (non-fatal):', ragErr?.message || ragErr)
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, analysis: analysisResult }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      },
    )
  } catch (error: any) {
    console.error('Error in Edge Function:', error)
    console.error('Error stack:', error.stack)
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unknown error occurred',
        details: error.stack || error.toString()
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      },
    )
  }
})
