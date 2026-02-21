import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { analyzeHealthReport, generateAyurvedaRecommendations } from '../lib/aiService'
import './HealthReports.css'

const REPORT_CATEGORIES = ['Heart', 'Liver', 'Kidney', 'Blood', 'Metabolic', 'Electrolytes', 'Thyroid', 'Urine', 'Tumor Markers']

function HealthReports({ userId, familyMembers, aiEnabled = false, onReportsChange }) {
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
  const [activeTab, setActiveTab] = useState('analysis') // 'analysis' | 'archived'
  const [selectedReportIdForView, setSelectedReportIdForView] = useState(null) // single report to show in Report Analysis tab
  const [archivedExpandedMembers, setArchivedExpandedMembers] = useState({}) // { memberId: true } for expanded sections
  const [bloodMarkerReference, setBloodMarkerReference] = useState([])
  const [remedyLookup, setRemedyLookup] = useState([])

  useEffect(() => {
    loadReports()
  }, [userId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [refRes, remedyRes] = await Promise.all([
        supabase.from('blood_marker_reference').select('name, aliases'),
        supabase.from('ayurveda_remedy_lookup').select('marker_name, condition, remedy_text, lifestyle_modification, dosage_notes'),
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

  // Disabled automatic polling to prevent infinite requests
  // Reports will be reloaded manually when:
  // 1. User clicks "Start Analysis"
  // 2. Analysis completes (in analyzeReport function)
  // 3. User uploads a new report

  function getRemedyForParam(param, reference, remedyList) {
    if (param.status !== 'abnormal' || !reference?.length || !remedyList?.length) return null
    const nameTrim = (param.name || '').trim().toLowerCase()
    const canonical = reference.find(
      (r) => r.name?.toLowerCase() === nameTrim || (r.aliases || []).some((a) => String(a).toLowerCase() === nameTrim)
    )?.name
    if (!canonical) return null
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
      (r) => (r.marker_name || '').trim().toLowerCase() === canonical.toLowerCase() && r.condition === condition
    )
    return remedy ? { remedy_text: remedy.remedy_text, lifestyle_modification: remedy.lifestyle_modification, dosage_notes: remedy.dosage_notes } : null
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

  const handleGenerateAyurveda = async () => {
    if (!userId || !ayurvedaReportId || generatingAyurveda) return
    if (!aiEnabled) {
      setSelectedReportIdForView(ayurvedaReportId)
      setAyurvedaMessage('Remedies from database are shown below each abnormal parameter. Turn on AI for personalized recommendations.')
      return
    }
    setGeneratingAyurveda(true)
    setAyurvedaMessage('')
    try {
      await generateAyurvedaRecommendations(ayurvedaReportId, userId)
      setAyurvedaMessage('Recommendations generated. Scroll to the report to see "What to do & remedies".')
      await loadReports()
    } catch (err) {
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
      
      // Reload reports and show this report in Report Analysis tab
      await loadReports()
      setSelectedReportIdForView(reportRecord.id)
      setActiveTab('analysis')
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
    setAnalyzingReportId(reportId)
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

      // Call AI analysis via Supabase Edge Function
      console.log('Calling Edge Function...')
      console.log('Parameters:', { fileUrl: fileUrl?.substring(0, 50) + '...', filePath, fileType, reportId })
      
      await performAIAnalysis(fileUrl, filePath, fileType, reportId)
      
      console.log('✅ Analysis completed successfully')
      // Note: The edge function saves the analysis results directly to the database
      // We just need to reload the reports to see the updated status

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
    } finally {
      setAnalyzingReportId(null)
      console.log('Reloading reports...')
      await loadReports()
      console.log('Reports reloaded')
      setSelectedReportIdForView(reportId)
      setActiveTab('analysis')
    }
  }

  const performAIAnalysis = async (fileUrl, filePath, fileType, reportId) => {
    return await analyzeHealthReport(fileUrl, filePath, fileType, reportId, aiEnabled)
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

  function renderReportCard(report, isArchived = false) {
    return (
      <>
      <div className="report-header">
        <div>
          <h3>{report.report_name}</h3>
          {report.report_type && <span className="report-type">{report.report_type}</span>}
          <div className="report-meta">
            {report.report_date && (
              <span>Report date: {new Date(report.report_date).toLocaleDateString()}</span>
            )}
            <span>Uploaded: {new Date(report.uploaded_at).toLocaleDateString()}</span>
            {report.analyzed_at && (
              <span>Analyzed: {new Date(report.analyzed_at).toLocaleDateString()}</span>
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
      {report.analysis_status === 'processing' && (
        <div className="analyzing">
          <p>🤖 AI is analyzing your report... This may take 30-60 seconds. Please wait.</p>
          {analyzingReportId === report.id && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#888' }}>
              Processing in progress...
            </div>
          )}
        </div>
      )}
      {report.analysis_status === 'completed' && (() => {
        const readings = report.health_parameter_readings || []
        const hasManualReadings = readings.length > 0
        const analysisList = report.health_analysis || []
        const hasAnalysis = analysisList.length > 0
        if (hasManualReadings && !hasAnalysis) {
          const byCategory = {}
          readings.forEach((r) => {
            if (!byCategory[r.category]) byCategory[r.category] = []
            byCategory[r.category].push(r)
          })
          return (
            <div className="analysis-results">
              <h4>Report readings (manual entry)</h4>
              {Object.entries(byCategory).map(([cat, items]) => (
                <div key={cat} className="analysis-category">
                  <h5>{cat}</h5>
                  <div className="parameters-table-container">
                    <table className="parameters-table">
                      <thead>
                        <tr>
                          <th>Parameter</th>
                          <th>Your Value</th>
                          <th>Normal Range</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((row) => (
                          <tr key={row.id} className={row.status === 'abnormal' ? 'parameter-abnormal' : 'parameter-normal'}>
                            <td className="parameter-name">{row.parameter_name}</td>
                            <td className="parameter-value">{row.parameter_value}</td>
                            <td className="parameter-range">{row.normal_range}</td>
                            <td className="parameter-status">
                              <span className={`status-indicator status-${row.status}`}>
                                {row.status === 'abnormal' ? '⚠️ Abnormal' : '✅ Normal'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )
        }
        if (hasAnalysis) {
          return (
            <div className="analysis-results">
              <h4>AI Analysis Results</h4>
              {analysisList.map((analysis) => {
                const parameters = analysis.findings?.parameters || []
                const hasStructuredData = parameters.length > 0
                return (
                  <div key={analysis.id} className="analysis-category">
                    <div className="category-header">
                      <h5>{analysis.category === 'Recommendations' ? 'What to do & remedies' : `${analysis.category} Health`}</h5>
                      {analysis.category !== 'Recommendations' && (
                        <span className={`risk-badge risk-${analysis.risk_level?.toLowerCase()}`}>
                          {analysis.risk_level || 'Low'} Risk
                        </span>
                      )}
                    </div>
                    {analysis.category === 'Recommendations' && (analysis.recommendations || (parameters[0]?.value)) ? (
                      <div className="recommendations-block">
                        <pre className="recommendations-text">{analysis.recommendations || parameters[0].value}</pre>
                      </div>
                    ) : hasStructuredData ? (
                      <div className="parameters-table-container">
                        <table className="parameters-table">
                          <thead>
                            <tr>
                              <th>Parameter</th>
                              <th>Your Value</th>
                              <th>Normal Range</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parameters.flatMap((param, index) => {
                              const remedy = getRemedyForParam(param, bloodMarkerReference, remedyLookup)
                              return [
                                <tr
                                  key={index}
                                  className={param.status === 'abnormal' ? 'parameter-abnormal' : 'parameter-normal'}
                                >
                                  <td className="parameter-name">{param.name}</td>
                                  <td className="parameter-value">{param.value}</td>
                                  <td className="parameter-range">{param.normal_range}</td>
                                  <td className="parameter-status">
                                    <span className={`status-indicator status-${param.status}`}>
                                      {param.status === 'abnormal' ? '⚠️ Abnormal' : '✅ Normal'}
                                    </span>
                                  </td>
                                </tr>,
                                remedy ? (
                                  <tr key={`rem-${index}`} className="parameter-remedy-row">
                                    <td colSpan={4} className="parameter-remedy-cell">
                                      <strong>Ayurvedic remedy (from database):</strong> {remedy.remedy_text}
                                      {remedy.lifestyle_modification ? <><br /><strong>Lifestyle:</strong> {remedy.lifestyle_modification}</> : ''}
                                      {remedy.dosage_notes ? ` — ${remedy.dosage_notes}` : ''}
                                    </td>
                                  </tr>
                                ) : null,
                              ].filter(Boolean)
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      analysis.summary && (
                        <div className="analysis-readings">
                          <strong>Readings:</strong> {analysis.summary}
                        </div>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          )
        }
        return null
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
        <h3>Generate Ayurveda analysis for existing report</h3>
        <p className="ayurveda-generate-hint">Select family member and report. With AI on: personalized recommendations. With AI off: remedies from database shown under each abnormal parameter.</p>
        <p className="ayurveda-context-hint">Recommendations consider pre-existing conditions and family history from the profile.</p>
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
                  {r.report_name || 'Unnamed'} — {r.report_date ? new Date(r.report_date).toLocaleDateString() : new Date(r.uploaded_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleGenerateAyurveda}
            disabled={!ayurvedaReportId || generatingAyurveda || reportsForAyurveda.length === 0}
            className="upload-btn ayurveda-generate-btn"
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
                    {r.report_name || 'Unnamed'} — {r.report_date ? new Date(r.report_date).toLocaleDateString() : new Date(r.uploaded_at).toLocaleDateString()}
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
                  <div className="report-analysis-header">
                    <div className="report-analysis-meta">
                      <span className="report-analysis-label">Report for</span>
                      <strong>{getMemberName(selectedReport.family_member_id)}</strong>
                    </div>
                    <div className="report-analysis-meta">
                      <span className="report-analysis-label">Report</span>
                      <strong>{selectedReport.report_name || 'Unnamed'}</strong>
                      <span className="report-analysis-date">
                        {selectedReport.report_date
                          ? new Date(selectedReport.report_date).toLocaleDateString()
                          : new Date(selectedReport.uploaded_at).toLocaleDateString()}
                      </span>
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
