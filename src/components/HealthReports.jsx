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

/** Three phases × 5s = 15s minimum before analysis results / backend call (Generate Ayurveda, Start Analysis). */
const ANALYSIS_PHASE_SECONDS = 5
const ANALYSIS_MIN_SECONDS = ANALYSIS_PHASE_SECONDS * 3

function getAnalysisPhaseLabel(elapsedSeconds) {
  const e = Math.max(0, Math.floor(Number(elapsedSeconds) || 0))
  if (e < ANALYSIS_PHASE_SECONDS) return 'Reading data…'
  if (e < ANALYSIS_PHASE_SECONDS * 2) return 'Analysing parameters…'
  return 'Generating analysis…'
}

function HealthReports({
  userId,
  familyMembers,
  aiEnabled = false,
  aiLlmProvider = 'gemini',
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
  const [analyzingReportId, setAnalyzingReportId] = useState(null)
  const [analysisStartTime, setAnalysisStartTime] = useState(null)
  const [analysisElapsedSeconds, setAnalysisElapsedSeconds] = useState(0)

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
        supabase.from('blood_marker_reference').select('name, aliases'),
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

  // Ticking clock while analysis is in progress (so UI updates every second)
  useEffect(() => {
    if (!analyzingReportId || analysisStartTime == null) return
    const tick = () => setAnalysisElapsedSeconds(Math.floor((Date.now() - analysisStartTime) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [analyzingReportId, analysisStartTime])

  // Processing reports on load: mark completed in background only (no banner). Banner starts only on "Generate Ayurveda analysis" click.
  useEffect(() => {
    const processing = (reports || []).filter((r) => r.analysis_status === 'processing')
    if (processing.length === 0) return
    const ids = processing.map((r) => r.id)
    ;(async () => {
      for (const id of ids) {
        await supabase.from('health_reports').update({ analysis_status: 'completed' }).eq('id', id)
      }
      await loadReports()
    })()
  }, [reports])

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

  function getRemedyForParam(param, reference, remedyList) {
    if (param.status !== 'abnormal' || !reference?.length || !remedyList?.length) return null
    const nameTrim = (param.name || '').trim().toLowerCase()
    const refRow = reference.find(
      (r) => r.name?.toLowerCase() === nameTrim || (r.aliases || []).some((a) => String(a).toLowerCase() === nameTrim)
    )
    const canonical = refRow?.name
    if (!canonical) return null
    const matchNames = [canonical, ...(refRow.aliases || [])].map((n) => (n || '').trim().toLowerCase()).filter(Boolean)
    const numFromStr = (s) => (s && parseFloat(String(s).replace(/[^0-9.-]/g, ' ').trim().split(/\s+/)[0])) ?? NaN
    const valNum = numFromStr(param.value)
    const rangeStr = param.normal_range || ''
    const parts = rangeStr.replace(/[^0-9.-]/g, ' ').trim().split(/\s+/).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n))
    const low = parts[0]
    const high = parts[1]
    const condition = !Number.isNaN(valNum) && !Number.isNaN(low) && !Number.isNaN(high)
      ? (valNum < low ? 'low' : 'high')
      : null
    if (!condition) return null
    const remedy = remedyList.find(
      (r) => matchNames.includes((r.marker_name || '').trim().toLowerCase()) && r.condition === condition
    )
    return remedy ? { remedy_text: remedy.remedy_text, lifestyle_modification: remedy.lifestyle_modification, dietary_recommendations: remedy.dietary_recommendations, dosage_notes: remedy.dosage_notes } : null
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

  const unusedCreditForSelectedTier = entitlements.some((e) => e.tier === analysisTierChoice)

  const handleApplyAnalysisCoupon = async () => {
    if (!supabase || !userId) return
    setCouponSubmitting(true)
    setCouponMessage('')
    try {
      await grantAnalysisCoupon(supabase, analysisTierChoice, couponInput)
      setCouponMessage('Coupon applied — 100% off. You can run Generate once for this plan.')
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
      setAyurvedaMessage(
        `Payment confirmed for ${analysisTierChoice === TIER_FULL ? 'Full analysis (₹249)' : 'Remedies only (₹89)'}. You can run Generate once.`
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

    const { data: entRow, error: entErr } = await supabase
      .from('analysis_entitlements')
      .select('id')
      .eq('tier', analysisTierChoice)
      .is('used_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (entErr || !entRow?.id) {
      setAyurvedaMessage('Error: Pay for the selected plan first, then generate.')
      return
    }
    const entitlementId = entRow.id

    setGeneratingAyurveda(true)
    setSelectedReportIdForView(ayurvedaReportId)
    setAnalysisElapsedSeconds(0)
    setAnalyzingReportId(ayurvedaReportId)
    setAnalysisStartTime(Date.now())
    try {
      await new Promise((r) => setTimeout(r, ANALYSIS_MIN_SECONDS * 1000))
      setAnalyzingReportId(null)
      setAnalysisStartTime(null)

      const tier = analysisTierChoice

      if (tier === TIER_BASIC) {
        const { error: upErr } = await supabase
          .from('health_reports')
          .update({ ayurveda_tier: 'basic' })
          .eq('id', ayurvedaReportId)
          .eq('user_id', userId)
        if (upErr) throw upErr
        const { error: useErr } = await supabase
          .from('analysis_entitlements')
          .update({ used_at: new Date().toISOString() })
          .eq('id', entitlementId)
          .is('used_at', null)
        if (useErr) throw useErr
        setAyurvedaMessage('Ayurvedic remedies are shown for abnormal parameters. Dietary and lifestyle guidance is not included in this plan.')
        setAnalysisCompleteReportId(ayurvedaReportId)
        await loadReports()
        await fetchEntitlements()
        return
      }

      // Full tier
      if (aiEnabled) {
        await generateAyurvedaRecommendations(ayurvedaReportId, userId, {
          llmProvider: aiLlmProvider === 'claude' ? 'claude' : 'gemini',
        })
      }
      const { error: upErr2 } = await supabase
        .from('health_reports')
        .update({ ayurveda_tier: 'full' })
        .eq('id', ayurvedaReportId)
        .eq('user_id', userId)
      if (upErr2) throw upErr2
      const { error: useErr2 } = await supabase
        .from('analysis_entitlements')
        .update({ used_at: new Date().toISOString() })
        .eq('id', entitlementId)
        .is('used_at', null)
      if (useErr2) throw useErr2
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
      if (!reportId) {
        if (!manualReportName.trim()) {
          setError('Please enter a report name')
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
            analysis_status: 'completed'
          })
          .select('id')
          .single()
        if (insertErr) throw insertErr
        reportId = newReport.id
      } else {
        await supabase
          .from('health_reports')
          .update({ report_date: manualReportDate, analysis_status: 'completed' })
          .eq('id', reportId)
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

      // Start AI analysis (run in background but catch errors)
      // Pass both URL and file path - Edge Function can use path with service role
      console.log('Starting AI analysis for report:', reportRecord.id)
      analyzeReport(reportRecord.id, fileUrl, fileName, selectedFile.type).catch(err => {
        console.error('Analysis failed:', err)
        console.error('Error stack:', err.stack)
        setError('Analysis failed: ' + (err.message || 'Unknown error. Please check browser console.'))
      })

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
    const startTime = Date.now()
    setAnalyzingReportId(reportId)
    setAnalysisStartTime(startTime)
    setAnalysisElapsedSeconds(0)
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
      llmProvider: aiLlmProvider === 'claude' ? 'claude' : 'gemini',
    })
  }

  const handleManualAnalyze = async (report) => {
    if (!report.file_path && !report.file_url) {
      setError('Cannot analyze: File path or URL is missing')
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
      {report.analysis_status === 'pending' && (
        <div className="pending-analysis">
          <p>⏳ Analysis not started yet.</p>
          <button
            onClick={() => handleManualAnalyze(report)}
            className="analyze-btn"
            disabled={analyzingReportId === report.id}
          >
            {analyzingReportId === report.id ? 'Analyzing...' : 'Start Analysis'}
          </button>
        </div>
      )}
      {(report.analysis_status === 'processing' || (report.analysis_status === 'completed' && analyzingReportId === report.id)) && (
        <div className="analyzing">
          <p className="analyzing-message">{getAnalysisPhaseLabel(analysisElapsedSeconds)}</p>
          {analyzingReportId === report.id && (
            <div className="analyzing-timer" aria-live="polite">
              <span className="analyzing-clock">⏱</span>
              <span>
                {analysisElapsedSeconds}s / {ANALYSIS_MIN_SECONDS}s
              </span>
            </div>
          )}
        </div>
      )}
      {report.analysis_status === 'completed' && analyzingReportId !== report.id && (() => {
        const sections = getSectionsByCategory(report)
        if (sections.length === 0) {
          return (
            <div className="analysis-results analysis-results-empty">
              <p>No parameters in this report.</p>
            </div>
          )
        }
        const showDietLifestyle = report.ayurveda_tier !== 'basic'
        return (
          <div className="analysis-results analysis-results-by-category">
            {report.ayurveda_tier === 'basic' && (
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
                          <th>Ayurvedic remedy</th>
                          {showDietLifestyle && <th>Dietary recommendations</th>}
                          {showDietLifestyle && <th>Lifestyle modifications</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {params.map((p, idx) => {
                          const param = { name: p.name, value: p.value, normal_range: p.normal_range, status: p.status }
                          const remedy = p.status === 'abnormal' ? getRemedyForParam(param, bloodMarkerReference, remedyLookup) : null
                          return (
                            <tr key={idx} className={`report-format-row report-format-row-${p.status || 'normal'}`}>
                              <td className="report-format-param">
                                <span className="report-param-name">{p.name}</span>
                                <span className="report-param-detail">Value: {p.value}</span>
                                {p.normal_range && <span className="report-param-range">Normal: {p.normal_range}</span>}
                                {p.status === 'abnormal' && <span className="report-param-status-badge">Abnormal</span>}
                              </td>
                              <td className="report-format-remedy">{remedy ? remedy.remedy_text : '—'}</td>
                              {showDietLifestyle && (
                                <td className="report-format-dietary">{remedy?.dietary_recommendations ?? '—'}</td>
                              )}
                              {showDietLifestyle && (
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
          <div className="analyzing-global-banner">
            <p className="analyzing-message">{getAnalysisPhaseLabel(analysisElapsedSeconds)}</p>
            <div className="analyzing-timer" aria-live="polite">
              <span className="analyzing-clock">⏱</span>
              <span>
                {analysisElapsedSeconds}s / {ANALYSIS_MIN_SECONDS}s
              </span>
            </div>
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
        <p className="ayurveda-generate-hint">
          Choose a plan, pay with Razorpay, then run <strong>Generate</strong> once per payment. Full plan includes dietary & lifestyle columns; Basic shows remedies only.
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
          {unusedCreditForSelectedTier ? (
            <span className="analysis-credit-ok">You have an unused credit for this plan — you can generate once.</span>
          ) : (
            <span className="analysis-credit-missing">No unused credit for this plan — apply a coupon or pay below first.</span>
          )}
        </p>

        <div className="analysis-coupon-block">
          <label htmlFor="analysis-coupon-input">
            Coupon code
            <input
              id="analysis-coupon-input"
              type="text"
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
              !unusedCreditForSelectedTier
            }
            className="upload-btn ayurveda-generate-btn"
            title={!unusedCreditForSelectedTier ? 'Pay for the selected plan first' : ''}
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
