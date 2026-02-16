import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
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
  if (Math.abs(n) >= 100 || (Math.abs(n) < 0.01 && n !== 0)) return n.toExponential(2)
  const rounded = Math.round(n * 100) / 100
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded))
  return rounded.toFixed(2).replace(/\.?0+$/, '')
}

function randomInRange(low, high) {
  return low + Math.random() * (high - low)
}

function randomOutOfRange(low, high) {
  const range = high - low
  const margin = Math.max(range * 0.15, 0.01)
  return Math.random() < 0.5 ? low - margin * (0.5 + Math.random()) : high + margin * (0.5 + Math.random())
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
  const [generatingTestData, setGeneratingTestData] = useState(false)
  const [testDataMessage, setTestDataMessage] = useState({ type: '', text: '' })
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
        reportDateById[r.id] = d ? new Date(d).toLocaleDateString() : ''
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
        reportDateById[r.id] = d ? new Date(d).toLocaleDateString() : ''
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
      const sortedDates = [...dateSet].filter(Boolean).sort((a, b) => new Date(a) - new Date(b))

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
      const { data: markers, error: markersErr } = await supabase
        .from('blood_marker_reference')
        .select('name, unit, normal_low, normal_high, category')
      if (markersErr) throw markersErr
      if (!markers?.length) throw new Error('No reference markers found.')

      const members = [
        { familyMemberId: null },
        ...(familyMembers || []).map((m) => ({ familyMemberId: m.id }))
      ]
      const recordedAt = `${testDataDate}T12:00:00.000Z`

      for (const { familyMemberId } of members) {
        const { data: report, error: reportErr } = await supabase
          .from('health_reports')
          .insert({
            user_id: userId,
            family_member_id: familyMemberId,
            report_name: `Test data ${testDataDate}`,
            report_type: 'Test data',
            file_url: null,
            file_type: 'test',
            report_date: testDataDate,
            analysis_status: 'completed'
          })
          .select('id')
          .single()
        if (reportErr) throw reportErr

        const rows = []
        for (const m of markers) {
          const low = Number(m.normal_low)
          const high = Number(m.normal_high)
          if (Number.isNaN(low) || Number.isNaN(high) || high <= low) continue
          const outOfRange = Math.random() < 0.28
          const raw = outOfRange ? randomOutOfRange(low, high) : randomInRange(low, high)
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

      setTestDataMessage({ type: 'success', text: `Test data generated for ${testDataDate} for all ${members.length} member(s). Select a category to view.` })
      setTestDataDate('')
      if (selectedCategory) loadMemberCategoryData()
      if (selectedCategoryFamily) loadAllMembersCategoryData()
    } catch (err) {
      console.error('Generate test data error:', err)
      setTestDataMessage({ type: 'error', text: err.message || 'Failed to generate test data.' })
    } finally {
      setGeneratingTestData(false)
    }
  }

  return (
    <div className="family-health">
      <div className="family-health-test-data">
        <h3 className="family-health-test-data-title">Generate test data (testing only)</h3>
        <p className="family-health-test-data-hint">Pick a date and generate random parameter values (within and some outside normal limits) for yourself and all family members.</p>
        <div className="family-health-test-data-row">
          <input
            type="date"
            value={testDataDate}
            onChange={(e) => setTestDataDate(e.target.value)}
            className="family-health-test-data-date"
            max="2099-12-31"
          />
          <button
            type="button"
            onClick={generateTestData}
            disabled={generatingTestData || !testDataDate}
            className="family-health-test-data-btn"
          >
            {generatingTestData ? 'Generating…' : 'Generate for all members'}
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
          <div className="form-group">
            <label>From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="family-health-date-input"
            />
          </div>
          <div className="form-group">
            <label>To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="family-health-date-input"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="family-health-error">
          <p>{error}</p>
        </div>
      )}

      <section className="family-health-section">
        <h2 className="family-health-section-title">1) One member & parameter analysis</h2>
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
        {!loadingOne && outputType === 'graph' && parameterCharts.length > 0 && (() => {
          const colors = ['#646cff']
          return (
            <div className="family-health-charts family-health-charts-three">
              <p className="family-health-intro">X-axis: report date. Shaded band: acceptable range. Line: values over time.</p>
              {parameterCharts.map((chart) => (
                <div key={chart.parameterName} className="family-health-chart-card">
                  <h3>{chart.parameterName} {chart.unit && `(${chart.unit})`}</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chart.data} margin={{ top: 12, right: 12, left: 12, bottom: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="date" tick={{ fill: '#ccc', fontSize: 11 }} stroke="#666" label={{ value: 'Report date', position: 'insideBottom', offset: -8, fill: '#888', fontSize: 11 }} />
                      <YAxis domain={chart.yDomain} tick={{ fill: '#ccc', fontSize: 11 }} tickFormatter={formatTick} stroke="#666" label={{ value: chart.unit ? `Value (${chart.unit})` : 'Value', angle: -90, position: 'insideLeft', fill: '#888', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }} labelStyle={{ color: '#fff' }} formatter={(value) => [value, 'Value']} labelFormatter={(label) => `Date: ${label}`} />
                      {chart.normalLow != null && chart.normalHigh != null && <ReferenceArea y1={chart.normalLow} y2={chart.normalHigh} fill="#22c55a" fillOpacity={0.2} strokeOpacity={0.3} />}
                      <Line type="monotone" dataKey="value" name="Value" stroke="#646cff" strokeWidth={2} dot={{ r: 4, fill: '#646cff' }} connectNulls />
                      <Legend />
                    </LineChart>
                  </ResponsiveContainer>
                  {chart.normalLow != null && chart.normalHigh != null && <p className="reference-range-note">Acceptable range: {chart.normalLow} – {chart.normalHigh} {chart.unit}</p>}
                </div>
              ))}
            </div>
          )
        })()}
        {!loadingOne && outputType === 'table' && parameterCharts.length > 0 && (() => {
          const dateSet = new Set()
          parameterCharts.forEach((c) => c.data.forEach((d) => dateSet.add(d.date)))
          const sortedDates = [...dateSet].filter(Boolean).sort((a, b) => new Date(a) - new Date(b))
          return (
            <>
              <p className="family-health-intro">Change is from earliest to latest report (↑ up, ↓ down).</p>
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
            </>
          )
        })()}
      </section>

      <section className="family-health-section">
        <h2 className="family-health-section-title">2) Complete family analysis</h2>
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
        {!loadingFamily && outputTypeFamily === 'graph' && allMembersCharts.length > 0 && (() => {
          const colors = ['#646cff', '#22c55a', '#eab308', '#f97316', '#ec4899', '#8b5cf6', '#06b6d4']
          return (
            <div className="family-health-charts family-health-charts-single">
              <p className="family-health-intro">X-axis: report date. One line per family member (first names).</p>
              {allMembersCharts.map((chart) => (
                <div key={chart.parameterName} className="family-health-chart-card">
                  <h3>{chart.parameterName} {chart.unit && `(${chart.unit})`}</h3>
                  <ResponsiveContainer width="100%" height={340}>
                    <LineChart data={chart.data} margin={{ top: 12, right: 12, left: 12, bottom: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="date" tick={{ fill: '#ccc', fontSize: 11 }} stroke="#666" label={{ value: 'Report date', position: 'insideBottom', offset: -8, fill: '#888', fontSize: 11 }} />
                      <YAxis domain={chart.yDomain} tick={{ fill: '#ccc', fontSize: 11 }} tickFormatter={formatTick} stroke="#666" label={{ value: chart.unit ? `Value (${chart.unit})` : 'Value', angle: -90, position: 'insideLeft', fill: '#888', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }} labelStyle={{ color: '#fff' }} labelFormatter={(label) => `Date: ${label}`} />
                      {chart.normalLow != null && chart.normalHigh != null && <ReferenceArea y1={chart.normalLow} y2={chart.normalHigh} fill="#22c55a" fillOpacity={0.2} strokeOpacity={0.3} />}
                      {chart.memberKeys.map((mk, i) => (
                        <Line key={mk} type="monotone" dataKey={mk} name={memberKeyToFirstName[mk] || memberKeyToName[mk] || mk} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 4, fill: colors[i % colors.length] }} connectNulls />
                      ))}
                      <Legend />
                    </LineChart>
                  </ResponsiveContainer>
                  {chart.normalLow != null && chart.normalHigh != null && <p className="reference-range-note">Acceptable range: {chart.normalLow} – {chart.normalHigh} {chart.unit}</p>}
                </div>
              ))}
            </div>
          )
        })()}
        {!loadingFamily && outputTypeFamily === 'table' && allMembersCharts.length > 0 && (() => {
          const memberKeys = allMembersCharts[0]?.memberKeys
          return (
            <>
              <p className="family-health-intro">Latest value per member.</p>
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
            </>
          )
        })()}
      </section>
    </div>
  )
}

export default FamilyHealth
