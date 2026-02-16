import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { testGeminiConnection } from '../lib/aiService'
import HealthReports from './HealthReports'
import FamilyHealth from './FamilyHealth'
import { RELATIONSHIP_OPTIONS, COMMON_AILMENTS, COMMON_ALLERGIES } from '../lib/profileConstants'
import './Dashboard.css'

function Dashboard({ userId, userProfile, user }) {
  const [familyMembers, setFamilyMembers] = useState([])
  const [reportCount, setReportCount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingMember, setEditingMember] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    height: '',
    weight: '',
    sex: '',
    location: '',
    phone_number: '',
    relationship: '',
    pre_existing_conditions: [],
    family_history: '',
    medical_history: '',
    allergies: []
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('members')
  const [aiEnabled, setAiEnabled] = useState(() => localStorage.getItem('health_tracker_ai_enabled') === 'true')
  const [expandedMemberId, setExpandedMemberId] = useState(null)
  const [geminiTestStatus, setGeminiTestStatus] = useState(null) // { success, message, error }
  const [geminiTesting, setGeminiTesting] = useState(false)

  const handleAiToggle = () => {
    const next = !aiEnabled
    setAiEnabled(next)
    localStorage.setItem('health_tracker_ai_enabled', next ? 'true' : 'false')
  }

  const handleTestGemini = async () => {
    setGeminiTesting(true)
    setGeminiTestStatus(null)
    try {
      const result = await testGeminiConnection()
      setGeminiTestStatus(result)
    } catch (err) {
      setGeminiTestStatus({ success: false, error: err?.message || 'Test failed' })
    } finally {
      setGeminiTesting(false)
    }
  }

  useEffect(() => {
    loadFamilyMembers()
  }, [userId])

  useEffect(() => {
    if (!userId) return
    supabase
      .from('health_reports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .then(({ count }) => setReportCount(count ?? 0))
  }, [userId])

  const loadFamilyMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setFamilyMembers(data || [])
    } catch (err) {
      console.error('Error loading family members:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleConditionToggle = (condition) => {
    setFormData(prev => {
      const conditions = prev.pre_existing_conditions
      if (conditions.includes(condition)) {
        return {
          ...prev,
          pre_existing_conditions: conditions.filter(c => c !== condition)
        }
      } else {
        return {
          ...prev,
          pre_existing_conditions: [...conditions, condition]
        }
      }
    })
  }

  const handleAllergyToggle = (allergy) => {
    setFormData(prev => {
      const list = prev.allergies
      if (list.includes(allergy)) return { ...prev, allergies: list.filter(a => a !== allergy) }
      return { ...prev, allergies: [...list, allergy] }
    })
  }

  const resetForm = () => {
    setFormData({
      name: '',
      age: '',
      height: '',
      weight: '',
      sex: '',
      location: '',
      phone_number: '',
      relationship: '',
      pre_existing_conditions: [],
      family_history: '',
      medical_history: '',
      allergies: []
    })
    setEditingMember(null)
    setShowForm(false)
    setError('')
  }

  const handleEdit = (member) => {
    // Don't allow editing user's own profile from here
    if (!member.relationship) return
    
    setEditingMember(member)
    setFormData({
      name: member.name || '',
      age: member.age?.toString() || '',
      height: member.height?.toString() || '',
      weight: member.weight?.toString() || '',
      sex: member.sex || '',
      location: member.location || '',
      phone_number: member.phone_number || '',
      relationship: member.relationship || '',
      pre_existing_conditions: member.pre_existing_conditions || [],
      family_history: member.family_history || '',
      medical_history: member.medical_history || '',
      allergies: member.allergies || []
    })
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const memberData = {
        user_id: userId,
        name: formData.name,
        age: formData.age ? parseInt(formData.age) : null,
        height: formData.height ? parseFloat(formData.height) : null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        sex: formData.sex || null,
        location: formData.location || null,
        phone_number: formData.phone_number || null,
        relationship: formData.relationship || null,
        pre_existing_conditions: formData.pre_existing_conditions.length > 0 
          ? formData.pre_existing_conditions 
          : null,
        family_history: formData.family_history || null,
        medical_history: formData.medical_history || null,
        allergies: formData.allergies.length > 0 ? formData.allergies : null
      }

      let result
      if (editingMember) {
        result = await supabase
          .from('family_members')
          .update(memberData)
          .eq('id', editingMember.id)
      } else {
        result = await supabase
          .from('family_members')
          .insert(memberData)
      }

      if (result.error) throw result.error

      await loadFamilyMembers()
      resetForm()
    } catch (err) {
      console.error('Error saving family member:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this family member?')) return

    try {
      const { error } = await supabase
        .from('family_members')
        .delete()
        .eq('id', id)

      if (error) throw error
      await loadFamilyMembers()
    } catch (err) {
      console.error('Error deleting family member:', err)
      alert('Error deleting family member: ' + err.message)
    }
  }

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>
  }

  const allMembers = userProfile ? [userProfile, ...familyMembers] : familyMembers

  return (
    <div className="dashboard-container">
      <aside className="dashboard-sidebar">
        <div className="sidebar-section">
          <h3 className="sidebar-title">AI Engine</h3>
          <div className="sidebar-ai-row">
            <span className={`ai-badge ai-${aiEnabled ? 'on' : 'off'}`}>
              {aiEnabled ? 'AI On' : 'AI Engine Off'}
            </span>
            <label className="ai-toggle-label">
              <input
                type="checkbox"
                checked={aiEnabled}
                onChange={handleAiToggle}
                className="ai-toggle-input"
              />
              <span className="ai-toggle-slider" />
            </label>
          </div>
          <p className="sidebar-ai-hint">{aiEnabled ? 'AI reads report (exact names & values)' : 'Turn on to upload & analyze reports'}</p>
          <button
            type="button"
            onClick={handleTestGemini}
            disabled={geminiTesting}
            className="sidebar-gemini-test-btn"
            title="Verify Gemini 2.5 Flash API (paid subscription)"
          >
            {geminiTesting ? 'Testing…' : 'Test Gemini API'}
          </button>
          {geminiTestStatus && (
            <p className={`sidebar-gemini-test-msg ${geminiTestStatus.success ? 'success' : 'error'}`}>
              {geminiTestStatus.success ? geminiTestStatus.message : geminiTestStatus.error}
            </p>
          )}
        </div>
        <div className="sidebar-section">
          <h3 className="sidebar-title">Account</h3>
          <div className="sidebar-account">
            {user?.email && (
              <div className="sidebar-account-item">
                <span className="sidebar-label">Email</span>
                <span className="sidebar-value" title={user.email}>{user.email}</span>
              </div>
            )}
            {(userProfile?.phone_number || user?.phone) && (
              <div className="sidebar-account-item">
                <span className="sidebar-label">Phone</span>
                <span className="sidebar-value">{userProfile?.phone_number || user?.phone || '—'}</span>
              </div>
            )}
            <div className="sidebar-account-item">
              <span className="sidebar-label">Reports uploaded</span>
              <span className="sidebar-value">{reportCount != null ? reportCount : '—'}</span>
            </div>
            <div className="sidebar-account-item">
              <span className="sidebar-label">Family members</span>
              <span className="sidebar-value">{allMembers.length}</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="dashboard-main">
      <div className="dashboard-header">
        <div>
          <h1>Health Tracker Dashboard</h1>
          <p className="dashboard-subtitle">Complete overview of all family members</p>
        </div>
        {activeTab === 'members' && (
          <button
            onClick={() => {
              if (showForm) {
                resetForm()
              } else {
                setShowForm(true)
              }
            }}
            className="add-member-header-btn"
          >
            {showForm ? 'Cancel' : '+ Add Family Member'}
          </button>
        )}
      </div>

      <div className="dashboard-tabs">
        <button
          type="button"
          className={`dashboard-tab ${activeTab === 'members' ? 'active' : ''}`}
          onClick={() => setActiveTab('members')}
        >
          Members
        </button>
        <button
          type="button"
          className={`dashboard-tab ${activeTab === 'family-health' ? 'active' : ''}`}
          onClick={() => setActiveTab('family-health')}
        >
          Family Health
        </button>
        <button
          type="button"
          className={`dashboard-tab ${activeTab === 'report-analysis' ? 'active' : ''}`}
          onClick={() => setActiveTab('report-analysis')}
        >
          Report Analysis
        </button>
      </div>

      {activeTab === 'family-health' && (
        <FamilyHealth userId={userId} userProfile={userProfile} familyMembers={familyMembers} />
      )}

      {activeTab === 'members' && showForm && (
        <div className="member-form-section">
          <h3>{editingMember ? 'Edit Family Member' : 'Add Family Member'}</h3>
          
          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit} className="member-form">
            <div className="form-group">
              <label htmlFor="name">Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter name"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="relationship">Relationship</label>
                <select
                  id="relationship"
                  name="relationship"
                  value={formData.relationship}
                  onChange={handleChange}
                >
                  {RELATIONSHIP_OPTIONS.map((opt) => (
                    <option key={opt.value || 'select'} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="age">Age</label>
                <input
                  type="number"
                  id="age"
                  name="age"
                  value={formData.age}
                  onChange={handleChange}
                  placeholder="Age"
                  min="1"
                  max="150"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="sex">Sex</label>
                <select
                  id="sex"
                  name="sex"
                  value={formData.sex}
                  onChange={handleChange}
                >
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="phone_number">Phone Number</label>
                <input
                  type="tel"
                  id="phone_number"
                  name="phone_number"
                  value={formData.phone_number}
                  onChange={handleChange}
                  placeholder="+1234567890"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="height">Height (cm)</label>
                <input
                  type="number"
                  id="height"
                  name="height"
                  value={formData.height}
                  onChange={handleChange}
                  placeholder="Height"
                  step="0.1"
                />
              </div>

              <div className="form-group">
                <label htmlFor="weight">Weight (kg)</label>
                <input
                  type="number"
                  id="weight"
                  name="weight"
                  value={formData.weight}
                  onChange={handleChange}
                  placeholder="Weight"
                  step="0.1"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="location">Location</label>
              <input
                type="text"
                id="location"
                name="location"
                value={formData.location}
                onChange={handleChange}
                placeholder="City, Country"
              />
            </div>

            <div className="form-group">
              <label>Pre-existing Conditions</label>
              <div className="conditions-checkbox-grid">
                {COMMON_AILMENTS.map((ailment) => (
                  <label key={ailment} className="condition-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.pre_existing_conditions.includes(ailment)}
                      onChange={() => handleConditionToggle(ailment)}
                    />
                    <span>{ailment}</span>
                  </label>
                ))}
              </div>
              {formData.pre_existing_conditions.length > 0 && (
                <div className="selected-conditions">
                  <strong>Selected: </strong>
                  {formData.pre_existing_conditions.join(', ')}
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="family_history">Family History</label>
              <textarea
                id="family_history"
                name="family_history"
                value={formData.family_history}
                onChange={handleChange}
                placeholder="e.g. Conditions that run in this side of the family..."
                rows="3"
                className="medical-history-textarea"
              />
            </div>

            <div className="form-group">
              <label htmlFor="medical_history">Personal Medical History</label>
              <textarea
                id="medical_history"
                name="medical_history"
                value={formData.medical_history}
                onChange={handleChange}
                placeholder="Past surgeries, medications, or other relevant health information..."
                rows="4"
                className="medical-history-textarea"
              />
            </div>

            <div className="form-group">
              <label>Known Allergies</label>
              <div className="conditions-checkbox-grid">
                {COMMON_ALLERGIES.map((allergy) => (
                  <label key={allergy} className="condition-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.allergies.includes(allergy)}
                      onChange={() => handleAllergyToggle(allergy)}
                    />
                    <span>{allergy}</span>
                  </label>
                ))}
              </div>
              {formData.allergies.length > 0 && (
                <div className="selected-conditions">
                  <strong>Selected: </strong>
                  {formData.allergies.join(', ')}
                </div>
              )}
            </div>

            <div className="form-actions">
              <button
                type="button"
                onClick={resetForm}
                className="cancel-btn"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="submit-btn"
                disabled={saving || !formData.name}
              >
                {saving ? 'Saving...' : editingMember ? 'Update' : 'Add Member'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'members' && (
      <div className="members-grid">
        {allMembers.map((member, index) => {
          const memberKey = index === 0 ? `self-${userId ?? 'user'}` : (member.id != null ? String(member.id) : `fm-${index}`)
          const isExpanded = expandedMemberId === memberKey
          return (
          <div key={memberKey} className={`dashboard-member-card ${isExpanded ? 'member-card-expanded' : ''}`}>
            <div className="member-card-header">
              <h2>{member.name}</h2>
              <div className="member-badges">
                {index === 0 && <span className="user-badge">Myself</span>}
                {member.relationship && index > 0 && (
                  <span className="relationship-badge">{member.relationship}</span>
                )}
              </div>
              <div className="member-actions">
                <button
                  type="button"
                  onClick={() => setExpandedMemberId(isExpanded ? null : memberKey)}
                  className="details-card-btn"
                  title={isExpanded ? 'Hide details' : 'Show details'}
                >
                  {isExpanded ? '▼' : '▶'}
                </button>
                {index > 0 && (
                  <>
                    <button
                      onClick={() => handleEdit(member)}
                      className="edit-card-btn"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(member.id)}
                      className="delete-card-btn"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </>
                )}
              </div>
            </div>

            {isExpanded && (
            <div className="member-card-body">
              <div className="info-section">
                <h4>Basic Information</h4>
                <div className="info-grid">
                  {member.age && (
                    <div className="info-item">
                      <span className="info-label">Age:</span>
                      <span className="info-value">{member.age} years</span>
                    </div>
                  )}
                  {member.sex && (
                    <div className="info-item">
                      <span className="info-label">Sex:</span>
                      <span className="info-value">{member.sex}</span>
                    </div>
                  )}
                  {member.phone_number && (
                    <div className="info-item">
                      <span className="info-label">Phone:</span>
                      <span className="info-value">{member.phone_number}</span>
                    </div>
                  )}
                  {member.location && (
                    <div className="info-item">
                      <span className="info-label">Location:</span>
                      <span className="info-value">{member.location}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="info-section">
                <h4>Physical Metrics</h4>
                <div className="info-grid">
                  {member.height && (
                    <div className="info-item">
                      <span className="info-label">Height:</span>
                      <span className="info-value">{member.height} cm</span>
                    </div>
                  )}
                  {member.weight && (
                    <div className="info-item">
                      <span className="info-label">Weight:</span>
                      <span className="info-value">{member.weight} kg</span>
                    </div>
                  )}
                  {member.height && member.weight && (
                    <div className="info-item">
                      <span className="info-label">BMI:</span>
                      <span className="info-value">
                        {((member.weight / ((member.height / 100) ** 2)).toFixed(1))}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {member.pre_existing_conditions && member.pre_existing_conditions.length > 0 && (
                <div className="info-section">
                  <h4>Pre-existing Conditions</h4>
                  <div className="conditions-grid">
                    {member.pre_existing_conditions.map((condition, idx) => (
                      <span key={idx} className="condition-badge">{condition}</span>
                    ))}
                  </div>
                </div>
              )}

              {member.family_history && (
                <div className="info-section">
                  <h4>Family History</h4>
                  <div className="medical-history-box">
                    <p>{member.family_history}</p>
                  </div>
                </div>
              )}

              {member.medical_history && (
                <div className="info-section">
                  <h4>Medical History</h4>
                  <div className="medical-history-box">
                    <p>{member.medical_history}</p>
                  </div>
                </div>
              )}

              {member.allergies && member.allergies.length > 0 && (
                <div className="info-section">
                  <h4>Known Allergies</h4>
                  <div className="conditions-grid">
                    {member.allergies.map((a, idx) => (
                      <span key={idx} className="condition-badge allergy-badge">{a}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        )})}
      </div>
      )}

      {activeTab === 'members' && allMembers.length === 0 && (
        <div className="empty-dashboard">
          <p>No profiles found. Please complete your profile setup.</p>
        </div>
      )}

      {activeTab === 'members' && (
        <>
          {allMembers.length > 0 && (
            <div className="dashboard-report-cta">
              <p>You have {reportCount ?? 0} health report(s).</p>
              <button type="button" onClick={() => setActiveTab('report-analysis')} className="dashboard-report-cta-btn">
                View Report Analysis
              </button>
            </div>
          )}
        </>
      )}

      {activeTab === 'report-analysis' && (
        <HealthReports userId={userId} familyMembers={familyMembers} aiEnabled={aiEnabled} onReportsChange={() => {
          supabase.from('health_reports').select('id', { count: 'exact', head: true }).eq('user_id', userId).then(({ count }) => setReportCount(count ?? 0))
        }} />
      )}
      </div>
    </div>
  )
}

export default Dashboard
