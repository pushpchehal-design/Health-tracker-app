import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { RELATIONSHIP_OPTIONS, COMMON_AILMENTS, COMMON_ALLERGIES } from '../lib/profileConstants'
import './FamilyMembers.css'

function FamilyMembers({ userId }) {
  const [members, setMembers] = useState([])
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

  useEffect(() => {
    loadFamilyMembers()
  }, [userId])

  const loadFamilyMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setMembers(data || [])
    } catch (err) {
      console.error('Error loading family members:', err)
      setError('Failed to load family members')
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
    return <div className="loading">Loading family members...</div>
  }

  return (
    <div className="family-members">
      <div className="family-members-header">
        <h2>Family Members</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="add-member-btn"
        >
          {showForm ? 'Cancel' : '+ Add Family Member'}
        </button>
      </div>

      {showForm && (
        <div className="member-form-card">
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

      <div className="members-list">
        {members.length === 0 ? (
          <div className="empty-state">
            <p>No family members added yet.</p>
            <p className="hint">Click "Add Family Member" to get started.</p>
          </div>
        ) : (
          members.map((member) => (
            <div key={member.id} className="member-card">
              <div className="member-info">
                <h3>{member.name}</h3>
                {member.relationship && (
                  <span className="relationship">{member.relationship}</span>
                )}
                <div className="member-details">
                  {member.age && <span>Age: {member.age}</span>}
                  {member.sex && <span>Sex: {member.sex}</span>}
                  {member.phone_number && <span>Phone: {member.phone_number}</span>}
                  {member.height && <span>Height: {member.height} cm</span>}
                  {member.weight && <span>Weight: {member.weight} kg</span>}
                  {member.location && <span>Location: {member.location}</span>}
                </div>
                {member.pre_existing_conditions && member.pre_existing_conditions.length > 0 && (
                  <div className="conditions">
                    <strong>Conditions:</strong>
                    <div className="conditions-tags">
                      {member.pre_existing_conditions.map((condition, idx) => (
                        <span key={idx} className="condition-tag-small">{condition}</span>
                      ))}
                    </div>
                  </div>
                )}
                {member.family_history && (
                  <div className="medical-history">
                    <strong>Family History:</strong>
                    <p>{member.family_history}</p>
                  </div>
                )}
                {member.medical_history && (
                  <div className="medical-history">
                    <strong>Medical History:</strong>
                    <p>{member.medical_history}</p>
                  </div>
                )}
                {member.allergies && member.allergies.length > 0 && (
                  <div className="conditions">
                    <strong>Allergies:</strong>
                    <div className="conditions-tags">
                      {member.allergies.map((a, idx) => (
                        <span key={idx} className="condition-tag-small">{a}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="member-actions">
                <button
                  onClick={() => handleEdit(member)}
                  className="edit-btn"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(member.id)}
                  className="delete-btn"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default FamilyMembers
