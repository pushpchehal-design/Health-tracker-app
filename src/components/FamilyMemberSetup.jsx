import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { RELATIONSHIP_OPTIONS, COMMON_AILMENTS, COMMON_ALLERGIES } from '../lib/profileConstants'
import './FamilyMemberSetup.css'

function FamilyMemberSetup({ userId, onComplete, onSkip }) {
  const [showPrompt, setShowPrompt] = useState(true)
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
  const [addedMembers, setAddedMembers] = useState([])

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
    setError('')
  }

  const handleAddMember = async (e) => {
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

      const { data, error } = await supabase
        .from('family_members')
        .insert(memberData)
        .select()
        .single()

      if (error) throw error

      setAddedMembers([...addedMembers, data])
      resetForm()
    } catch (err) {
      console.error('Error adding family member:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDone = () => {
    onComplete()
  }

  if (showPrompt) {
    return (
      <div className="family-setup-prompt">
        <div className="prompt-card">
          <h1>Add Family Members?</h1>
          <p>Would you like to add family members to your health tracker?</p>
          <div className="prompt-actions">
            <button
              onClick={() => setShowPrompt(false)}
              className="yes-btn"
            >
              Yes, Add Family Members
            </button>
            <button
              onClick={onSkip}
              className="no-btn"
            >
              No, Skip for Now
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="family-member-setup">
      <div className="setup-container">
        <div className="setup-header">
          <h1>Add Family Members</h1>
          <p>Add family members to track their health information</p>
        </div>

        {addedMembers.length > 0 && (
          <div className="added-members">
            <h3>Added Members ({addedMembers.length})</h3>
            <div className="members-list">
              {addedMembers.map((member) => (
                <div key={member.id} className="member-badge">
                  {member.name}
                  {member.relationship && <span className="relationship-badge">{member.relationship}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="member-form-section">
          <h3>{addedMembers.length > 0 ? 'Add Another Member' : 'Add Family Member'}</h3>
          
          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleAddMember} className="member-form">
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
                type="submit"
                className="add-member-btn"
                disabled={saving || !formData.name}
              >
                {saving ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </form>
        </div>

        <div className="setup-footer">
          <button
            onClick={handleDone}
            className="done-btn"
          >
            Done - Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}

export default FamilyMemberSetup
