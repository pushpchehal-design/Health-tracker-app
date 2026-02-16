import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { COMMON_AILMENTS, COMMON_ALLERGIES } from '../lib/profileConstants'
import './ProfileSetup.css'

function ProfileSetup({ userId, onComplete }) {
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    height: '',
    weight: '',
    sex: '',
    location: '',
    phone_number: '',
    pre_existing_conditions: [],
    family_history: '',
    medical_history: '',
    allergies: []
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
      if (list.includes(allergy)) {
        return { ...prev, allergies: list.filter(a => a !== allergy) }
      }
      return { ...prev, allergies: [...list, allergy] }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const profileData = {
        user_id: userId,
        name: formData.name,
        age: formData.age ? parseInt(formData.age) : null,
        height: formData.height ? parseFloat(formData.height) : null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        sex: formData.sex || null,
        location: formData.location || null,
        phone_number: formData.phone_number || null,
        pre_existing_conditions: formData.pre_existing_conditions.length > 0 
          ? formData.pre_existing_conditions 
          : null,
        family_history: formData.family_history || null,
        medical_history: formData.medical_history || null,
        allergies: formData.allergies.length > 0 ? formData.allergies : null
      }

      const { error } = await supabase
        .from('user_profiles')
        .insert(profileData)

      if (error) throw error

      onComplete()
    } catch (err) {
      console.error('Error saving profile:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="profile-setup">
      <div className="profile-setup-card">
        <div className="profile-setup-header">
          <h1>Create Your Profile</h1>
          <button onClick={handleLogout} className="logout-link-btn">
            Logout
          </button>
        </div>
        <p className="subtitle">Let's set up your health profile</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="profile-form">
          <div className="form-group">
            <label htmlFor="name">Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter your name"
              required
            />
          </div>

          <div className="form-row">
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
                placeholder="Height in cm"
                step="0.1"
                min="0"
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
                placeholder="Weight in kg"
                step="0.1"
                min="0"
              />
            </div>
          </div>

          <div className="form-row">
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
              placeholder="e.g. Heart disease in father, diabetes in mother, cancer in grandparents..."
              rows="3"
              className="medical-history-textarea"
            />
            <small className="form-hint">Conditions that run in your family (for AI analysis)</small>
          </div>

          <div className="form-group">
            <label htmlFor="medical_history">Personal Medical History</label>
            <textarea
              id="medical_history"
              name="medical_history"
              value={formData.medical_history}
              onChange={handleChange}
              placeholder="Past surgeries, medications, hospitalizations, or other relevant health information..."
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

          <button type="submit" className="submit-btn" disabled={saving || !formData.name}>
            {saving ? 'Saving...' : 'Create Profile'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default ProfileSetup
