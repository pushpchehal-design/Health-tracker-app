import { useState, useEffect } from 'react'
import { formatDateDMY, compareFormatDateDMY } from '../utils/dateFormat'
import { supabase } from '../lib/supabase'
import { clampPlausibleLabValue } from '../lib/plausibleLabValues'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  Legend
} from 'recharts'
import './FamilyHealth.css'

const CATEGORY_ORDER = ['Heart', 'Liver', 'Kidney', 'Blood', 'Metabolic', 'Thyroid', 'Electrolytes', 'Urine', 'Tumor Markers']

// Complete test markers for remedy validation. Optional: direction ('low'|'high'|'both'),
// maxAbnormalHigh / minAbnormalLow = plausible caps so values are never impossible (e.g. Hemoglobin never 100).
const TEST_MARKERS_REMEDY = [
  { name: 'Hemoglobin', unit: 'g/dL', normal_low: 12, normal_high: 17, category: 'Blood', direction: 'both', minAbnormalLow: 5, maxAbnormalHigh: 22 },
  { name: 'RBC', unit: 'million/mcL', normal_low: 4.2, normal_high: 5.9, category: 'Blood', direction: 'both', minAbnormalLow: 2.5, maxAbnormalHigh: 6.5 },
  { name: 'Hematocrit', unit: '%', normal_low: 36, normal_high: 50, category: 'Blood', direction: 'both', minAbnormalLow: 22, maxAbnormalHigh: 58 },
  { name: 'MCV', unit: 'fL', normal_low: 80, normal_high: 100, category: 'Blood', direction: 'both', minAbnormalLow: 65, maxAbnormalHigh: 115 },
  { name: 'MCH', unit: 'pg', normal_low: 27, normal_high: 33, category: 'Blood', direction: 'both', minAbnormalLow: 20, maxAbnormalHigh: 38 },
  { name: 'MCHC', unit: 'g/dL', normal_low: 32, normal_high: 36, category: 'Blood', direction: 'both', minAbnormalLow: 28, maxAbnormalHigh: 40 },
  { name: 'RDW', unit: '%', normal_low: 11.5, normal_high: 14.5, category: 'Blood', direction: 'both', minAbnormalLow: 10, maxAbnormalHigh: 22 },
  { name: 'WBC', unit: 'cells/mcL', normal_low: 4500, normal_high: 11000, category: 'Blood', direction: 'both', minAbnormalLow: 1500, maxAbnormalHigh: 25000 },
  { name: 'Neutrophils', unit: '%', normal_low: 40, normal_high: 80, category: 'Blood', direction: 'both', minAbnormalLow: 15, maxAbnormalHigh: 90 },
  { name: 'Lymphocytes', unit: '%', normal_low: 20, normal_high: 40, category: 'Blood', direction: 'both', minAbnormalLow: 5, maxAbnormalHigh: 60 },
  { name: 'Monocytes', unit: '%', normal_low: 2, normal_high: 10, category: 'Blood', direction: 'both', minAbnormalLow: 1, maxAbnormalHigh: 15 },
  { name: 'Monocytes (Abs)', unit: '10^3 Cells/µL', normal_low: 0.5, normal_high: 0.9, category: 'Blood', direction: 'both', minAbnormalLow: 0.05, maxAbnormalHigh: 1.5 },
  { name: 'Eosinophils', unit: '%', normal_low: 1, normal_high: 6, category: 'Blood', direction: 'both', minAbnormalLow: 0, maxAbnormalHigh: 15 },
  { name: 'Eosinophils (Abs)', unit: '10^3 Cells/µL', normal_low: 0.2, normal_high: 0.5, category: 'Blood', direction: 'both', minAbnormalLow: 0.02, maxAbnormalHigh: 1.2 },
  { name: 'Platelet Count', unit: 'cells/mcL', normal_low: 150000, normal_high: 400000, category: 'Blood', direction: 'both', minAbnormalLow: 50000, maxAbnormalHigh: 600000 },
  { name: 'PlateletCrit', unit: '%', normal_low: 0.22, normal_high: 0.24, category: 'Blood', direction: 'both', minAbnormalLow: 0.12, maxAbnormalHigh: 0.35 },
  { name: 'MPV', unit: 'fL', normal_low: 9, normal_high: 13, category: 'Blood', direction: 'both', minAbnormalLow: 6, maxAbnormalHigh: 15 },
  { name: 'ESR', unit: 'mm/hr', normal_low: 0, normal_high: 10, category: 'Blood', direction: 'high', maxAbnormalHigh: 80 },
  { name: 'Total Cholesterol', unit: 'mg/dL', normal_low: 100, normal_high: 200, category: 'Heart', direction: 'both', minAbnormalLow: 80, maxAbnormalHigh: 350 },
  { name: 'LDL Cholesterol', unit: 'mg/dL', normal_low: 0, normal_high: 100, category: 'Heart', direction: 'high', maxAbnormalHigh: 250 },
  { name: 'HDL Cholesterol', unit: 'mg/dL', normal_low: 40, normal_high: 60, category: 'Heart', direction: 'low', minAbnormalLow: 20 },
  { name: 'VLDL Cholesterol', unit: 'mg/dL', normal_low: 0, normal_high: 30, category: 'Heart', direction: 'high', maxAbnormalHigh: 60 },
  { name: 'Triglycerides', unit: 'mg/dL', normal_low: 0, normal_high: 150, category: 'Heart', direction: 'high', maxAbnormalHigh: 450 },
  {
    name: 'Estimated Average Glucose(eAG)',
    unit: 'mg/dL',
    normal_low: 70,
    normal_high: 126,
    category: 'Metabolic',
    direction: 'both',
    minAbnormalLow: 45,
    maxAbnormalHigh: 220,
  },
  { name: 'Non HDL Cholesterol', unit: 'mg/dL', normal_low: 0, normal_high: 130, category: 'Heart', direction: 'high', maxAbnormalHigh: 220 },
  { name: 'Total Cholesterol/HDL Ratio', unit: 'ratio', normal_low: 0, normal_high: 5, category: 'Heart', direction: 'both', minAbnormalLow: 0, maxAbnormalHigh: 8 },
  { name: 'Apolipoprotein A1', unit: 'mg/dL', normal_low: 70, normal_high: 120, category: 'Heart', direction: 'both', minAbnormalLow: 50, maxAbnormalHigh: 160 },
  { name: 'Apolipoprotein B', unit: 'mg/dL', normal_low: 50, normal_high: 90, category: 'Heart', direction: 'high', maxAbnormalHigh: 180 },
  { name: 'Lipoprotein(a)', unit: 'mg/dL', normal_low: 0, normal_high: 30, category: 'Heart', direction: 'high', maxAbnormalHigh: 120 },
  { name: 'CRP', unit: 'mg/L', normal_low: 0, normal_high: 3, category: 'Heart', direction: 'high', maxAbnormalHigh: 100 },
  { name: 'Homocysteine', unit: 'µmol/L', normal_low: 5, normal_high: 15, category: 'Heart', direction: 'high', maxAbnormalHigh: 50 },
  { name: 'Creatinine', unit: 'mg/dL', normal_low: 0.7, normal_high: 1.3, category: 'Kidney', direction: 'both', minAbnormalLow: 0.4, maxAbnormalHigh: 4 },
  { name: 'Urea', unit: 'mg/dL', normal_low: 15, normal_high: 48, category: 'Kidney', direction: 'both', minAbnormalLow: 5, maxAbnormalHigh: 120 },
  { name: 'BUN', unit: 'mg/dL', normal_low: 7, normal_high: 20, category: 'Kidney', direction: 'both', minAbnormalLow: 2, maxAbnormalHigh: 55 },
  { name: 'Uric Acid', unit: 'mg/dL', normal_low: 3.5, normal_high: 7.2, category: 'Kidney', direction: 'both', minAbnormalLow: 2, maxAbnormalHigh: 12 },
  { name: 'eGFR', unit: 'mL/min/1.73m2', normal_low: 90, normal_high: 120, category: 'Kidney', direction: 'low', minAbnormalLow: 18 },
  { name: 'Sodium', unit: 'mEq/L', normal_low: 136, normal_high: 145, category: 'Kidney', direction: 'both', minAbnormalLow: 125, maxAbnormalHigh: 155 },
  { name: 'Potassium', unit: 'mEq/L', normal_low: 3.5, normal_high: 5.0, category: 'Kidney', direction: 'both', minAbnormalLow: 2.5, maxAbnormalHigh: 6.2 },
  { name: 'Urine Protein', unit: 'mg/dL', normal_low: 0, normal_high: 20, category: 'Kidney', direction: 'high', maxAbnormalHigh: 400 },
  { name: 'ALT', unit: 'U/L', normal_low: 7, normal_high: 56, category: 'Liver', direction: 'high', maxAbnormalHigh: 400 },
  { name: 'AST', unit: 'U/L', normal_low: 10, normal_high: 40, category: 'Liver', direction: 'high', maxAbnormalHigh: 400 },
  { name: 'Alkaline Phosphatase', unit: 'U/L', normal_low: 44, normal_high: 147, category: 'Liver', direction: 'high', maxAbnormalHigh: 500 },
  { name: 'Bilirubin (Total)', unit: 'mg/dL', normal_low: 0.1, normal_high: 1.2, category: 'Liver', direction: 'high', maxAbnormalHigh: 8 },
  { name: 'Bilirubin (Direct)', unit: 'mg/dL', normal_low: 0, normal_high: 0.3, category: 'Liver', direction: 'high', maxAbnormalHigh: 5 },
  { name: 'Bilirubin (Indirect)', unit: 'mg/dL', normal_low: 0.2, normal_high: 1.0, category: 'Liver', direction: 'high', maxAbnormalHigh: 6 },
  { name: 'Total Protein', unit: 'g/dL', normal_low: 6.4, normal_high: 8.3, category: 'Liver', direction: 'both', minAbnormalLow: 5, maxAbnormalHigh: 10 },
  { name: 'Albumin', unit: 'g/dL', normal_low: 3.4, normal_high: 5.4, category: 'Liver', direction: 'both', minAbnormalLow: 2, maxAbnormalHigh: 6 },
  { name: 'Globulin', unit: 'g/dL', normal_low: 1.9, normal_high: 3.9, category: 'Liver', direction: 'both', minAbnormalLow: 1.2, maxAbnormalHigh: 5 },
  { name: 'GGT', unit: 'U/L', normal_low: 9, normal_high: 48, category: 'Liver', direction: 'high', maxAbnormalHigh: 350 }
]

function roundDomainBound(v, roundUp) {
  if (v === 0) return 0
  const abs = Math.abs(v)
  let step = 1
  if (abs < 0.01) step = 0.001
  else if (abs < 0.1) step = 0.01
  else if (abs < 1) step = 0.1
  else if (abs < 10) step = 1
  else if (abs < 100) step = 10
  else step = Math.pow(10, Math.floor(Math.log10(abs)))
  const scaled = v / step
  const rounded = roundUp ? Math.ceil(scaled) * step : Math.floor(scaled) * step
  return Math.round(rounded * 1e6) / 1e6
}

function formatTick(value) {
  if (value == null || Number.isNaN(value)) return ''
  const n = Number(value)
  if (Math.abs(n) >= 10000 || (Math.abs(n) < 0.001 && n !== 0)) return n.toExponential(2)
  const rounded = Math.round(n * 100) / 100
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded))
  return rounded.toFixed(2).replace(/\.?0+$/, '')
}

function randomInRange(low, high) {
  return low + Math.random() * (high - low)
}

/** Generate an abnormal value respecting direction (low/high/both) and plausible bounds. */
function randomAbnormalValue(marker, low, high) {
  const dir = marker.direction || 'both'
  const range = high - low
  const defaultMargin = Math.max(range * 0.25, 0.01)
  const maxH = marker.maxAbnormalHigh != null ? marker.maxAbnormalHigh : high + defaultMargin
  const minL = marker.minAbnormalLow != null ? marker.minAbnormalLow : low - defaultMargin
  let goHigh = dir === 'high' || (dir === 'both' && Math.random() < 0.5)
  if (dir === 'low') goHigh = false
  if (dir === 'high') goHigh = true
  const raw = goHigh
    ? high + Math.random() * (maxH - high)
    : minL + Math.random() * (low - minL)
  if (low >= 0 && raw < 0) return 0
  return raw
}

/**
 * Draw abnormal values that stay outside the lab reference interval but inside plausible physiology
 * (avoids impossible numbers such as urine pH 2.6).
 */
function randomAbnormalValuePlausible(marker, low, high) {
  const maxAttempts = 18
  for (let i = 0; i < maxAttempts; i++) {
    const raw = randomAbnormalValue(marker, low, high)
    const clamped = clampPlausibleLabValue(marker.name, marker.unit, raw)
    if (clamped < low || clamped > high) return clamped
  }
  const dir = marker.direction || 'both'
  const tryHighFirst = dir === 'high' || (dir === 'both' && Math.random() < 0.5)
  const sides = tryHighFirst ? ['high', 'low'] : ['low', 'high']
  for (const side of sides) {
    for (let m = 1; m <= 25; m++) {
      const bump = Math.max((high - low) * 0.04 * m, 0.0001)
      let v = side === 'high' ? high + bump : low - bump
      if (low >= 0 && v < 0) v = 0
      const c = clampPlausibleLabValue(marker.name, marker.unit, v)
      if (c < low || c > high) return c
    }
  }
  const fallback = tryHighFirst
    ? high + Math.max(0.001, (high - low) * 0.12)
    : Math.max(0, low - Math.max(0.001, (high - low) * 0.12))
  return clampPlausibleLabValue(marker.name, marker.unit, fallback)
}

/** When a marker is only in the reference list (not TEST_MARKERS_REMEDY), guess low vs high abnormal direction for plausible values. */
function inferDirectionForRefName(name) {
  const n = (name || '').toLowerCase()
  if (/\(abs\)|absolute/.test(n)) return 'both'
  if (/non[\s-]*hdl/.test(n)) return 'high'
  if (/\beag\b|estimated average glucose|hba1c|glycated|glucose fasting|blood sugar|fasting glucose/.test(n)) return 'high'
  if (/egfr|glomerular filtration/.test(n)) return 'low'
  if (/\bhdl\b/.test(n)) return 'low'
  if (
    /ldl|vldl|triglycerid|total cholesterol|apolipoprotein|lipoprotein\(|crp|homocysteine|bilirubin|\balt\b|\bast\b|ggt|alkaline phosphatase|creatinine|^urea$|\bbun\b|uric acid|\besr\b|plt|platelet|mpv|pdw|plateletcrit|wbc|neutrophil|lymphocyte|eosinophil|basophil|monocyte/.test(
      n,
    )
  ) {
    return 'high'
  }
  return 'both'
}

/** Map a blood_marker_reference row to the same shape as TEST_MARKERS_REMEDY entries. */
function markerFromReferenceRow(row) {
  const low = Number(row.normal_low)
  const high = Number(row.normal_high)
  if (Number.isNaN(low) || Number.isNaN(high) || high <= low) return null
  const preset = TEST_MARKERS_REMEDY.find((t) => t.name === row.name)
  if (preset) return preset
  const range = high - low
  const margin = Math.max(range * 0.4, low === 0 ? high * 0.12 : range * 0.25, 0.001)
  return {
    name: row.name,
    unit: row.unit || '',
    normal_low: low,
    normal_high: high,
    category: row.category,
    direction: inferDirectionForRefName(row.name),
    minAbnormalLow: low >= 0 ? Math.max(0, low - margin * 2) : low - margin,
    maxAbnormalHigh: high + margin * 2,
  }
}

/** Built-in random mix vs every reference marker forced abnormal (for remedy gap testing). */
async function resolveMarkersForTestDataMode(mode, supabaseClient) {
  if (mode === 'random') {
    return { markers: TEST_MARKERS_REMEDY, label: 'mixed random' }
  }
  const { data: refRows, error } = await supabaseClient
    .from('blood_marker_reference')
    .select('name, unit, normal_low, normal_high, category')
    .order('category', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  const byName = new Map()
  for (const row of refRows || []) {
    const m = markerFromReferenceRow(row)
    if (m) byName.set(m.name, m)
  }
  for (const t of TEST_MARKERS_REMEDY) {
    if (!byName.has(t.name)) byName.set(t.name, t)
  }
  return { markers: [...byName.values()], label: 'all abnormal (full reference)' }
}

function roundValue(val, low, high) {
  const range = high - low
  const decimals = range < 0.1 ? 3 : range < 1 ? 2 : range < 10 ? 2 : 1
  return Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals)
}

function firstName(fullName) {
  if (!fullName || fullName === 'Myself') return fullName || '—'
  const first = String(fullName).trim().split(/\s+/)[0] || ''
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

function FamilyHealth({ userId, userProfile, familyMembers }) {
  const [error, setError] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState('user')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [parameterCharts, setParameterCharts] = useState([])
  const [testDataDate, setTestDataDate] = useState('')
  const [testDataForAll, setTestDataForAll] = useState(true)
  const [testDataMemberId, setTestDataMemberId] = useState('user')
  const [generatingTestData, setGeneratingTestData] = useState(false)
  const [testDataMessage, setTestDataMessage] = useState({ type: '', text: '' })
  /** 'random' = built-in list, ~45% abnormal; 'allAbnormal' = every reference-list marker + extras, all out of range */
  const [testDataMode, setTestDataMode] = useState('random')
  const [outputType, setOutputType] = useState('graph')
  const [allMembersCharts, setAllMembersCharts] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedCategoryFamily, setSelectedCategoryFamily] = useState('')
  const [outputTypeFamily, setOutputTypeFamily] = useState('graph')
  const [loadingOne, setLoadingOne] = useState(false)
  const [loadingFamily, setLoadingFamily] = useState(false)

  const membersList = [
    { id: 'user', name: userProfile?.name || 'Myself' },
    ...(familyMembers || []).map((m) => ({ id: m.id, name: m.name || 'Unknown' }))
  ]

  const memberKeyToName = {
    user: userProfile?.name || 'Myself',
    ...Object.fromEntries((familyMembers || []).map((m) => [m.id, m.name || 'Unknown']))
  }
  const memberKeyToFirstName = Object.fromEntries(
    Object.entries(memberKeyToName).map(([k, name]) => [k, firstName(name)])
  )

  useEffect(() => {
    if (!userId || !selectedCategory) {
      setParameterCharts([])
      return
    }
    loadMemberCategoryData()
  }, [userId, selectedMemberId, selectedCategory, dateFrom, dateTo])

  useEffect(() => {
    if (!userId || !selectedCategoryFamily) {
      setAllMembersCharts([])
      return
    }
    loadAllMembersCategoryData()
  }, [userId, selectedCategoryFamily, dateFrom, dateTo])

  const loadMemberCategoryData = async () => {
    setLoadingOne(true)
    setError('')
    try {
      const familyMemberId = selectedMemberId === 'user' ? null : selectedMemberId

      let reportsQuery = supabase
        .from('health_reports')
        .select('id, report_date, uploaded_at')
        .eq('user_id', userId)
        .order('report_date', { ascending: true })
      if (familyMemberId == null) {
        reportsQuery = reportsQuery.is('family_member_id', null)
      } else {
        reportsQuery = reportsQuery.eq('family_member_id', familyMemberId)
      }
      if (dateFrom) reportsQuery = reportsQuery.gte('report_date', dateFrom)
      if (dateTo) reportsQuery = reportsQuery.lte('report_date', dateTo)
      const { data: reports, error: reportsErr } = await reportsQuery
      if (reportsErr) throw reportsErr
      if (!reports || reports.length === 0) {
        setParameterCharts([])
        setLoadingOne(false)
        return
      }

      const reportIds = reports.map((r) => r.id)
      const reportDateById = {}
      const reportSortKeyById = {}
      reports.forEach((r, idx) => {
        const d = r.report_date || r.uploaded_at
        reportDateById[r.id] = d ? formatDateDMY(d) : ''
        reportSortKeyById[r.id] = d ? new Date(d).getTime() : idx
      })

      const { data: readings, error: readErr } = await supabase
        .from('health_parameter_readings')
        .select('report_id, parameter_name, parameter_value, normal_range')
        .in('report_id', reportIds)
        .eq('category', selectedCategory)

      if (readErr) throw readErr

      const { data: refRows } = await supabase
        .from('blood_marker_reference')
        .select('name, unit, normal_low, normal_high')
        .eq('category', selectedCategory)

      const refMap = {}
      ;(refRows || []).forEach((r) => {
        refMap[r.name] = { unit: r.unit, normalLow: Number(r.normal_low), normalHigh: Number(r.normal_high) }
      })

      const byParam = {}
      for (const row of readings || []) {
        const dateLabel = reportDateById[row.report_id]
        if (!dateLabel) continue
        const num = parseFloat(String(row.parameter_value).replace(/[,]/g, '').trim())
        if (Number.isNaN(num)) continue
        const key = `${row.parameter_name}|${row.report_id}`
        if (!byParam[row.parameter_name]) byParam[row.parameter_name] = {}
        byParam[row.parameter_name][key] = { date: dateLabel, value: num, sortKey: reportSortKeyById[row.report_id] }
      }

      const charts = []
      for (const [paramName, pointMap] of Object.entries(byParam)) {
        const ref = refMap[paramName]
        const points = Object.values(pointMap)
        const sorted = [...points].sort((a, b) => a.sortKey - b.sortKey).map((p) => ({ date: p.date, value: p.value }))
        const valMin = Math.min(...sorted.map((p) => p.value))
        const valMax = Math.max(...sorted.map((p) => p.value))
        const low = ref ? ref.normalLow : valMin - 5
        const high = ref ? ref.normalHigh : valMax + 5
        const range = high - low
        const padding = Math.max(range * 0.1, 0.01)
        const rawMin = Math.min(low, valMin) - padding
        const rawMax = Math.max(high, valMax) + padding
        const yMin = roundDomainBound(rawMin, false)
        const yMax = roundDomainBound(rawMax, true)
        charts.push({
          parameterName: paramName,
          unit: ref?.unit || '',
          normalLow: ref?.normalLow,
          normalHigh: ref?.normalHigh,
          data: sorted,
          yDomain: [yMin, yMax]
        })
      }
      setParameterCharts(charts)
    } catch (err) {
      console.error('Family health load error:', err)
      setError(err.message || 'Failed to load data')
      setParameterCharts([])
    } finally {
      setLoadingOne(false)
    }
  }

  const loadAllMembersCategoryData = async () => {
    setLoadingFamily(true)
    setError('')
    try {
      let reportsQuery = supabase
        .from('health_reports')
        .select('id, report_date, uploaded_at, family_member_id')
        .eq('user_id', userId)
        .order('report_date', { ascending: true })
      if (dateFrom) reportsQuery = reportsQuery.gte('report_date', dateFrom)
      if (dateTo) reportsQuery = reportsQuery.lte('report_date', dateTo)
      const { data: reports, error: reportsErr } = await reportsQuery
      if (reportsErr) throw reportsErr
      if (!reports || reports.length === 0) {
        setAllMembersCharts([])
        setLoadingFamily(false)
        return
      }

      const reportIds = reports.map((r) => r.id)
      const reportDateById = {}
      const reportMemberById = {}
      reports.forEach((r) => {
        const d = r.report_date || r.uploaded_at
        reportDateById[r.id] = d ? formatDateDMY(d) : ''
        reportMemberById[r.id] = r.family_member_id == null ? 'user' : r.family_member_id
      })

      const { data: readings, error: readErr } = await supabase
        .from('health_parameter_readings')
        .select('report_id, parameter_name, parameter_value')
        .in('report_id', reportIds)
        .eq('category', selectedCategoryFamily)
      if (readErr) throw readErr

      const { data: refRows } = await supabase
        .from('blood_marker_reference')
        .select('name, unit, normal_low, normal_high')
        .eq('category', selectedCategoryFamily)
      const refMap = {}
      ;(refRows || []).forEach((r) => {
        refMap[r.name] = { unit: r.unit, normalLow: Number(r.normal_low), normalHigh: Number(r.normal_high) }
      })

      const byParam = {}
      for (const row of readings || []) {
        const dateLabel = reportDateById[row.report_id]
        const memberKey = reportMemberById[row.report_id]
        if (!dateLabel) continue
        const num = parseFloat(String(row.parameter_value).replace(/[,]/g, '').trim())
        if (Number.isNaN(num)) continue
        if (!byParam[row.parameter_name]) byParam[row.parameter_name] = {}
        const key = `${dateLabel}|${memberKey}`
        if (!byParam[row.parameter_name][key]) byParam[row.parameter_name][key] = { date: dateLabel, members: {} }
        byParam[row.parameter_name][key].members[memberKey] = num
      }

      const dateSet = new Set()
      Object.values(byParam).forEach((pointMap) => Object.values(pointMap).forEach((p) => dateSet.add(p.date)))
      const sortedDates = [...dateSet].filter(Boolean).sort(compareFormatDateDMY)

      const memberKeys = ['user', ...(familyMembers || []).map((m) => m.id)]
      const charts = []
      for (const [paramName, pointMap] of Object.entries(byParam)) {
        const ref = refMap[paramName]
        const byDate = {}
        for (const p of Object.values(pointMap)) {
          if (!byDate[p.date]) byDate[p.date] = { date: p.date }
          Object.assign(byDate[p.date], p.members)
        }
        const data = sortedDates.map((d) => byDate[d] || { date: d })
        const allVals = data.flatMap((p) => memberKeys.map((k) => p[k]).filter((v) => v != null))
        const valMin = allVals.length ? Math.min(...allVals) : 0
        const valMax = allVals.length ? Math.max(...allVals) : 100
        const low = ref ? ref.normalLow : valMin - 5
        const high = ref ? ref.normalHigh : valMax + 5
        const range = high - low
        const padding = Math.max(range * 0.1, 0.01)
        const yMin = roundDomainBound(Math.min(low, valMin) - padding, false)
        const yMax = roundDomainBound(Math.max(high, valMax) + padding, true)
        charts.push({
          parameterName: paramName,
          unit: ref?.unit || '',
          normalLow: ref?.normalLow,
          normalHigh: ref?.normalHigh,
          data,
          memberKeys,
          yDomain: [yMin, yMax]
        })
      }
      setAllMembersCharts(charts)
    } catch (err) {
      console.error('Family health all-members load error:', err)
      setError(err.message || 'Failed to load data')
      setAllMembersCharts([])
    } finally {
      setLoadingFamily(false)
    }
  }

  const generateTestData = async () => {
    if (!userId || !testDataDate) {
      setTestDataMessage({ type: 'error', text: 'Please select a date.' })
      return
    }
    setGeneratingTestData(true)
    setTestDataMessage({ type: '', text: '' })
    try {
      const { markers, label: modeLabel } = await resolveMarkersForTestDataMode(testDataMode, supabase)
      const allAbnormal = testDataMode === 'allAbnormal'

      const members = testDataForAll
        ? [{ familyMemberId: null }, ...(familyMembers || []).map((m) => ({ familyMemberId: m.id }))]
        : [{ familyMemberId: testDataMemberId === 'user' ? null : testDataMemberId }]
      const recordedAt = `${testDataDate}T12:00:00.000Z`

      for (const { familyMemberId } of members) {
        const reportLabel = allAbnormal ? `Test data (all abnormal) ${testDataDate}` : `Test data ${testDataDate}`
        const { data: report, error: reportErr } = await supabase
          .from('health_reports')
          .insert({
            user_id: userId,
            family_member_id: familyMemberId,
            report_name: reportLabel,
            report_type: 'Test data',
            file_url: null,
            file_type: 'test',
            report_date: testDataDate,
            analysis_status: 'pending',
          })
          .select('id')
          .single()
        if (reportErr) throw reportErr

        const rows = []
        for (const m of markers) {
          const low = Number(m.normal_low)
          const high = Number(m.normal_high)
          if (Number.isNaN(low) || Number.isNaN(high) || high <= low) continue
          const outOfRange = allAbnormal || Math.random() < 0.45
          const raw = outOfRange
            ? randomAbnormalValuePlausible(m, low, high)
            : clampPlausibleLabValue(m.name, m.unit, randomInRange(low, high))
          const value = roundValue(raw, low, high)
          const status = value >= low && value <= high ? 'normal' : 'abnormal'
          rows.push({
            user_id: userId,
            family_member_id: familyMemberId,
            report_id: report.id,
            recorded_at: recordedAt,
            category: m.category,
            parameter_name: m.name,
            parameter_value: String(value),
            normal_range: `${m.normal_low} - ${m.normal_high} ${m.unit}`,
            status
          })
        }
        const { error: readingsErr } = await supabase
          .from('health_parameter_readings')
          .insert(rows)
        if (readingsErr) throw readingsErr
      }

      const who = testDataForAll ? `all ${members.length} member(s)` : memberKeyToName[testDataMemberId] || 'selected member'
      const dateShown = formatDateDMY(testDataDate)
      setTestDataMessage({
        type: 'success',
        text: `Test data (${modeLabel}) for ${dateShown} — ${who}. ${markers.length} parameters. In Health Reports, open the new report and tap Start lab analysis when you want it marked complete (uses one credit; no AI on test files).`,
      })
      setTestDataDate('')
    } catch (err) {
      console.error('Generate test data error:', err)
      setTestDataMessage({ type: 'error', text: err.message || 'Failed to generate test data.' })
    } finally {
      setGeneratingTestData(false)
    }
  }

  return (
    <div className="family-health">
      <div className="family-health-top-grid">
        <div className="family-health-sidebar">
      <div className="family-health-test-data">
        <h3 className="family-health-test-data-title">Generate test data (testing only)</h3>
        <div className="family-health-test-data-row family-health-test-data-mode">
          <label className="family-health-test-data-option">
            <input
              type="radio"
              name="testDataMode"
              checked={testDataMode === 'random'}
              onChange={() => setTestDataMode('random')}
            />
            <span>Mixed random (~45% abnormal)</span>
          </label>
          <label className="family-health-test-data-option">
            <input
              type="radio"
              name="testDataMode"
              checked={testDataMode === 'allAbnormal'}
              onChange={() => setTestDataMode('allAbnormal')}
            />
            <span>All abnormal (full reference list)</span>
          </label>
        </div>
        <div className="family-health-test-data-row family-health-test-data-options">
          <label className="family-health-test-data-option">
            <input
              type="radio"
              name="testDataScope"
              checked={testDataForAll}
              onChange={() => setTestDataForAll(true)}
            />
            <span>All members</span>
          </label>
          <label className="family-health-test-data-option">
            <input
              type="radio"
              name="testDataScope"
              checked={!testDataForAll}
              onChange={() => setTestDataForAll(false)}
            />
            <span>Selected member</span>
          </label>
          {!testDataForAll && (
            <select
              value={testDataMemberId}
              onChange={(e) => setTestDataMemberId(e.target.value)}
              className="family-health-test-data-member-select"
              aria-label="Select family member"
            >
              {membersList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="family-health-test-data-row family-health-test-data-date-row">
          <div className="family-health-date-field">
            <input
              type="date"
              value={testDataDate}
              onChange={(e) => setTestDataDate(e.target.value)}
              className="family-health-test-data-date"
              max="2099-12-31"
              aria-label="Report date for test data"
            />
            {testDataDate ? (
              <span className="family-health-date-readable">{formatDateDMY(testDataDate)}</span>
            ) : (
              <span className="family-health-date-readable family-health-date-placeholder">Day month year</span>
            )}
          </div>
          <button
            type="button"
            onClick={generateTestData}
            disabled={generatingTestData || !testDataDate}
            className="family-health-test-data-btn"
          >
            {generatingTestData ? 'Generating…' : testDataForAll ? 'Generate for all members' : `Generate for ${memberKeyToName[testDataMemberId] || 'selected'}`}
          </button>
        </div>
        {testDataMessage.text && (
          <p className={`family-health-test-data-msg family-health-test-data-msg-${testDataMessage.type}`}>
            {testDataMessage.text}
          </p>
        )}
      </div>

      <div className="family-health-date-range">
        <h3 className="family-health-date-range-title">Report between dates</h3>
        <p className="family-health-date-range-hint">Optional. Limit data to reports within this range. Leave empty to use all dates.</p>
        <div className="family-health-date-range-row">
          <div className="form-group family-health-date-field">
            <label>From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="family-health-date-input"
            />
            {dateFrom ? (
              <span className="family-health-date-readable">{formatDateDMY(dateFrom)}</span>
            ) : (
              <span className="family-health-date-readable family-health-date-placeholder">Day month year</span>
            )}
          </div>
          <div className="form-group family-health-date-field">
            <label>To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="family-health-date-input"
            />
            {dateTo ? (
              <span className="family-health-date-readable">{formatDateDMY(dateTo)}</span>
            ) : (
              <span className="family-health-date-readable family-health-date-placeholder">Day month year</span>
            )}
          </div>
        </div>
      </div>
        </div>

        <div className="family-health-main">
      <div className="family-health-panel">
      <section className="family-health-section family-health-section--panel">
        <h2 className="family-health-section-title family-health-panel-heading">1) Complete family analysis</h2>
        <p className="family-health-intro">One category for all family members (4–5 people). One graph per row.</p>
        <div className="family-health-filters">
          <div className="filter-row">
            <div className="form-group">
              <label>Parameter (category)</label>
              <select value={selectedCategoryFamily} onChange={(e) => setSelectedCategoryFamily(e.target.value)}>
                <option value="">Select category</option>
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {selectedCategoryFamily && (
              <div className="form-group">
                <label>Output</label>
                <select value={outputTypeFamily} onChange={(e) => setOutputTypeFamily(e.target.value)}>
                  <option value="graph">Graph</option>
                  <option value="table">Tabular</option>
                </select>
              </div>
            )}
          </div>
        </div>
        {loadingFamily && <div className="family-health-loading"><p>Loading…</p></div>}
        {!loadingFamily && selectedCategoryFamily && allMembersCharts.length === 0 && !error && (
          <div className="family-health-empty"><p>No report data for any member in &quot;{selectedCategoryFamily}&quot; in the selected date range.</p></div>
        )}
      </section>
      </div>

      <div className="family-health-panel">
        <section className="family-health-section family-health-section--panel">
          <h2 className="family-health-section-title family-health-panel-heading">2) One member & parameter analysis</h2>
          <div className="family-health-filters">
            <div className="filter-row">
              <div className="form-group">
                <label>Family member</label>
                <select value={selectedMemberId} onChange={(e) => setSelectedMemberId(e.target.value)}>
                  {membersList.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Parameter (category)</label>
                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                  <option value="">Select category</option>
                  {CATEGORY_ORDER.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              {selectedCategory && (
                <div className="form-group">
                  <label>Output</label>
                  <select value={outputType} onChange={(e) => setOutputType(e.target.value)}>
                    <option value="graph">Graph</option>
                    <option value="table">Tabular</option>
                  </select>
                </div>
              )}
            </div>
          </div>
          {loadingOne && <div className="family-health-loading"><p>Loading…</p></div>}
          {!loadingOne && selectedCategory && parameterCharts.length === 0 && !error && (
            <div className="family-health-empty"><p>No report data for this member and category in the selected date range.</p></div>
          )}
        </section>
      </div>
        </div>
      </div>

      {((!loadingFamily && allMembersCharts.length > 0 && (outputTypeFamily === 'graph' || outputTypeFamily === 'table')) ||
        (!loadingOne && parameterCharts.length > 0 && (outputType === 'graph' || outputType === 'table'))) && (
        <div className="family-health-report-full">
          <div className="family-health-panel family-health-report-full-inner">
            <h3 className="family-health-report-full-title">Graphical / tabular report</h3>

            {!loadingFamily && outputTypeFamily === 'graph' && allMembersCharts.length > 0 && (() => {
              const colors = ['#646cff', '#22c55a', '#eab308', '#f97316', '#ec4899', '#8b5cf6', '#06b6d4']
              return (
                <div className="family-health-report-subsection">
                  <p className="family-health-intro">1) Complete family — X-axis: report date. One line per family member (first names).</p>
                  <div className="family-health-charts family-health-charts-single">
                    {allMembersCharts.map((chart) => (
                      <div key={chart.parameterName} className="family-health-chart-card">
                        <h3>{chart.parameterName} {chart.unit && `(${chart.unit})`}</h3>
                        <ResponsiveContainer width="100%" height={340}>
                          <LineChart data={chart.data} margin={{ top: 12, right: 12, left: 12, bottom: 24 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                            <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 11 }} stroke="#94a3b8" label={{ value: 'Report date', position: 'insideBottom', offset: -8, fill: '#64748b', fontSize: 11 }} />
                            <YAxis domain={chart.yDomain} tick={{ fill: '#475569', fontSize: 11 }} tickFormatter={formatTick} stroke="#94a3b8" label={{ value: chart.unit ? `Value (${chart.unit})` : 'Value', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
                            <Tooltip
                              contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#0f172a' }}
                              labelStyle={{ color: '#334155', fontWeight: 600 }}
                              labelFormatter={(label) => `Date: ${label}`}
                            />
                            {chart.normalLow != null && chart.normalHigh != null && <ReferenceArea y1={chart.normalLow} y2={chart.normalHigh} fill="#22c55a" fillOpacity={0.2} strokeOpacity={0.3} />}
                            {chart.memberKeys.map((mk, i) => (
                              <Line key={mk} type="monotone" dataKey={mk} name={memberKeyToFirstName[mk] || memberKeyToName[mk] || mk} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 4, fill: colors[i % colors.length] }} connectNulls />
                            ))}
                            <Legend wrapperStyle={{ color: '#334155', fontSize: 12 }} />
                          </LineChart>
                        </ResponsiveContainer>
                        {chart.normalLow != null && chart.normalHigh != null && <p className="reference-range-note">Acceptable range: {chart.normalLow} – {chart.normalHigh} {chart.unit}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {!loadingFamily && outputTypeFamily === 'table' && allMembersCharts.length > 0 && (() => {
              const memberKeys = allMembersCharts[0]?.memberKeys
              return (
                <div className="family-health-report-subsection">
                  <p className="family-health-intro">1) Complete family — Latest value per member.</p>
                  <div className="family-health-table-wrap">
                    <table className="family-health-table">
                      <thead>
                        <tr>
                          <th>Parameter</th>
                          {memberKeys?.map((mk) => <th key={mk}>{memberKeyToName[mk] || mk}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {allMembersCharts.map((chart) => {
                          const latestByMember = {}
                          chart.data.forEach((p) => chart.memberKeys.forEach((mk) => { if (p[mk] != null) latestByMember[mk] = p[mk] }))
                          return (
                            <tr key={chart.parameterName}>
                              <td className="family-health-table-param">{chart.parameterName}{chart.unit && <span className="family-health-table-unit"> ({chart.unit})</span>}</td>
                              {memberKeys?.map((mk) => <td key={mk}>{latestByMember[mk] != null ? formatTick(latestByMember[mk]) : '—'}</td>)}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}

            {!loadingOne && outputType === 'graph' && parameterCharts.length > 0 && (
              <div className="family-health-report-subsection">
                <p className="family-health-intro family-health-intro--chart-grid">2) One member — X-axis: report date. Shaded band: acceptable range. Line: values over time. Up to three parameters per row.</p>
                <div className="family-health-charts family-health-charts-three family-health-charts-member-grid">
                  {parameterCharts.map((chart) => (
                    <div key={chart.parameterName} className="family-health-chart-card">
                      <h3>{chart.parameterName} {chart.unit && `(${chart.unit})`}</h3>
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={chart.data} margin={{ top: 12, right: 12, left: 12, bottom: 24 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                          <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 11 }} stroke="#94a3b8" label={{ value: 'Report date', position: 'insideBottom', offset: -8, fill: '#64748b', fontSize: 11 }} />
                          <YAxis domain={chart.yDomain} tick={{ fill: '#475569', fontSize: 11 }} tickFormatter={formatTick} stroke="#94a3b8" label={{ value: chart.unit ? `Value (${chart.unit})` : 'Value', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#0f172a' }}
                            labelStyle={{ color: '#334155', fontWeight: 600 }}
                            formatter={(value) => [value, 'Value']}
                            labelFormatter={(label) => `Date: ${label}`}
                          />
                          {chart.normalLow != null && chart.normalHigh != null && <ReferenceArea y1={chart.normalLow} y2={chart.normalHigh} fill="#22c55a" fillOpacity={0.2} strokeOpacity={0.3} />}
                          <Line type="monotone" dataKey="value" name="Value" stroke="#4f46e5" strokeWidth={2} dot={{ r: 4, fill: '#4f46e5' }} connectNulls />
                          <Legend wrapperStyle={{ color: '#334155', fontSize: 12 }} />
                        </LineChart>
                      </ResponsiveContainer>
                      {chart.normalLow != null && chart.normalHigh != null && <p className="reference-range-note">Acceptable range: {chart.normalLow} – {chart.normalHigh} {chart.unit}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!loadingOne && outputType === 'table' && parameterCharts.length > 0 && (() => {
              const dateSet = new Set()
              parameterCharts.forEach((c) => c.data.forEach((d) => dateSet.add(d.date)))
              const sortedDates = [...dateSet].filter(Boolean).sort(compareFormatDateDMY)
              return (
                <div className="family-health-report-subsection">
                  <p className="family-health-intro">2) One member — Change is from earliest to latest report (↑ up, ↓ down).</p>
                  <div className="family-health-table-wrap">
                    <table className="family-health-table">
                      <thead>
                        <tr>
                          <th>Parameter</th>
                          {sortedDates.map((date) => <th key={date}>{date}</th>)}
                          <th className="family-health-table-change">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parameterCharts.map((chart) => {
                          const valueByDate = Object.fromEntries(chart.data.map((d) => [d.date, d.value]))
                          const firstVal = chart.data[0]?.value
                          const lastVal = chart.data[chart.data.length - 1]?.value
                          let changeCell = '—'
                          if (firstVal != null && lastVal != null && chart.data.length > 1) {
                            const diff = lastVal - firstVal
                            const sign = diff > 0 ? '↑' : diff < 0 ? '↓' : '→'
                            const label = diff !== 0 ? `${sign} ${Math.abs(diff).toFixed(2)}` : '→ no change'
                            changeCell = <span className={diff > 0 ? 'change-up' : diff < 0 ? 'change-down' : 'change-same'}>{label}</span>
                          }
                          return (
                            <tr key={chart.parameterName}>
                              <td className="family-health-table-param">{chart.parameterName}{chart.unit && <span className="family-health-table-unit"> ({chart.unit})</span>}</td>
                              {sortedDates.map((date) => <td key={date}>{valueByDate[date] != null ? formatTick(valueByDate[date]) : '—'}</td>)}
                              <td className="family-health-table-change">{changeCell}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {error && (
        <div className="family-health-error">
          <p>{error}</p>
        </div>
      )}
    </div>
  )
}

export default FamilyHealth
