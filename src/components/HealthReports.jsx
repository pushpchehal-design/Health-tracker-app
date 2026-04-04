import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { analyzeHealthReport, generateAyurvedaRecommendations } from '../lib/aiService'
import { formatDateDMY, formatDateTimeDMY } from '../utils/dateFormat'
import { openRazorpayPay, verifyAnalysisPayment } from '../lib/razorpayCheckout'
import { grantAnalysisCoupon } from '../lib/analysisCoupon'
import { ANALYSIS_TIERS, TIER_BASIC, TIER_FULL } from '../lib/analysisTiers'
import './HealthReports.css'

const REPORT_CATEGORIES = ['Heart', 'Liver', 'Kidney', 'Blood', 'Metabolic', 'Electrolytes', 'Thyroid', 'Urine', 'Tumor Markers']

const CATEGORY_DISPLAY_ORDER = ['Heart', 'Blood', 'Kidney', 'Liver', 'Metabolic', 'Electrolytes', 'Thyroid', 'Urine', 'Tumor Markers', 'Other']
const CATEGORY_ICONS = {
  Heart: '❤️',
  Blood: '🩸',
  Kidney: '🫘',
  Liver: '🔶',
  Metabolic: '⚡',
  Electrolytes: '💧',
  Thyroid: '🦋',
  Urine: '🧪',
  'Tumor Markers': '📋',
  Other: '•'
}

/** Master CSV / DB marker_name often differs from blood_marker_reference canonical name */
const REMEDY_MARKER_SYNONYMS = {
  'Glucose (Fasting)': ['Fasting Blood Glucose'],
  'Estimated Average Glucose': ['eAG', 'Estimated Average Glucose(eAG)'],
  'Fasting Insulin': ['Serum Insulin', 'Insulin Fasting'],
  'Folate': ['Folic Acid', 'Serum Folate'],
  'Free T3': ['T3 (Triiodothyronine)', 'FT3', 'Triiodothyronine Free'],
  'Free T4': ['T4 (Thyroxine)', 'FT4', 'Free Thyroxine'],
  'Total T3': ['T3 (Triiodothyronine)', 'T3', 'T3 Total'],
  'Total T4': ['T4 (Thyroxine)', 'T4', 'T4 Total'],
  TSH: ['TSH (Thyroid Stimulating Hormone)', 'Thyroid Stimulating Hormone'],
  Basophils: ['Basophils%', 'Basophils %'],
  'Basophils (Abs)': ['Basophils Abs', 'Basophils (ABS)'],
  PlateletCrit: ['PCT', 'Platelet Crit'],
  PLCR: ['Platelet-Large Cell Ratio', 'PLCR (Platelet-Large Cell Ratio)'],
  LDH: ['LDH (Lactate Dehydrogenase)', 'Lactate Dehydrogenase'],
  'Apo B/Apo A1 Ratio': ['APO-B/APO-A1 Ratio', 'APO B/APO A1', 'ApoB/ApoA1'],
  'LDL/HDL Ratio': ['LDL/HDL Ratio', 'LDL / HDL Ratio'],
  BNP: ['B-type Natriuretic Peptide', 'Brain Natriuretic Peptide', 'BNP, Serum'],
  'NT-proBNP': ['NTproBNP', 'NT proBNP', 'N-terminal proBNP', 'NT-PROBNP'],
  'Troponin T': ['TnT', 'Cardiac Troponin T', 'Troponin T, High Sensitive', 'High Sensitive Troponin T'],
  'Troponin I': ['TnI', 'Cardiac Troponin I'],
  'Lipoprotein(a)': ['Lp(a)', 'Lipoprotein (a)', 'LPA', 'Lp a', 'Lipoprotein a'],
  Homocysteine: ['Hcy', 'Plasma Homocysteine', 'Homocysteine, Serum'],
  PDW: ['Platelet Distribution Width'],
  'Carbon Dioxide': ['CO2', 'Bicarbonate', 'HCO3', 'Bicarbonate, Serum', 'CO2, Total'],
  'Urine pH': ['pH (Urine)', 'pH Urine', 'Urine Ph'],
  'Urine Specific Gravity': ['Specific Gravity', 'USG', 'Specific Gravity, Urine'],
  PSA: ['Prostate-Specific Antigen', 'Total PSA'],
}

const REMEDY_FUZZY_MIN_SCORE = 200

function normalizeRemedyKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** For matching report labels to blood_marker_reference when spacing/parens differ (e.g. Lipoprotein (a) vs Lipoprotein(a)). */
function normalizeParamNameForRef(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[‐‑–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactRefKey(s) {
  return normalizeParamNameForRef(s).replace(/\s/g, '')
}

function stripParenLower(s) {
  const t = normalizeRemedyKey(s)
  const i = t.indexOf('(')
  return i === -1 ? t : t.slice(0, i).trim()
}

function scoreRemedyNameMatch(expandedLowerNames, remedyMarkerRaw) {
  const rm = normalizeRemedyKey(remedyMarkerRaw)
  if (!rm || rm.length < 2) return 0
  let best = 0
  for (const mn of expandedLowerNames) {
    const n = mn
    if (!n || n.length < 2) continue
    if (rm === n) return 10000 + n.length
    if (rm.includes(n) || n.includes(rm)) {
      const L = Math.min(n.length, rm.length)
      if (L >= 3) best = Math.max(best, L * 100)
    }
    const rmb = stripParenLower(rm)
    const nb = stripParenLower(n)
    if (rmb.length >= 2 && nb.length >= 2 && (rmb === nb || rmb.includes(nb) || nb.includes(rmb))) {
      const L = Math.min(rmb.length, nb.length)
      if (L >= 3) best = Math.max(best, L * 90)
    }
  }
  return best
}

/** Minimum wait before calling analysis (upload / manual analyze / Generate Ayurveda). */
const ANALYSIS_TOTAL_MS = 20000
const ANALYSIS_MIN_SECONDS = ANALYSIS_TOTAL_MS / 1000

const ANALYSIS_PHASE_LABELS = ['Reading data', 'Analysing data using AI', 'Generating report']

function getAnalysisPhaseFromMs(elapsedMs) {
  const ms = Math.max(0, Math.min(ANALYSIS_TOTAL_MS, Number(elapsedMs) || 0))
  const third = ANALYSIS_TOTAL_MS / 3
  if (ms < third) return { label: ANALYSIS_PHASE_LABELS[0], fillPct: (ms / ANALYSIS_TOTAL_MS) * 100 }
  if (ms < third * 2) return { label: ANALYSIS_PHASE_LABELS[1], fillPct: (ms / ANALYSIS_TOTAL_MS) * 100 }
  return { label: ANALYSIS_PHASE_LABELS[2], fillPct: (ms / ANALYSIS_TOTAL_MS) * 100 }
}

function AnalysisProgressBar({ elapsedMs }) {
  const { label, fillPct } = getAnalysisPhaseFromMs(elapsedMs)
  const pct = Math.min(100, Math.round(fillPct))
  return (
    <div className="analysis-progress-wrap">
      <p className="analysis-progress-phase">{label}</p>
      <div
        className="analysis-progress-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="analysis-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function HealthReports({
  userId,
  familyMembers,
  aiEnabled = false,
  onReportsChange,
  user = null,
  userProfile = null,
}) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [reportName, setReportName] = useState('')
  const [reportType, setReportType] = useState('')
  const [selectedMember, setSelectedMember] = useState('')
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState('')
  const [infoNotice, setInfoNotice] = useState('')
  const [analyzingReportId, setAnalyzingReportId] = useState(null)
  const [analysisStartTime, setAnalysisStartTime] = useState(null)
  const [, setAnalysisProgressTick] = useState(0)

  const [showAddChoice, setShowAddChoice] = useState(false)
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [manualReportId, setManualReportId] = useState(null)
  const [manualReportDate, setManualReportDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [manualReportName, setManualReportName] = useState('')
  const [manualMember, setManualMember] = useState('')
  const [manualCategories, setManualCategories] = useState([])
  const [markersByCategory, setMarkersByCategory] = useState({})
  const [manualValues, setManualValues] = useState({})
  const [savingManual, setSavingManual] = useState(false)
  const [ayurvedaMemberId, setAyurvedaMemberId] = useState('')
  const [ayurvedaReportId, setAyurvedaReportId] = useState('')
  const [generatingAyurveda, setGeneratingAyurveda] = useState(false)
  const [ayurvedaMessage, setAyurvedaMessage] = useState('')
  const [analysisTierChoice, setAnalysisTierChoice] = useState(TIER_BASIC)
  const [entitlements, setEntitlements] = useState([])
  const [ayurvedaPayLoading, setAyurvedaPayLoading] = useState(false)
  const [couponInput, setCouponInput] = useState('')
  const [couponMessage, setCouponMessage] = useState('')
  const [couponSubmitting, setCouponSubmitting] = useState(false)
  /** Until parent session refreshes after Apply; JWT also carries app_metadata.gratitude_full_access */
  const [gratitudeCouponOptimistic, setGratitudeCouponOptimistic] = useState(false)
  const [activeTab, setActiveTab] = useState('analysis') // 'analysis' | 'archived'
  const [selectedReportIdForView, setSelectedReportIdForView] = useState(null) // single report to show in Report Analysis tab
  const [archivedExpandedMembers, setArchivedExpandedMembers] = useState({}) // { memberId: true } for expanded sections
  const [bloodMarkerReference, setBloodMarkerReference] = useState([])
  const [remedyLookup, setRemedyLookup] = useState([])
  const [analysisCompleteReportId, setAnalysisCompleteReportId] = useState(null) // show "Analysis Complete, Click here" when set

  const fetchEntitlements = useCallback(async () => {
    if (!userId || !supabase) {
      setEntitlements([])
      return
    }
    try {
      const { data, error } = await supabase
        .from('analysis_entitlements')
        .select('id, tier, used_at, created_at')
        .is('used_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      setEntitlements(data || [])
    } catch (e) {
      console.warn('Could not load analysis entitlements (run supabase-analysis-entitlements.sql if missing):', e?.message || e)
      setEntitlements([])
    }
  }, [userId])

  const gratitudeFullAccess =
    gratitudeCouponOptimistic || !!user?.app_metadata?.gratitude_full_access

  useEffect(() => {
    if (!user) setGratitudeCouponOptimistic(false)
  }, [user])

  useEffect(() => {
    if (user?.app_metadata?.gratitude_full_access) setGratitudeCouponOptimistic(false)
  }, [user?.app_metadata?.gratitude_full_access])

  useEffect(() => {
    loadReports()
  }, [userId])

  useEffect(() => {
    fetchEntitlements()
  }, [fetchEntitlements])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [refRes, remedyRes] = await Promise.all([
        supabase.from('blood_marker_reference').select('name, aliases, normal_low, normal_high, unit'),
        supabase.from('ayurveda_remedy_lookup').select('marker_name, condition, remedy_text, lifestyle_modification, dietary_recommendations, dosage_notes'),
      ])
      if (cancelled) return
      if (!refRes.error) setBloodMarkerReference(refRes.data || [])
      if (!remedyRes.error) setRemedyLookup(remedyRes.data || [])
    }
    load()
    return () => { cancelled = true }
  }, [])

  // When reports load, default selected report to most recent non-archived
  useEffect(() => {
    const nonArchived = (reports || []).filter((r) => !r.archived)
    if (nonArchived.length === 0) return
    setSelectedReportIdForView((prev) => {
      if (!prev) return nonArchived[0].id
      if (!nonArchived.find((r) => r.id === prev)) return nonArchived[0].id
      return prev
    })
  }, [reports])

  // Progress bar updates ~10×/s while analysis wait is in progress
  useEffect(() => {
    if (!analyzingReportId || analysisStartTime == null) return
    const id = setInterval(() => setAnalysisProgressTick((n) => n + 1), 100)
    return () => clearInterval(id)
  }, [analyzingReportId, analysisStartTime])

  const analysisElapsedMs =
    analyzingReportId && analysisStartTime != null
      ? Math.min(ANALYSIS_TOTAL_MS, Date.now() - analysisStartTime)
      : 0

  /** Report list/header label: never show raw YYYY-MM-DD; use "Name 12 January 2026" format only. */
  function getReportDisplayName(report) {
    const name = (report.report_name || 'Unnamed').trim()
    const dateStr = report.report_date ? formatDateDMY(report.report_date) : formatDateDMY(report.uploaded_at)
    const withoutRawDate = name.replace(/\s*\d{4}-\d{2}-\d{2}\s*$/, '').trim() || 'Unnamed'
    return `${withoutRawDate} ${dateStr}`
  }

  // Disabled automatic polling to prevent infinite requests
  // Reports will be reloaded manually when:
  // 1. User clicks "Start Analysis"
  // 2. Analysis completes (in analyzeReport function)
  // 3. User uploads a new report

  /** Map report parameter label to blood_marker_reference row (exact, compact, then longest substring on name/aliases). */
  function findBloodRefRowForParamName(paramName, reference) {
    const nameTrim = normalizeParamNameForRef(paramName)
    if (!nameTrim || !reference?.length) return null
    const paramCompact = compactRefKey(paramName)
    for (const r of reference) {
      if (normalizeParamNameForRef(r.name) === nameTrim) return r
      if ((r.aliases || []).some((a) => normalizeParamNameForRef(a) === nameTrim)) return r
    }
    for (const r of reference) {
      if (compactRefKey(r.name) === paramCompact) return r
      if ((r.aliases || []).some((a) => compactRefKey(a) === paramCompact)) return r
    }
    let best = null
    let bestLen = 0
    for (const r of reference) {
      const names = [r.name, ...(r.aliases || [])].filter(Boolean)
      for (const cand of names) {
        const c = normalizeParamNameForRef(cand)
        if (c.length < 2) continue
        if (nameTrim.includes(c) || c.includes(nameTrim)) {
          if (c.length > bestLen) {
            bestLen = c.length
            best = r
          }
        }
      }
    }
    return best
  }

  /**
   * missKind: no_remedy_db = ref OK, abnormal direction known, no ayurveda_remedy_lookup row.
   * no_lab_reference = parameter name not in blood_marker_reference.
   * other = loading, unparseable value, in-range vs abnormal mismatch, etc.
   */
  function resolveRemedyForAbnormalParam(param, reference, remedyList) {
    if (param.status !== 'abnormal') {
      return { remedy: null, missKind: null, condition: null, missDetail: null }
    }
    if (!reference?.length || !remedyList?.length) {
      return {
        remedy: null,
        missKind: 'other',
        condition: null,
        missDetail: 'Reference or remedy data is still loading or unavailable.',
      }
    }
    const refRow = findBloodRefRowForParamName(param.name, reference)
    const canonical = refRow?.name
    if (!canonical) {
      return {
        remedy: null,
        missKind: 'no_lab_reference',
        condition: null,
        missDetail: null,
      }
    }
    const matchNames = [canonical, ...(refRow.aliases || [])].map((n) => normalizeRemedyKey(n)).filter(Boolean)
    const extra = REMEDY_MARKER_SYNONYMS[canonical] || []
    const expandedLowerNames = [...new Set([...matchNames, ...extra.map((e) => normalizeRemedyKey(e))])]
    const numFromStr = (s) => {
      const m = String(s || '').match(/-?\d+\.?\d*(?:e[+-]?\d+)?/i)
      return m ? parseFloat(m[0]) : NaN
    }
    const valNum = numFromStr(param.value)
    const rangeStr = param.normal_range || ''
    const parts = rangeStr.replace(/[^0-9.-]/g, ' ').trim().split(/\s+/).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n))
    let low = parts[0]
    let high = parts[1]
    if ((Number.isNaN(low) || Number.isNaN(high)) && refRow.normal_low != null && refRow.normal_high != null) {
      low = Number(refRow.normal_low)
      high = Number(refRow.normal_high)
    }
    const condition = !Number.isNaN(valNum) && !Number.isNaN(low) && !Number.isNaN(high)
      ? (valNum < low ? 'low' : valNum > high ? 'high' : null)
      : null
    if (!condition) {
      return {
        remedy: null,
        missKind: 'other',
        condition: null,
        missDetail: Number.isNaN(valNum)
          ? 'The value could not be read as a number.'
          : 'The value could not be classified as low or high from the available normal range (or it matches normal limits while still flagged abnormal).',
      }
    }
    let bestRemedy = null
    let bestScore = 0
    for (const r of remedyList) {
      if (r.condition !== condition) continue
      const score = scoreRemedyNameMatch(expandedLowerNames, r.marker_name)
      if (score > bestScore) {
        bestScore = score
        bestRemedy = r
      }
    }
    if (!bestRemedy || bestScore < REMEDY_FUZZY_MIN_SCORE) {
      return {
        remedy: null,
        missKind: 'no_remedy_db',
        condition,
        missDetail: null,
      }
    }
    return {
      remedy: {
        remedy_text: bestRemedy.remedy_text,
        lifestyle_modification: bestRemedy.lifestyle_modification,
        dietary_recommendations: bestRemedy.dietary_recommendations,
        dosage_notes: bestRemedy.dosage_notes,
      },
      missKind: null,
      condition: null,
      missDetail: null,
    }
  }

  const loadReports = async () => {
    try {
      const { data, error } = await supabase
        .from('health_reports')
        .select('*, health_analysis(*), health_parameter_readings(*)')
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false })

      if (error) throw error
      setReports(data || [])
      if (onReportsChange) onReportsChange()
    } catch (err) {
      console.error('Error loading reports:', err)
      setError('Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  const handleArchive = async (reportId) => {
    try {
      const { error: updateError } = await supabase
        .from('health_reports')
        .update({ archived: true })
        .eq('id', reportId)
      if (updateError) throw updateError
      await loadReports()
    } catch (err) {
      console.error('Error archiving report:', err)
      alert('Failed to archive: ' + err.message)
    }
  }

  const handleArchiveAll = async () => {
    const toArchive = (reports || []).filter((r) => !r.archived)
    if (toArchive.length === 0) return
    if (!confirm(`Archive all ${toArchive.length} report(s)? They will move to the Archived Reports tab.`)) return
    try {
      const ids = toArchive.map((r) => r.id)
      const { error } = await supabase
        .from('health_reports')
        .update({ archived: true })
        .in('id', ids)
      if (error) throw error
      await loadReports()
    } catch (err) {
      console.error('Error archiving all:', err)
      alert('Failed to archive all: ' + err.message)
    }
  }

  const handleUnarchive = async (reportId) => {
    try {
      const { error } = await supabase
        .from('health_reports')
        .update({ archived: false })
        .eq('id', reportId)
      if (error) throw error
      await loadReports()
    } catch (err) {
      console.error('Error unarchiving report:', err)
      alert('Failed to unarchive: ' + err.message)
    }
  }

  const handleDeleteAllReports = async () => {
    const msg = 'Temporary (testing only): Permanently delete ALL your reports and their analysis? This cannot be undone. Type DELETE to confirm.'
    const confirmed = window.prompt(msg)
    if (confirmed !== 'DELETE') return
    try {
      const { data: myReports } = await supabase.from('health_reports').select('id, file_path').eq('user_id', userId)
      if (!myReports?.length) {
        alert('No reports to delete.')
        return
      }
      const ids = myReports.map((r) => r.id)
      await supabase.from('health_analysis').delete().in('report_id', ids)
      await supabase.from('health_reports').delete().in('id', ids)
      for (const r of myReports) {
        if (r.file_path) await supabase.storage.from('health-reports').remove([r.file_path])
      }
      await loadReports()
      setSelectedReportIdForView(null)
      setActiveTab('analysis')
      alert('All reports deleted.')
    } catch (err) {
      console.error('Error deleting all reports:', err)
      alert('Failed: ' + err.message)
    }
  }

  const nonArchivedReports = (reports || []).filter((r) => !r.archived)
  const archivedReports = (reports || []).filter((r) => r.archived)
  const archivedCount = archivedReports.length
  const nonArchivedCount = nonArchivedReports.length
  const selectedReport = selectedReportIdForView ? nonArchivedReports.find((r) => r.id === selectedReportIdForView) : nonArchivedReports[0] || null
  const archivedByMember = (() => {
    const map = {}
    archivedReports.forEach((r) => {
      const key = r.family_member_id || 'user'
      if (!map[key]) map[key] = []
      map[key].push(r)
    })
    return map
  })()
  const getMemberName = (memberId) => {
    if (!memberId || memberId === 'user') return 'Myself'
    const m = (familyMembers || []).find((fm) => fm.id === memberId)
    return m?.name || 'Member'
  }
  const toggleArchivedSection = (memberId) => {
    setArchivedExpandedMembers((prev) => ({ ...prev, [memberId]: !prev[memberId] }))
  }

  // Include all reports (archived + non-archived) so Ayurveda analysis can be run on any report
  const allReports = reports || []
  const reportsForAyurveda =
    ayurvedaMemberId === ''
      ? allReports
      : ayurvedaMemberId === 'user'
        ? allReports.filter((r) => !r.family_member_id)
        : allReports.filter((r) => r.family_member_id === ayurvedaMemberId)

  const ayurvedaTargetReport = (reports || []).find((r) => r.id === ayurvedaReportId)
  const canGenerateAyurveda =
    gratitudeFullAccess ||
    unusedCreditForSelectedTier ||
    !!(ayurvedaTargetReport && ayurvedaTargetReport.lab_analysis_credit_consumed)

  const loadMarkersForCategory = async (category) => {
    const { data } = await supabase
      .from('blood_marker_reference')
      .select('id, name, unit, normal_low, normal_high')
      .eq('category', category)
      .order('name')
    return data || []
  }

  const openManualForFailedReport = (report) => {
    setManualReportId(report.id)
    setManualReportDate(report.report_date ? report.report_date.slice(0, 10) : new Date(report.uploaded_at).toISOString().slice(0, 10))
    setManualReportName(report.report_name || '')
    setManualMember(report.family_member_id || 'user')
    setManualCategories([])
    setManualValues({})
    setMarkersByCategory({})
    setShowAddChoice(false)
    setShowUpload(false)
    setShowManualEntry(true)
    setError('')
  }

  const startNewManualReport = () => {
    setManualReportId(null)
    setManualReportDate(new Date().toISOString().slice(0, 10))
    setManualReportName('')
    setManualMember('user')
    setManualCategories([])
    setManualValues({})
    setMarkersByCategory({})
    setShowAddChoice(false)
    setShowUpload(false)
    setShowManualEntry(true)
    setError('')
  }

  const startUpload = () => {
    if (!aiEnabled) return
    setShowAddChoice(false)
    setShowManualEntry(false)
    setShowUpload(true)
    setError('')
  }

  const unusedCreditForSelectedTier =
    gratitudeFullAccess || entitlements.some((e) => e.tier === analysisTierChoice)

  /** Paywall: lab extraction / Start Analysis (same credit pool as Generate, consumed when lab succeeds). */
  const canRunLabAnalysis = unusedCreditForSelectedTier

  async function consumeOneUnusedEntitlement(tier) {
    const { data: entRow, error: entErr } = await supabase
      .from('analysis_entitlements')
      .select('id')
      .eq('tier', tier)
      .is('used_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (entErr || !entRow?.id) return { ok: false, error: entErr || new Error('No unused entitlement') }
    const { error: useErr } = await supabase
      .from('analysis_entitlements')
      .update({ used_at: new Date().toISOString() })
      .eq('id', entRow.id)
      .is('used_at', null)
    if (useErr) return { ok: false, error: useErr }
    return { ok: true, id: entRow.id }
  }

  const handleApplyAnalysisCoupon = async () => {
    if (!supabase || !userId) return
    setCouponSubmitting(true)
    setCouponMessage('')
    try {
      const data = await grantAnalysisCoupon(supabase, analysisTierChoice, couponInput)
      if (data?.gratitudeFullAccess) {
        setGratitudeCouponOptimistic(true)
        await supabase.auth.refreshSession()
        setInfoNotice('')
        setCouponMessage(
          'Coupon applied — full access enabled for all your reports (all parameters, remedies, dietary & lifestyle columns).',
        )
      } else {
        setInfoNotice('')
        setCouponMessage('Coupon applied — 100% off. You can run Generate once for this plan.')
      }
      await fetchEntitlements()
    } catch (err) {
      setCouponMessage(err?.message || 'Could not apply coupon')
    } finally {
      setCouponSubmitting(false)
    }
  }

  const handlePayForAyurvedaAnalysis = async () => {
    if (!supabase || !userId) return
    setAyurvedaPayLoading(true)
    setAyurvedaMessage('')
    try {
      const paymentResponse = await openRazorpayPay({
        supabase,
        tier: analysisTierChoice,
        userEmail: user?.email,
        userName: userProfile?.full_name || userProfile?.name || user?.user_metadata?.full_name || '',
      })
      if (!paymentResponse) {
        setAyurvedaMessage('Checkout closed without payment.')
        return
      }
      await verifyAnalysisPayment(supabase, paymentResponse)
      setInfoNotice('')
      setAyurvedaMessage(
        `Payment confirmed for ${analysisTierChoice === TIER_FULL ? 'Full analysis (₹249)' : 'Remedies only (₹89)'}. Use Start lab analysis on your report, then Generate Ayurveda (one credit covers both).`
      )
      await fetchEntitlements()
    } catch (err) {
      setAyurvedaMessage('Error: ' + (err?.message || 'Payment failed'))
    } finally {
      setAyurvedaPayLoading(false)
    }
  }

  const handleGenerateAyurveda = async () => {
    if (!userId || !ayurvedaReportId || generatingAyurveda) return
    setAyurvedaMessage('')

    const targetReport = (reports || []).find((r) => r.id === ayurvedaReportId)
    let entitlementId = null
    if (!gratitudeFullAccess) {
      if (targetReport?.lab_analysis_credit_consumed) {
        entitlementId = null
      } else {
        const { data: entRow, error: entErr } = await supabase
          .from('analysis_entitlements')
          .select('id')
          .eq('tier', analysisTierChoice)
          .is('used_at', null)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (entErr || !entRow?.id) {
          setAyurvedaMessage(
            'Pay or apply the Gratitude coupon, then run lab analysis (Start analysis) or save manual entry on this report so your credit is applied. After that you can generate Ayurveda.',
          )
          return
        }
        entitlementId = entRow.id
      }
    }

    setGeneratingAyurveda(true)
    setSelectedReportIdForView(ayurvedaReportId)
    setAnalysisProgressTick(0)
    setAnalyzingReportId(ayurvedaReportId)
    setAnalysisStartTime(Date.now())
    try {
      await new Promise((r) => setTimeout(r, ANALYSIS_MIN_SECONDS * 1000))
      setAnalyzingReportId(null)
      setAnalysisStartTime(null)

      const tier = gratitudeFullAccess ? TIER_FULL : analysisTierChoice

      if (tier === TIER_BASIC) {
        const { error: upErr } = await supabase
          .from('health_reports')
          .update({ ayurveda_tier: 'basic' })
          .eq('id', ayurvedaReportId)
          .eq('user_id', userId)
        if (upErr) throw upErr
        if (entitlementId) {
          const { error: useErr } = await supabase
            .from('analysis_entitlements')
            .update({ used_at: new Date().toISOString() })
            .eq('id', entitlementId)
            .is('used_at', null)
          if (useErr) throw useErr
        }
        setAyurvedaMessage('Ayurvedic remedies are shown for abnormal parameters. Dietary and lifestyle guidance is not included in this plan.')
        setAnalysisCompleteReportId(ayurvedaReportId)
        await loadReports()
        await fetchEntitlements()
        return
      }

      // Full tier
      if (aiEnabled) {
        await generateAyurvedaRecommendations(ayurvedaReportId, userId, {
          llmProvider: 'claude',
        })
      }
      const { error: upErr2 } = await supabase
        .from('health_reports')
        .update({ ayurveda_tier: 'full' })
        .eq('id', ayurvedaReportId)
        .eq('user_id', userId)
      if (upErr2) throw upErr2
      if (entitlementId) {
        const { error: useErr2 } = await supabase
          .from('analysis_entitlements')
          .update({ used_at: new Date().toISOString() })
          .eq('id', entitlementId)
          .is('used_at', null)
        if (useErr2) throw useErr2
      }
      setAyurvedaMessage(
        aiEnabled
          ? 'Full analysis complete. Scroll to the report for remedies, dietary, lifestyle, and AI notes where available.'
          : 'Full analysis layout shown: remedies, dietary, and lifestyle. Turn on AI for more personalized recommendations.'
      )
      setAnalysisCompleteReportId(ayurvedaReportId)
      await loadReports()
      await fetchEntitlements()
    } catch (err) {
      setAnalyzingReportId(null)
      setAnalysisStartTime(null)
      setAyurvedaMessage('Error: ' + (err?.message || 'Failed to generate'))
    } finally {
      setGeneratingAyurveda(false)
    }
  }

  const cancelAddFlow = () => {
    setShowAddChoice(false)
    setShowUpload(false)
    setShowManualEntry(false)
    setError('')
  }

  const addManualCategory = async (category) => {
    if (manualCategories.includes(category)) return
    const markers = await loadMarkersForCategory(category)
    setMarkersByCategory(prev => ({ ...prev, [category]: markers }))
    setManualCategories(prev => [...prev, category])
  }

  const removeManualCategory = (category) => {
    setManualCategories(prev => prev.filter(c => c !== category))
    setManualValues(prev => {
      const next = { ...prev }
      const markers = markersByCategory[category] || []
      markers.forEach(m => { delete next[m.id] })
      return next
    })
  }

  const setManualValue = (markerId, value) => {
    setManualValues(prev => ({ ...prev, [markerId]: value }))
  }

  const getStatus = (value, low, high) => {
    const num = parseFloat(String(value).replace(/[,]/g, '').trim())
    if (Number.isNaN(num)) return null
    if (num >= low && num <= high) return 'normal'
    return 'abnormal'
  }

  const saveManualEntry = async () => {
    const recordedAt = manualReportDate + 'T12:00:00Z'
    const familyMemberId = manualMember && manualMember !== 'user' ? manualMember : null

    setSavingManual(true)
    setError('')
    try {
      let reportId = manualReportId
      let needsCreditConsumeAfterReadings = false
      if (!reportId) {
        if (!manualReportName.trim()) {
          setError('Please enter a report name')
          setSavingManual(false)
          return
        }
        if (!gratitudeFullAccess && !unusedCreditForSelectedTier) {
          setError('Pay for an analysis plan or apply the Gratitude coupon before saving a new manual report.')
          setSavingManual(false)
          return
        }
        const { data: newReport, error: insertErr } = await supabase
          .from('health_reports')
          .insert({
            user_id: userId,
            family_member_id: familyMemberId,
            report_name: manualReportName.trim(),
            report_type: 'Manual entry',
            file_url: null,
            file_type: 'manual',
            report_date: manualReportDate,
            analysis_status: 'completed',
          })
          .select('id')
          .single()
        if (insertErr) throw insertErr
        reportId = newReport.id
        needsCreditConsumeAfterReadings = !gratitudeFullAccess
      } else {
        const { data: meta, error: metaErr } = await supabase
          .from('health_reports')
          .select('lab_analysis_credit_consumed')
          .eq('id', reportId)
          .single()
        if (metaErr) throw metaErr
        if (!gratitudeFullAccess) {
          if (!meta?.lab_analysis_credit_consumed && !unusedCreditForSelectedTier) {
            setError('Pay or apply the Gratitude coupon before saving values to this report.')
            setSavingManual(false)
            return
          }
          needsCreditConsumeAfterReadings = !meta?.lab_analysis_credit_consumed
        }
        const { error: upErr } = await supabase
          .from('health_reports')
          .update({ report_date: manualReportDate, analysis_status: 'completed' })
          .eq('id', reportId)
        if (upErr) throw upErr
      }

      const rows = []
      for (const category of manualCategories) {
        const markers = markersByCategory[category] || []
        for (const m of markers) {
          const value = manualValues[m.id]
          if (value === undefined || String(value).trim() === '') continue
          const status = getStatus(value, Number(m.normal_low), Number(m.normal_high))
          rows.push({
            user_id: userId,
            family_member_id: familyMemberId,
            report_id: reportId,
            recorded_at: recordedAt,
            category,
            parameter_name: m.name,
            parameter_value: String(value).trim(),
            normal_range: `${m.normal_low} - ${m.normal_high} ${m.unit}`,
            status: status || 'normal'
          })
        }
      }
      if (rows.length === 0) {
        setError('Enter at least one value')
        setSavingManual(false)
        return
      }
      const { error: readingsErr } = await supabase
        .from('health_parameter_readings')
        .insert(rows)
      if (readingsErr) throw readingsErr

      if (needsCreditConsumeAfterReadings && !gratitudeFullAccess) {
        const consumed = await consumeOneUnusedEntitlement(analysisTierChoice)
        if (!consumed.ok) {
          throw new Error(consumed.error?.message || 'Could not apply your analysis credit. Check entitlements or try again.')
        }
        const { error: flagErr } = await supabase
          .from('health_reports')
          .update({ lab_analysis_credit_consumed: true })
          .eq('id', reportId)
        if (flagErr) {
          console.warn('lab_analysis_credit_consumed update failed — run supabase-health-reports-lab-analysis-credit.sql', flagErr)
        }
        await fetchEntitlements()
      }

      setShowManualEntry(false)
      setManualReportId(null)
      setManualCategories([])
      setManualValues({})
      setMarkersByCategory({})
      await loadReports()
    } catch (err) {
      console.error('Save manual entry error:', err)
      setError(err.message || 'Failed to save')
    } finally {
      setSavingManual(false)
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      // Check file type
      const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/jpg']
      if (!validTypes.includes(file.type)) {
        setError('Please upload a PDF, Word document, or image file (JPEG/PNG)')
        return
      }
      
      // Check file size (max 50MB for free tier, can be increased on paid plans)
      const maxSizeMB = 50
      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`File size must be less than ${maxSizeMB}MB`)
        return
      }

      setSelectedFile(file)
      setError('')
      // Auto-fill report name from filename
      if (!reportName) {
        setReportName(file.name.replace(/\.[^/.]+$/, ''))
      }
    }
  }

  const handleUpload = async () => {
    if (!reportDate) {
      setError('Please select the date of the report')
      return
    }
    if (!selectedFile || !reportName.trim()) {
      setError('Please select a file and enter a report name')
      return
    }

    setUploading(true)
    setError('')
    setInfoNotice('')
    console.log('Starting upload process...')

    try {
      // Upload file to Supabase Storage
      const fileExt = selectedFile.name.split('.').pop()
      const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('health-reports')
        .upload(fileName, selectedFile)

      if (uploadError) throw uploadError

      // Get signed URL (valid for 1 hour) for private bucket access
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('health-reports')
        .createSignedUrl(fileName, 3600)

      if (signedUrlError) {
        console.error('Error creating signed URL:', signedUrlError)
        const { data: urlData } = supabase.storage
          .from('health-reports')
          .getPublicUrl(fileName)
        var fileUrl = urlData.publicUrl
      } else {
        var fileUrl = signedUrlData.signedUrl
      }

      const reportData = {
        user_id: userId,
        family_member_id: selectedMember && selectedMember !== 'user' ? selectedMember : null,
        report_name: reportName.trim(),
        report_type: reportType || null,
        report_date: reportDate,
        file_url: fileUrl,
        file_path: fileName,
        file_type: selectedFile.type.includes('pdf') ? 'pdf' : 
                   selectedFile.type.includes('word') ? 'docx' : 'image',
        file_size: selectedFile.size,
        analysis_status: 'pending',
        archived: false
      }

      const { data: reportRecord, error: dbError } = await supabase
        .from('health_reports')
        .insert(reportData)
        .select()
        .single()

      if (dbError) throw dbError

      setInfoNotice(
        'Upload saved. Pay or apply the Gratitude coupon in “Ayurveda analysis (paid)” below, then open this report and tap Start lab analysis.',
      )

      // Reset form
      setSelectedFile(null)
      setReportName('')
      setReportType('')
      setSelectedMember('')
      setShowUpload(false)
      
      await loadReports()
      // Do not show report yet; user will click "Analysis Complete, Click here" when ready
    } catch (err) {
      console.error('Error uploading report:', err)
      console.error('Error details:', JSON.stringify(err, null, 2))
      setError(err.message || 'Failed to upload report. Please check browser console (F12) for details.')
      alert('Upload failed: ' + (err.message || 'Unknown error. Check browser console (F12) for details.'))
    } finally {
      setUploading(false)
    }
  }

  const analyzeReport = async (reportId, fileUrl, filePath, fileType) => {
    if (!gratitudeFullAccess && !unusedCreditForSelectedTier) {
      setError('Pay for an analysis plan or apply the Gratitude coupon before running lab analysis.')
      alert('Pay or apply the Gratitude coupon first, then use Start lab analysis.')
      return
    }

    const startTime = Date.now()
    setAnalyzingReportId(reportId)
    setAnalysisStartTime(startTime)
    setAnalysisProgressTick(0)
    console.log('=== Starting Analysis ===')
    console.log('Report ID:', reportId)
    console.log('File Path:', filePath)
    console.log('File Type:', fileType)
    
    try {
      // Update status to processing
      console.log('Updating status to processing...')
      const { error: updateError } = await supabase
        .from('health_reports')
        .update({ analysis_status: 'processing' })
        .eq('id', reportId)
      
      if (updateError) {
        console.error('Error updating status to processing:', updateError)
        throw new Error('Failed to update status: ' + updateError.message)
      }
      console.log('Status updated to processing')

      // Three 5s phases (15s total) before calling the backend
      await new Promise((resolve) => setTimeout(resolve, ANALYSIS_MIN_SECONDS * 1000))

      // Call AI analysis via Supabase Edge Function
      console.log('Calling Edge Function...')
      console.log('Parameters:', { fileUrl: fileUrl?.substring(0, 50) + '...', filePath, fileType, reportId })

      await performAIAnalysis(fileUrl, filePath, fileType, reportId)

      console.log('✅ Analysis completed successfully')

      if (!gratitudeFullAccess) {
        const consumed = await consumeOneUnusedEntitlement(analysisTierChoice)
        if (!consumed.ok) {
          console.error('Could not mark analysis entitlement used after successful lab run:', consumed.error)
        }
        const { error: flagErr } = await supabase
          .from('health_reports')
          .update({ lab_analysis_credit_consumed: true })
          .eq('id', reportId)
        if (flagErr) {
          console.warn('lab_analysis_credit_consumed column missing? Run supabase-health-reports-lab-analysis-credit.sql', flagErr)
        }
        await fetchEntitlements()
      }

      setAnalysisCompleteReportId(reportId)
      clearAnalysisState()
      await loadReports()
    } catch (err) {
      console.error('❌ Error analyzing report:', err)
      console.error('Error name:', err.name)
      console.error('Error message:', err.message)
      console.error('Error stack:', err.stack)
      console.error('Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
      
      // Update status to failed
      try {
        await supabase
          .from('health_reports')
          .update({ analysis_status: 'failed' })
          .eq('id', reportId)
      } catch (updateErr) {
        console.error('Failed to update status to failed:', updateErr)
      }
      
      // Show error to user
      const errorMsg = err.message || 'Unknown error. Check browser console (F12) for details.'
      setError('AI analysis failed: ' + errorMsg)
      alert('Analysis failed: ' + errorMsg + '\n\nCheck browser console (F12) for more details.')
      setAnalyzingReportId(null)
      setAnalysisStartTime(null)
    } finally {
      await loadReports()
    }
  }
  const clearAnalysisState = () => {
    setAnalyzingReportId(null)
    setAnalysisStartTime(null)
  }

  const performAIAnalysis = async (fileUrl, filePath, fileType, reportId) => {
    return await analyzeHealthReport(fileUrl, filePath, fileType, reportId, aiEnabled, {
      llmProvider: 'claude',
    })
  }

  const handleManualAnalyze = async (report) => {
    if (!report.file_path && !report.file_url) {
      setError('Cannot analyze: File path or URL is missing')
      return
    }

    if (!gratitudeFullAccess && !unusedCreditForSelectedTier) {
      setError('Pay for an analysis plan or apply the Gratitude coupon before running lab analysis.')
      return
    }

    // Get file path from report or reconstruct it from URL
    let filePath = report.file_path
    if (!filePath && report.file_url) {
      // Try to extract path from URL
      // URL format: https://...supabase.co/storage/v1/object/public/health-reports/userId/filename
      const urlParts = report.file_url.split('/health-reports/')
      if (urlParts.length > 1) {
        filePath = urlParts[1]
      } else {
        // Fallback: try to get from storage
        const pathMatch = report.file_url.match(/health-reports\/(.+)$/)
        filePath = pathMatch ? pathMatch[1] : null
      }
    }
    
    const fileUrl = report.file_url

    console.log('Manual analyze - Report:', report.id, 'File path:', filePath, 'File URL:', fileUrl)

    await analyzeReport(
      report.id,
      fileUrl,
      filePath,
      report.file_type || 'pdf'
    )
  }

  const handleDelete = async (reportId) => {
    if (!confirm('Are you sure you want to delete this report?')) return

    try {
      // Get file URL to delete from storage
      const { data: report } = await supabase
        .from('health_reports')
        .select('file_url')
        .eq('id', reportId)
        .single()

      // Delete from storage
      if (report?.file_url) {
        const fileName = report.file_url.split('/').pop()
        await supabase.storage
          .from('health-reports')
          .remove([`${userId}/${fileName}`])
      }

      // Delete from database (cascade will delete analysis)
      const { error } = await supabase
        .from('health_reports')
        .delete()
        .eq('id', reportId)

      if (error) throw error
      await loadReports()
    } catch (err) {
      console.error('Error deleting report:', err)
      alert('Error deleting report: ' + err.message)
    }
  }

  if (loading) {
    return <div className="reports-loading">Loading reports...</div>
  }

  const allMembers = [{ id: 'user', name: 'Myself' }, ...(familyMembers || [])]

  function getSectionsByCategory(report) {
    const byCat = {}
    const readings = report.health_parameter_readings || []
    const analysisList = report.health_analysis || []
    if (readings.length > 0 && analysisList.length === 0) {
      readings.forEach((r) => {
        if (!byCat[r.category]) byCat[r.category] = []
        byCat[r.category].push({
          name: r.parameter_name,
          value: r.parameter_value,
          normal_range: r.normal_range,
          status: r.status || 'normal'
        })
      })
    } else {
      analysisList.forEach((a) => {
        if (a.category === 'Recommendations') return
        const parameters = a.findings?.parameters || []
        parameters.forEach((p) => {
          const cat = a.category || 'Other'
          if (!byCat[cat]) byCat[cat] = []
          byCat[cat].push({
            name: p.name,
            value: p.value,
            normal_range: p.normal_range || '',
            status: p.status || 'normal'
          })
        })
      })
    }
    const ordered = CATEGORY_DISPLAY_ORDER.filter((c) => byCat[c]?.length)
    const rest = Object.keys(byCat).filter((c) => !CATEGORY_DISPLAY_ORDER.includes(c))
    return [...ordered, ...rest].map((category) => ({
      category,
      params: byCat[category]
    }))
  }

  function renderReportCard(report, isArchived = false) {
    const analyzingThis = analyzingReportId === report.id
    return (
      <>
      <div className="report-header">
        <div>
          <h3>{getReportDisplayName(report)}</h3>
          {report.report_type && <span className="report-type">{report.report_type}</span>}
          <div className="report-meta">
            {report.report_date && (
              <span>Report date: {formatDateDMY(report.report_date)}</span>
            )}
            <span>Uploaded: {formatDateDMY(report.uploaded_at)}</span>
            {report.analyzed_at && (
              <span>Analyzed: {formatDateDMY(report.analyzed_at)}</span>
            )}
          </div>
        </div>
        <div className="report-status">
          {report.analysis_status === 'completed' && (
            isArchived ? (
              <button
                type="button"
                onClick={() => handleUnarchive(report.id)}
                className="archive-report-btn archive-report-btn-inline"
                title="Move back to Report Analysis"
              >
                Unarchive
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleArchive(report.id)}
                className="archive-report-btn archive-report-btn-inline"
                title="Archive report"
              >
                Archive
              </button>
            )
          )}
          <span className={`status-badge status-${report.analysis_status}`}>
            {report.analysis_status}
          </span>
          <button
            onClick={() => handleDelete(report.id)}
            className="delete-report-btn"
            title="Delete Report"
          >
            🗑️
          </button>
        </div>
      </div>
      {report.analysis_status === 'pending' && !analyzingThis && (
        <div className="pending-analysis">
          <p>⏳ Lab analysis not started yet. Pay or apply the Gratitude coupon above, then run analysis (uses one credit).</p>
          {!canRunLabAnalysis && (
            <p className="pending-analysis-paywall">You need an unused plan credit or Gratitude access before Start lab analysis is available.</p>
          )}
          <button
            type="button"
            onClick={() => handleManualAnalyze(report)}
            className="analyze-btn"
            disabled={analyzingThis || !canRunLabAnalysis}
            title={!canRunLabAnalysis ? 'Pay or apply coupon in Ayurveda analysis (paid) first' : ''}
          >
            Start lab analysis
          </button>
        </div>
      )}
      {(report.analysis_status === 'processing' ||
        (report.analysis_status === 'completed' && analyzingThis) ||
        (report.analysis_status === 'pending' && analyzingThis)) && (
        <div className="analyzing">
          {analyzingThis && <AnalysisProgressBar elapsedMs={analysisElapsedMs} />}
        </div>
      )}
      {report.analysis_status === 'completed' && !analyzingThis && (() => {
        const ayurvedaUnlocked =
          gratitudeFullAccess ||
          report.ayurveda_tier === 'basic' ||
          report.ayurveda_tier === 'full'
        let sections = getSectionsByCategory(report)
        if (!ayurvedaUnlocked) {
          sections = sections
            .map(({ category, params }) => ({
              category,
              params: params.filter((p) => p.status === 'abnormal'),
            }))
            .filter((s) => s.params.length > 0)
        }
        if (sections.length === 0) {
          return (
            <div className="analysis-results analysis-results-empty">
              {!ayurvedaUnlocked && (
                <div className="analysis-paywall-banner" role="status">
                  <strong>Ayurveda analysis is not included yet.</strong> Remedies, dietary guidance, and lifestyle recommendations unlock after you choose a plan, pay (or apply a coupon), and run{' '}
                  <strong>Generate Ayurveda analysis</strong> in the section above.
                </div>
              )}
              <p>
                {!ayurvedaUnlocked
                  ? 'No abnormal parameters were flagged on this report. If everything is in range, you can still purchase an Ayurveda pass for personalized guidance.'
                  : 'No parameters in this report.'}
              </p>
            </div>
          )
        }
        const showDietLifestyle = gratitudeFullAccess || report.ayurveda_tier === 'full'
        const showRemedyColumns = ayurvedaUnlocked
        const missedRemedyParams = showRemedyColumns
          ? sections.flatMap(({ category, params }) =>
              params
                .filter((p) => p.status === 'abnormal')
                .map((p) => {
                  const param = { name: p.name, value: p.value, normal_range: p.normal_range, status: 'abnormal' }
                  const { remedy, missKind, condition, missDetail } = resolveRemedyForAbnormalParam(
                    param,
                    bloodMarkerReference,
                    remedyLookup
                  )
                  if (remedy) return null
                  return { category, name: p.name, value: p.value, missKind, condition, missDetail }
                })
                .filter(Boolean)
            )
          : []
        return (
          <div className="analysis-results analysis-results-by-category">
            {!ayurvedaUnlocked && (
              <div className="analysis-paywall-banner" role="status">
                <strong>Preview: abnormal findings only.</strong> Ayurvedic remedies, dietary recommendations, and lifestyle modifications are{' '}
                <strong>not shown</strong> until you pay (or use an eligible coupon) and run <strong>Generate Ayurveda analysis</strong> above. This applies to uploaded reports and test data alike.
              </div>
            )}
            {report.ayurveda_tier === 'basic' && !gratitudeFullAccess && (
              <p className="analysis-tier-banner analysis-tier-banner-basic">
                Showing <strong>remedies only</strong> (Basic plan). Upgrade to Full (₹249) for dietary and lifestyle columns on your next analysis.
              </p>
            )}
            {sections.map(({ category, params }) => {
              const icon = CATEGORY_ICONS[category] || '•'
              return (
                <div key={category} className="report-category-section">
                  <div className="report-category-header">
                    <span className="report-category-icon" aria-hidden>{icon}</span>
                    <h4 className="report-category-title">{category}</h4>
                  </div>
                  <div className="report-category-table-wrap">
                    <table className="report-format-table">
                      <thead>
                        <tr>
                          <th>Parameter (value & normal range)</th>
                          {showRemedyColumns && <th>Ayurvedic remedy</th>}
                          {showRemedyColumns && showDietLifestyle && <th>Dietary recommendations</th>}
                          {showRemedyColumns && showDietLifestyle && <th>Lifestyle modifications</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {params.map((p, idx) => {
                          const param = { name: p.name, value: p.value, normal_range: p.normal_range, status: p.status }
                          const remedy =
                            showRemedyColumns && p.status === 'abnormal'
                              ? resolveRemedyForAbnormalParam(param, bloodMarkerReference, remedyLookup).remedy
                              : null
                          return (
                            <tr key={idx} className={`report-format-row report-format-row-${p.status || 'normal'}`}>
                              <td className="report-format-param">
                                <span className="report-param-name">{p.name}</span>
                                <span className="report-param-detail">Value: {p.value}</span>
                                {p.normal_range && <span className="report-param-range">Normal: {p.normal_range}</span>}
                                {p.status === 'abnormal' && <span className="report-param-status-badge">Abnormal</span>}
                              </td>
                              {showRemedyColumns && (
                                <td className="report-format-remedy">{remedy ? remedy.remedy_text : '—'}</td>
                              )}
                              {showRemedyColumns && showDietLifestyle && (
                                <td className="report-format-dietary">{remedy?.dietary_recommendations ?? '—'}</td>
                              )}
                              {showRemedyColumns && showDietLifestyle && (
                                <td className="report-format-lifestyle">{remedy?.lifestyle_modification ?? '—'}</td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
            {missedRemedyParams.length > 0 && (() => {
              const colNoRemedy = missedRemedyParams.filter((r) => r.missKind === 'no_remedy_db')
              const colNoRef = missedRemedyParams.filter((r) => r.missKind === 'no_lab_reference')
              const colOther = missedRemedyParams.filter((r) => r.missKind === 'other')
              const renderMissCell = (rows, emptyLabel) => (
                <div className="report-missed-col-body">
                  {rows.length === 0 ? (
                    <p className="report-missed-empty">{emptyLabel}</p>
                  ) : (
                    <ul className="report-missed-col-list">
                      {rows.map((row, i) => (
                        <li key={`${row.name}-${i}`}>
                          <span className="report-missed-name">{row.name}</span>
                          {row.category && <span className="report-missed-cat">{row.category}</span>}
                          {row.value != null && row.value !== '' && (
                            <span className="report-missed-val">Value: {row.value}</span>
                          )}
                          {row.condition && (
                            <span className="report-missed-direction">({row.condition})</span>
                          )}
                          {row.missDetail && (
                            <span className="report-missed-reason">{row.missDetail}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
              return (
                <div className="report-missed-remedies" role="region" aria-label="Parameters without remedy data">
                  <h4 className="report-missed-remedies-title">Not covered by remedy database</h4>
                  <p className="report-missed-remedies-intro">
                    Abnormal parameters on this report grouped by why no remedy text was shown. Use this to improve reference aliases, remedy CSV rows, or data quality.
                  </p>
                  <div className="report-missed-remedies-grid">
                    <div className="report-missed-col">
                      <h5 className="report-missed-col-head">
                        No matching Ayurvedic remedy in the database for this marker when the value is high.
                        <span className="report-missed-col-head-note"> Same category when the value is low (direction shown per row).</span>
                      </h5>
                      {renderMissCell(colNoRemedy, 'None in this category.')}
                    </div>
                    <div className="report-missed-col">
                      <h5 className="report-missed-col-head">
                        This parameter name does not match any entry in the lab reference ranges.
                      </h5>
                      {renderMissCell(colNoRef, 'None in this category.')}
                    </div>
                    <div className="report-missed-col">
                      <h5 className="report-missed-col-head">Any other condition.</h5>
                      {renderMissCell(colOther, 'None in this category.')}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )
      })()}
      {report.analysis_status === 'failed' && (
        <div className="analysis-error">
          <p>❌ Analysis failed. You can enter values manually instead.</p>
          <button
            type="button"
            onClick={() => openManualForFailedReport(report)}
            className="analyze-btn"
          >
            Enter values manually
          </button>
        </div>
      )}
      {report.file_url && (
        <div className="report-actions">
          <a
            href={report.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="view-file-btn"
          >
            View Original File
          </a>
        </div>
      )}
      </>
    )
  }

  return (
    <div className="health-reports">
      <div className="reports-header">
        <h2>Health Reports & Analysis</h2>
        {analyzingReportId && (
          <div className="analyzing-global-banner" aria-live="polite">
            <AnalysisProgressBar elapsedMs={analysisElapsedMs} />
          </div>
        )}
        {analysisCompleteReportId && (
          <div className="analysis-complete-banner">
            <button
              type="button"
              className="analysis-complete-btn"
              onClick={() => {
                setActiveTab('analysis')
                setSelectedReportIdForView(analysisCompleteReportId)
                setAnalysisCompleteReportId(null)
              }}
            >
              Analysis complete — Click here to view report
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            if (showUpload || showManualEntry) cancelAddFlow();
            else setShowAddChoice(!showAddChoice);
            setError('');
          }}
          className="upload-report-btn"
        >
          {showAddChoice || showUpload || showManualEntry ? 'Cancel' : '+ Add Report'}
        </button>
      </div>

      {infoNotice && (
        <div className="health-reports-info-notice" role="status">
          <p>{infoNotice}</p>
          <button type="button" className="health-reports-info-dismiss" onClick={() => setInfoNotice('')}>
            Dismiss
          </button>
        </div>
      )}

      <div className="reports-tabs-row">
        <div className="reports-tabs">
          <button
            type="button"
            className={`reports-tab ${activeTab === 'analysis' ? 'reports-tab-active' : ''}`}
            onClick={() => setActiveTab('analysis')}
          >
            Report Analysis
          </button>
          <button
            type="button"
            className={`reports-tab ${activeTab === 'archived' ? 'reports-tab-active' : ''}`}
            onClick={() => setActiveTab('archived')}
          >
            Archived Reports {archivedCount > 0 && `(${archivedCount})`}
          </button>
        </div>
        <button
          type="button"
          onClick={handleDeleteAllReports}
          className="delete-all-reports-btn"
          title="Testing only: remove all reports and analysis"
        >
          Temporary: Delete all reports
        </button>
      </div>

      {activeTab === 'analysis' && (
        <>
      <div className="ayurveda-generate-section">
        <h3>Ayurveda analysis (paid)</h3>
        {gratitudeFullAccess && (
          <p className="ayurveda-gratitude-active-banner" role="status">
            Gratitude access is active on this account: lab analysis and full Ayurveda columns do not require Razorpay. Use a different test user if you need to verify the payment flow.
          </p>
        )}
        <p className="ayurveda-generate-hint">
          Choose a plan and pay (or apply the Gratitude coupon). One credit covers <strong>Start lab analysis</strong> on a report (PDF extraction) and then <strong>Generate Ayurveda analysis</strong> for that same report. Full plan includes dietary and lifestyle columns; Basic shows remedies only.
        </p>
        <p className="ayurveda-context-hint">With AI on, Full plan also runs personalized recommendations. Recommendations use profile context when AI is enabled.</p>

        <div className="analysis-tier-cards" role="radiogroup" aria-label="Analysis plan">
          {ANALYSIS_TIERS.map((t) => (
            <label
              key={t.id}
              className={`analysis-tier-card ${analysisTierChoice === t.id ? 'analysis-tier-card-selected' : ''}`}
            >
              <input
                type="radio"
                name="analysis-tier"
                value={t.id}
                checked={analysisTierChoice === t.id}
                onChange={() => {
                  setAnalysisTierChoice(t.id)
                  setAyurvedaMessage('')
                  setCouponMessage('')
                }}
              />
              <span className="analysis-tier-title">{t.title}</span>
              <div className="analysis-tier-price-row">
                <span className="analysis-tier-list-price">₹{t.listPriceInr}</span>
                <span className="analysis-tier-sale-price">₹{t.priceInr}</span>
              </div>
              <span className="analysis-tier-blurb">{t.blurb}</span>
            </label>
          ))}
        </div>

        <p className="analysis-credit-status">
          {gratitudeFullAccess ? (
            <span className="analysis-credit-ok">
              Gratitude access active — all reports show full parameters, remedies, dietary, and lifestyle columns. Generate below is optional (e.g. for AI notes when AI is on).
            </span>
          ) : unusedCreditForSelectedTier ? (
            <span className="analysis-credit-ok">
              You have an unused credit for this plan — run Start lab analysis on a report first (uses the credit), then Generate Ayurveda for that report.
            </span>
          ) : (
            <span className="analysis-credit-missing">No unused credit for this plan — apply a coupon or pay below first.</span>
          )}
        </p>

        <div className="analysis-coupon-block">
          <label htmlFor="analysis-coupon-input">
            Coupon code
            <input
              id="analysis-coupon-input"
              type="password"
              className="analysis-coupon-input"
              value={couponInput}
              onChange={(e) => {
                setCouponInput(e.target.value)
                setCouponMessage('')
              }}
              placeholder="Enter code"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            className="analysis-coupon-apply"
            disabled={couponSubmitting || !couponInput.trim()}
            onClick={handleApplyAnalysisCoupon}
          >
            {couponSubmitting ? 'Applying…' : 'Apply'}
          </button>
          {couponMessage ? (
            <p
              className={`analysis-coupon-msg ${couponMessage.startsWith('Coupon applied') ? 'success' : 'error'}`}
            >
              {couponMessage}
            </p>
          ) : (
            <p className="analysis-coupon-msg">If you have a promotional code, enter it above and tap Apply.</p>
          )}
        </div>

        <div className="ayurveda-pay-row">
          <button
            type="button"
            onClick={handlePayForAyurvedaAnalysis}
            disabled={ayurvedaPayLoading || unusedCreditForSelectedTier}
            className="upload-btn ayurveda-pay-btn"
            title={unusedCreditForSelectedTier ? 'Use Generate below — you already have a credit for this plan' : ''}
          >
            {unusedCreditForSelectedTier
              ? 'Credit ready'
              : ayurvedaPayLoading
                ? 'Opening payment…'
                : `Pay ₹${ANALYSIS_TIERS.find((x) => x.id === analysisTierChoice)?.priceInr ?? '—'}`}
          </button>
          <span className="ayurveda-pay-note">Secure checkout via Razorpay (test cards in test mode).</span>
        </div>

        <div className="ayurveda-generate-form">
          <div className="form-group">
            <label htmlFor="ayurveda-member">Family member</label>
            <select
              id="ayurveda-member"
              value={ayurvedaMemberId}
              onChange={(e) => {
                setAyurvedaMemberId(e.target.value)
                setAyurvedaReportId('')
                setAyurvedaMessage('')
              }}
              className="form-select"
            >
              <option value="">All</option>
              {allMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="ayurveda-report">Report</label>
            <select
              id="ayurveda-report"
              value={ayurvedaReportId}
              onChange={(e) => {
                setAyurvedaReportId(e.target.value)
                setAyurvedaMessage('')
              }}
              className="form-select"
            >
              <option value="">Select report...</option>
              {reportsForAyurveda.map((r) => (
                <option key={r.id} value={r.id}>
                  {getReportDisplayName(r)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleGenerateAyurveda}
            disabled={
              !ayurvedaReportId ||
              generatingAyurveda ||
              reportsForAyurveda.length === 0 ||
              !canGenerateAyurveda ||
              ayurvedaTargetReport?.analysis_status !== 'completed'
            }
            className="upload-btn ayurveda-generate-btn"
            title={
              ayurvedaTargetReport?.analysis_status !== 'completed'
                ? 'Complete lab analysis for this report first'
                : !canGenerateAyurveda
                  ? 'Pay, apply coupon, or use a report that already used a credit for lab analysis'
                  : ''
            }
          >
            {generatingAyurveda ? 'Generating...' : 'Generate Ayurveda analysis'}
          </button>
        </div>
        {ayurvedaMessage && (
          <div className={`ayurveda-message ${ayurvedaMessage.startsWith('Error') ? 'ayurveda-message-error' : 'ayurveda-message-success'}`}>
            {ayurvedaMessage}
          </div>
        )}
      </div>

      <div className="report-analysis-single">
        {nonArchivedReports.length > 0 ? (
          <>
            <div className="report-selector-row">
              <label htmlFor="report-view-select">View report:</label>
              <select
                id="report-view-select"
                value={selectedReportIdForView || ''}
                onChange={(e) => setSelectedReportIdForView(e.target.value || null)}
                className="form-select report-view-select"
              >
                {nonArchivedReports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {getReportDisplayName(r)}
                  </option>
                ))}
              </select>
              {nonArchivedCount > 1 && (
                <button
                  type="button"
                  onClick={handleArchiveAll}
                  className="archive-all-btn archive-all-btn-inline"
                  title="Move all other reports to Archived"
                >
                  Archive all others ({nonArchivedCount - 1})
                </button>
              )}
            </div>
            {selectedReport && (
                <div className="reports-list reports-list-single">
                  <div className="report-analysis-header report-analysis-meta-card">
                    <div className="report-analysis-meta-row">
                      <span className="report-analysis-label">Report name</span>
                      <strong className="report-analysis-value">{getReportDisplayName(selectedReport)}</strong>
                    </div>
                    <div className="report-analysis-meta-row">
                      <span className="report-analysis-label">Name</span>
                      <strong className="report-analysis-value">{getMemberName(selectedReport.family_member_id)}</strong>
                    </div>
                    <div className="report-analysis-meta-row">
                      <span className="report-analysis-label">Generated</span>
                      <strong className="report-analysis-value">
                        {formatDateTimeDMY(selectedReport.uploaded_at)}
                      </strong>
                    </div>
                  </div>
                  <div className="report-card">
                    {renderReportCard(selectedReport)}
                  </div>
                </div>
              )}
          </>
        ) : (
          <div className="empty-reports">
            <p>No reports to analyze yet.</p>
            <p className="hint">Click &quot;Add Report&quot; to upload or enter a report. It will appear here for analysis.</p>
          </div>
        )}
      </div>
        </>
      )}

      {activeTab === 'archived' && (
        <div className="archived-section">
          {archivedReports.length === 0 ? (
            <div className="empty-reports">
              <p>No archived reports.</p>
              <p className="hint">Archive reports from Report Analysis to keep that tab focused on one report.</p>
            </div>
          ) : (
            Object.entries(archivedByMember).map(([memberId, memberReports]) => {
              const name = getMemberName(memberId)
              const isExpanded = archivedExpandedMembers[memberId] === true
              return (
                <div key={memberId} className="archived-member-group">
                  <button
                    type="button"
                    className="archived-member-header"
                    onClick={() => toggleArchivedSection(memberId)}
                    aria-expanded={isExpanded}
                  >
                    <span className="archived-member-name">{name}</span>
                    <span className="archived-member-count">({memberReports.length} report{memberReports.length !== 1 ? 's' : ''})</span>
                    <span className="archived-member-toggle">{isExpanded ? '▼' : '▶'}</span>
                  </button>
                  {isExpanded && (
                    <div className="archived-member-reports">
                      {memberReports.map((report) => (
                        <div key={report.id} className="report-card report-card-archived">
                          {renderReportCard(report, true)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {showAddChoice && (
        <div className="add-report-choice">
          <p className="add-report-choice-label">How do you want to add this report?</p>
          <div className="add-report-options">
            <button
              type="button"
              onClick={() => aiEnabled && startUpload()}
              className={`add-report-option-btn${!aiEnabled ? ' add-report-option-btn-disabled' : ''}`}
              disabled={!aiEnabled}
              title={!aiEnabled ? 'Turn on AI in the left panel to upload reports' : ''}
            >
              <span className="option-icon">📄</span>
              <span className="option-title">Upload the report</span>
              <span className="option-desc">{aiEnabled ? 'PDF, Word, or image' : 'Turn on AI (left panel) first'}</span>
            </button>
            <button type="button" onClick={startNewManualReport} className="add-report-option-btn">
              <span className="option-icon">✏️</span>
              <span className="option-title">Add data manually</span>
              <span className="option-desc">Enter values by category</span>
            </button>
          </div>
          {!aiEnabled && (
            <p className="add-report-ai-required">Turn on <strong>AI Engine</strong> in the left panel to upload reports.</p>
          )}
        </div>
      )}

      {showUpload && (
        <div className="upload-section">
          <h3>Upload Health Report</h3>
          {error && (
            <div className="error-message" style={{ backgroundColor: '#ff4444', color: '#fff', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
              <strong>Error:</strong> {error}
            </div>
          )}
          {uploading && (
            <div style={{ backgroundColor: '#646cff', color: '#fff', padding: '1rem', borderRadius: '6px', marginBottom: '1rem', textAlign: 'center' }}>
              <strong>⏳ Uploading and analyzing report... This may take 30-60 seconds.</strong>
            </div>
          )}
          
          <div className="upload-form">
            <div className="form-group">
              <label htmlFor="report-date">Date of report *</label>
              <input
                type="date"
                id="report-date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                required
              />
              <small className="form-hint">When the test was done (so we can compare over time)</small>
            </div>

            <div className="form-group">
              <label htmlFor="report-name">Report Name *</label>
              <input
                type="text"
                id="report-name"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="e.g., Blood Test - January 2025"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="report-type">Report Type</label>
                <select
                  id="report-type"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                >
                  <option value="">Select Type</option>
                  <option value="Blood Test">Blood Test</option>
                  <option value="X-Ray">X-Ray</option>
                  <option value="CT Scan">CT Scan</option>
                  <option value="MRI">MRI</option>
                  <option value="Ultrasound">Ultrasound</option>
                  <option value="ECG">ECG</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="member-select">For</label>
                <select
                  id="member-select"
                  value={selectedMember}
                  onChange={(e) => setSelectedMember(e.target.value)}
                >
                  {allMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="file-upload">Upload File *</label>
              <input
                type="file"
                id="file-upload"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={handleFileSelect}
                className="file-input"
              />
              {selectedFile && (
                <div className="file-info">
                  <span>Selected: {selectedFile.name}</span>
                  <span>Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              )}
              <small className="form-hint">
                Supported formats: PDF, Word documents, Images (JPEG, PNG). Max size: 50MB
              </small>
            </div>

            <button
              onClick={handleUpload}
              disabled={uploading || !reportDate || !selectedFile || !reportName.trim()}
              className="upload-btn"
            >
              {uploading ? 'Uploading...' : 'Upload & Analyze'}
            </button>
          </div>
        </div>
      )}

      {showManualEntry && (
        <div className="manual-entry-section">
          <h3>{manualReportId ? 'Enter values manually (report had an error)' : 'Add report manually'}</h3>
          {error && (
            <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>
          )}
          <div className="form-group">
            <label>Date of report *</label>
            <input
              type="date"
              value={manualReportDate}
              onChange={(e) => setManualReportDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Report name</label>
            <input
              type="text"
              value={manualReportName}
              onChange={(e) => setManualReportName(e.target.value)}
              placeholder="e.g., Blood test Jan 2025"
              disabled={!!manualReportId}
            />
          </div>
          <div className="form-group">
            <label>For</label>
            <select
              value={manualMember}
              onChange={(e) => setManualMember(e.target.value)}
              disabled={!!manualReportId}
            >
              {allMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Add category</label>
            <select
              value=""
              onChange={(e) => { const v = e.target.value; if (v) addManualCategory(v); e.target.value = ''; }}
            >
              <option value="">Select category...</option>
              {REPORT_CATEGORIES.filter(c => !manualCategories.includes(c)).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {manualCategories.map((cat) => (
            <div key={cat} className="manual-category-block">
              <div className="manual-category-header">
                <h4>{cat}</h4>
                <button type="button" onClick={() => removeManualCategory(cat)} className="remove-category-btn">Remove</button>
              </div>
              <div className="manual-markers-grid">
                {(markersByCategory[cat] || []).map((m) => (
                  <div key={m.id} className="manual-marker-row">
                    <label>{m.name} ({m.unit})</label>
                    <input
                      type="text"
                      placeholder={`${m.normal_low} - ${m.normal_high}`}
                      value={manualValues[m.id] ?? ''}
                      onChange={(e) => setManualValue(m.id, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="manual-entry-actions">
            <button type="button" onClick={cancelAddFlow} className="cancel-btn">Cancel</button>
            <button type="button" onClick={saveManualEntry} disabled={savingManual || manualCategories.length === 0} className="upload-btn">
              {savingManual ? 'Saving...' : 'Save report'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

export default HealthReports
