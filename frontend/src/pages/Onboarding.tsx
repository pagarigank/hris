import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useParams } from 'react-router-dom'
import api from '../lib/api'
import StatusBadge from '../components/ui/StatusBadge'
import PageHeader from '../components/ui/PageHeader'

interface OnboardingTemplate {
  Id: string
  Name: string
  Description: string
  ItemCount: number
  IsActive: boolean
}

interface EmployeeOnboarding {
  Id: string
  EmployeeId: string
  EmployeeNo: string
  FirstName: string
  LastName: string
  Email: string
  DepartmentName: string
  TemplateName: string
  Status: string
  TotalItems: number
  CompletedItems: number
  StartedAtUtc: string
  CompletedAtUtc: string
}

interface OnboardingItem {
  Id: string
  ItemName: string
  Description: string
  Category: string
  SortOrder: number
  IsRequired: boolean
  IsCompleted: boolean
  CompletedAtUtc: string
  Notes: string
}

interface Employee {
  Id: string
  EmployeeNo: string
  FirstName: string
  LastName: string
  DepartmentName: string
}

const CATEGORIES = ['General', 'Documents', 'IT', 'HR', 'Finance', 'Clearance']

// ============================================================
// ONBOARDING TEMPLATES
// ============================================================
function OnboardingTemplates() {
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', items: [] as any[] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [newItem, setNewItem] = useState({ itemName: '', description: '', category: 'General', isRequired: true })

  useEffect(() => { fetchTemplates() }, [])

  const fetchTemplates = async () => {
    try {
      const { data } = await api.get('/onboarding/templates')
      setTemplates(data.data?.templates || [])
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddItem = () => {
    if (!newItem.itemName.trim()) return
    setForm(p => ({ ...p, items: [...p.items, { ...newItem, sortOrder: p.items.length }] }))
    setNewItem({ itemName: '', description: '', category: 'General', isRequired: true })
  }

  const handleRemoveItem = (index: number) => {
    setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== index) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post('/onboarding/templates', form)
      setShowForm(false)
      setForm({ name: '', description: '', items: [] })
      fetchTemplates()
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create template')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding Templates"
        subtitle="Manage onboarding checklists for new hires"
        action={
          <button onClick={() => setShowForm(true)} className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition inline-flex items-center">
            <span className="mr-2">+</span> Add Template
          </button>
        }
      />

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">New Onboarding Template</h2>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm flex items-center gap-2">
              <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template Name *</label>
                <input type="text" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Checklist Items</label>
              <div className="space-y-2">
                {form.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.isRequired ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                      {item.category}
                    </span>
                    <span className="flex-1 text-sm">{item.itemName}</span>
                    <button type="button" onClick={() => handleRemoveItem(idx)} className="text-red-500 hover:text-red-700 text-sm">Remove</button>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input type="text" placeholder="Item name" value={newItem.itemName} onChange={e => setNewItem(p => ({ ...p, itemName: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm" />
                <input type="text" placeholder="Description" value={newItem.description} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm" />
                <select value={newItem.category} onChange={e => setNewItem(p => ({ ...p, category: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={newItem.isRequired} onChange={e => setNewItem(p => ({ ...p, isRequired: e.target.checked }))} className="rounded" />
                    Required
                  </label>
                  <button type="button" onClick={handleAddItem} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">Add</button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition disabled:opacity-50">
                {saving ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.map(template => (
                <tr key={template.Id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{template.Name}</td>
                  <td className="px-6 py-4 text-gray-600 hidden sm:table-cell">{template.Description}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600">{template.ItemCount} items</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${template.IsActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {template.IsActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No templates found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// ONBOARDING LIST
// ============================================================
function OnboardingList() {
  const [onboardings, setOnboardings] = useState<EmployeeOnboarding[]>([])
  const [loading, setLoading] = useState(true)
  const [showStartForm, setShowStartForm] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => { fetchOnboardings() }, [filterStatus])

  const fetchOnboardings = async () => {
    try {
      const params = new URLSearchParams()
      if (filterStatus) params.append('status', filterStatus)
      const { data } = await api.get(`/onboarding?${params.toString()}`)
      setOnboardings(data.data?.onboardings || [])
    } catch (err) {
      console.error('Failed to fetch onboardings:', err)
    } finally {
      setLoading(false)
    }
  }

  const openStartForm = async () => {
    setError('')
    try {
      const [empRes, tempRes] = await Promise.all([
        api.get('/employees?pageSize=200'),
        api.get('/onboarding/templates')
      ])
      setEmployees(empRes.data.data?.employees || [])
      setTemplates(tempRes.data.data?.templates || [])
      setShowStartForm(true)
    } catch (err) {
      console.error('Failed to load form data:', err)
    }
  }

  const handleStartOnboarding = async () => {
    if (!selectedEmployee || !selectedTemplate) return
    setError('')
    try {
      await api.post('/onboarding', { employeeId: selectedEmployee, templateId: selectedTemplate })
      setShowStartForm(false)
      setSelectedEmployee('')
      setSelectedTemplate('')
      fetchOnboardings()
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to start onboarding')
    }
  }

  const getProgress = (item: EmployeeOnboarding) => {
    if (!item.TotalItems) return 0
    return Math.round((item.CompletedItems / item.TotalItems) * 100)
  }

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Onboarding"
        subtitle="Track new hire onboarding progress"
        action={
          <button onClick={openStartForm} className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition inline-flex items-center">
            <span className="mr-2">+</span> Start Onboarding
          </button>
        }
        secondaryAction={
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
            <option value="">All Status</option>
            <option value="InProgress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>
        }
      />

      {showStartForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Start New Onboarding</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
              <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="">Select Employee</option>
                {employees.map(e => <option key={e.Id} value={e.Id}>{e.EmployeeNo} - {e.FirstName} {e.LastName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Template *</label>
              <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="">Select Template</option>
                {templates.map(t => <option key={t.Id} value={t.Id}>{t.Name}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-3">
              <button onClick={() => setShowStartForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition">Cancel</button>
              <button onClick={handleStartOnboarding} disabled={!selectedEmployee || !selectedTemplate}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition disabled:opacity-50">
                Start Onboarding
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Department</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {onboardings.map(item => (
                <tr key={item.Id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{item.FirstName} {item.LastName}</div>
                    <div className="text-sm text-gray-500">{item.EmployeeNo}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600 hidden sm:table-cell">{item.DepartmentName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600">{item.TemplateName}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div className="bg-primary-600 h-2 rounded-full" style={{ width: `${getProgress(item)}%` }}></div>
                      </div>
                      <span className="text-sm text-gray-600">{item.CompletedItems}/{item.TotalItems}</span>
                    </div>
                   </td>
                   <td className="px-6 py-4 whitespace-nowrap">
                     <StatusBadge status={item.Status} />
                   </td>
                   <td className="px-6 py-4 whitespace-nowrap text-right">
                     <button onClick={() => navigate(`/onboarding/${item.Id}`)} className="text-primary-600 hover:text-primary-900 font-medium">View</button>
                  </td>
                </tr>
              ))}
              {onboardings.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No onboarding records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// ONBOARDING DETAIL
// ============================================================
function OnboardingDetail() {
  const { id } = useParams<{ id: string }>()
  const [onboarding, setOnboarding] = useState<EmployeeOnboarding | null>(null)
  const [items, setItems] = useState<OnboardingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => { fetchOnboarding() }, [id])

  const fetchOnboarding = async () => {
    try {
      const { data } = await api.get(`/onboarding/${id}`)
      setOnboarding(data.data?.onboarding)
      setItems(data.data?.items || [])
    } catch (err) {
      console.error('Failed to fetch onboarding:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleItem = async (itemId: string, currentStatus: boolean) => {
    setCompleting(itemId)
    setError('')
    try {
      await api.put(`/onboarding/${id}/items/${itemId}`, { isCompleted: !currentStatus })
      setItems(prev => prev.map(item =>
        item.Id === itemId
          ? { ...item, IsCompleted: !currentStatus, CompletedAtUtc: !currentStatus ? new Date().toISOString() : '' }
          : item
      ))
      // Refresh to get updated status
      fetchOnboarding()
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to update item')
    } finally {
      setCompleting(null)
    }
  }

  const getProgress = () => {
    if (!items.length) return 0
    return Math.round((items.filter(i => i.IsCompleted).length / items.length) * 100)
  }

  const groupedItems = items.reduce((acc, item) => {
    const cat = item.Category || 'General'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {} as Record<string, OnboardingItem[]>)

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  if (!onboarding) {
    return <div className="text-center p-8 text-gray-500">Onboarding not found</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/onboarding')} className="text-gray-500 hover:text-gray-700">← Back</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Onboarding Progress</h1>
          <p className="text-gray-500">{onboarding.FirstName} {onboarding.LastName} ({onboarding.EmployeeNo})</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-gray-500">Template: <span className="font-medium text-gray-700">{onboarding.TemplateName}</span></p>
            <p className="text-sm text-gray-500">Started: <span className="font-medium text-gray-700">{new Date(onboarding.StartedAtUtc).toLocaleDateString()}</span></p>
          </div>
           <StatusBadge status={onboarding.Status} />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-gray-200 rounded-full h-3">
            <div className="bg-primary-600 h-3 rounded-full transition-all" style={{ width: `${getProgress()}%` }}></div>
          </div>
          <span className="text-lg font-semibold text-gray-700">{getProgress()}%</span>
        </div>
        <p className="text-sm text-gray-500 mt-2">{items.filter(i => i.IsCompleted).length} of {items.length} items completed</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {Object.entries(groupedItems).map(([category, catItems]) => (
        <div key={category} className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800">{category}</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {catItems.map(item => (
              <div key={item.Id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={item.IsCompleted}
                    onChange={() => toggleItem(item.Id, item.IsCompleted)}
                    disabled={completing === item.Id}
                    className="h-4 w-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                  <div>
                    <p className={`font-medium ${item.IsCompleted ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{item.ItemName}</p>
                    {item.Description && <p className="text-sm text-gray-500">{item.Description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.IsRequired && <span className="text-xs text-blue-600 font-medium">Required</span>}
                  {item.IsCompleted && item.CompletedAtUtc && (
                    <span className="text-xs text-green-600">Completed {new Date(item.CompletedAtUtc).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// OFFBOARDING TEMPLATES
// ============================================================
function OffboardingTemplates() {
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', items: [] as any[] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [newItem, setNewItem] = useState({ itemName: '', description: '', category: 'General', isRequired: true })

  useEffect(() => { fetchTemplates() }, [])

  const fetchTemplates = async () => {
    try {
      const { data } = await api.get('/onboarding/offboarding/templates')
      setTemplates(data.data?.templates || [])
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddItem = () => {
    if (!newItem.itemName.trim()) return
    setForm(p => ({ ...p, items: [...p.items, { ...newItem, sortOrder: p.items.length }] }))
    setNewItem({ itemName: '', description: '', category: 'General', isRequired: true })
  }

  const handleRemoveItem = (index: number) => {
    setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== index) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post('/onboarding/offboarding/templates', form)
      setShowForm(false)
      setForm({ name: '', description: '', items: [] })
      fetchTemplates()
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create template')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offboarding Templates"
        subtitle="Manage offboarding checklists for departing employees"
        action={
          <button onClick={() => setShowForm(true)} className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition inline-flex items-center">
            <span className="mr-2">+</span> Add Template
          </button>
        }
      />

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">New Offboarding Template</h2>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm flex items-center gap-2">
              <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template Name *</label>
                <input type="text" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Checklist Items</label>
              <div className="space-y-2">
                {form.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.isRequired ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                      {item.category}
                    </span>
                    <span className="flex-1 text-sm">{item.itemName}</span>
                    <button type="button" onClick={() => handleRemoveItem(idx)} className="text-red-500 hover:text-red-700 text-sm">Remove</button>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input type="text" placeholder="Item name" value={newItem.itemName} onChange={e => setNewItem(p => ({ ...p, itemName: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm" />
                <input type="text" placeholder="Description" value={newItem.description} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm" />
                <select value={newItem.category} onChange={e => setNewItem(p => ({ ...p, category: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={newItem.isRequired} onChange={e => setNewItem(p => ({ ...p, isRequired: e.target.checked }))} className="rounded" />
                    Required
                  </label>
                  <button type="button" onClick={handleAddItem} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">Add</button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition disabled:opacity-50">
                {saving ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.map(template => (
                <tr key={template.Id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{template.Name}</td>
                  <td className="px-6 py-4 text-gray-600 hidden sm:table-cell">{template.Description}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600">{template.ItemCount} items</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${template.IsActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {template.IsActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No templates found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// OFFBOARDING LIST
// ============================================================
interface EmployeeOffboarding {
  Id: string
  EmployeeId: string
  EmployeeNo: string
  FirstName: string
  LastName: string
  Email: string
  DepartmentName: string
  TemplateName: string
  Status: string
  SeparationType: string
  LastDayOfWork: string
  TotalItems: number
  CompletedItems: number
  StartedAtUtc: string
  CompletedAtUtc: string
}

function OffboardingList() {
  const [offboardings, setOffboardings] = useState<EmployeeOffboarding[]>([])
  const [loading, setLoading] = useState(true)
  const [showStartForm, setShowStartForm] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [separationType, setSeparationType] = useState('Resignation')
  const [lastDayOfWork, setLastDayOfWork] = useState('')
  const [reason, setReason] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => { fetchOffboardings() }, [filterStatus])

  const fetchOffboardings = async () => {
    try {
      const params = new URLSearchParams()
      if (filterStatus) params.append('status', filterStatus)
      const { data } = await api.get(`/onboarding/offboarding?${params.toString()}`)
      setOffboardings(data.data?.offboardings || [])
    } catch (err) {
      console.error('Failed to fetch offboardings:', err)
    } finally {
      setLoading(false)
    }
  }

  const openStartForm = async () => {
    setError('')
    try {
      const [empRes, tempRes] = await Promise.all([
        api.get('/employees?pageSize=200'),
        api.get('/onboarding/offboarding/templates')
      ])
      setEmployees(empRes.data.data?.employees || [])
      setTemplates(tempRes.data.data?.templates || [])
      setShowStartForm(true)
    } catch (err) {
      console.error('Failed to load form data:', err)
    }
  }

  const handleStartOffboarding = async () => {
    if (!selectedEmployee || !selectedTemplate) return
    setError('')
    try {
      await api.post('/onboarding/offboarding', {
        employeeId: selectedEmployee,
        templateId: selectedTemplate,
        separationType,
        lastDayOfWork: lastDayOfWork || undefined,
        reason: reason || undefined
      })
      setShowStartForm(false)
      setSelectedEmployee('')
      setSelectedTemplate('')
      setSeparationType('Resignation')
      setLastDayOfWork('')
      setReason('')
      fetchOffboardings()
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to start offboarding')
    }
  }

  const getProgress = (item: EmployeeOffboarding) => {
    if (!item.TotalItems) return 0
    return Math.round((item.CompletedItems / item.TotalItems) * 100)
  }

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Offboarding"
        subtitle="Track offboarding/separation progress"
        action={
          <button onClick={openStartForm} className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition inline-flex items-center">
            <span className="mr-2">+</span> Start Offboarding
          </button>
        }
        secondaryAction={
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
            <option value="">All Status</option>
            <option value="InProgress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>
        }
      />

      {showStartForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Start New Offboarding</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
              <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="">Select Employee</option>
                {employees.map(e => <option key={e.Id} value={e.Id}>{e.EmployeeNo} - {e.FirstName} {e.LastName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Template *</label>
              <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="">Select Template</option>
                {templates.map(t => <option key={t.Id} value={t.Id}>{t.Name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Separation Type</label>
              <select value={separationType} onChange={e => setSeparationType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="Resignation">Resignation</option>
                <option value="End of Contract">End of Contract</option>
                <option value="Termination">Termination</option>
                <option value="Retirement">Retirement</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Day of Work</label>
              <input type="date" value={lastDayOfWork} onChange={e => setLastDayOfWork(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional reason for separation"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
            <button onClick={() => setShowStartForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition">Cancel</button>
            <button onClick={handleStartOffboarding} disabled={!selectedEmployee || !selectedTemplate}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition disabled:opacity-50">
              Start Offboarding
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Department</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {offboardings.map(item => (
                <tr key={item.Id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{item.FirstName} {item.LastName}</div>
                    <div className="text-sm text-gray-500">{item.EmployeeNo}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600 hidden sm:table-cell">{item.DepartmentName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600">{item.SeparationType || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div className="bg-primary-600 h-2 rounded-full" style={{ width: `${getProgress(item)}%` }}></div>
                      </div>
                      <span className="text-sm text-gray-600">{item.CompletedItems}/{item.TotalItems}</span>
                    </div>
                   </td>
                   <td className="px-6 py-4 whitespace-nowrap">
                     <StatusBadge status={item.Status} />
                   </td>
                   <td className="px-6 py-4 whitespace-nowrap text-right">
                     <button onClick={() => navigate(`/onboarding/offboarding/${item.Id}`)} className="text-primary-600 hover:text-primary-900 font-medium">View</button>
                  </td>
                </tr>
              ))}
              {offboardings.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No offboarding records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// OFFBOARDING DETAIL
// ============================================================
interface OffboardingDetailData {
  Id: string
  EmployeeNo: string
  FirstName: string
  LastName: string
  Email: string
  DepartmentName: string
  TemplateName: string
  Status: string
  SeparationType: string
  LastDayOfWork: string
  Reason: string
  StartedAtUtc: string
  CompletedAtUtc: string
}

function OffboardingDetail() {
  const { id } = useParams<{ id: string }>()
  const [offboarding, setOffboarding] = useState<OffboardingDetailData | null>(null)
  const [items, setItems] = useState<OnboardingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => { fetchOffboarding() }, [id])

  const fetchOffboarding = async () => {
    try {
      const { data } = await api.get(`/onboarding/offboarding/${id}`)
      setOffboarding(data.data?.offboarding)
      setItems(data.data?.items || [])
    } catch (err) {
      console.error('Failed to fetch offboarding:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleItem = async (itemId: string, currentStatus: boolean) => {
    setCompleting(itemId)
    setError('')
    try {
      await api.put(`/onboarding/offboarding/${id}/items/${itemId}`, { isCompleted: !currentStatus })
      setItems(prev => prev.map(item =>
        item.Id === itemId
          ? { ...item, IsCompleted: !currentStatus, CompletedAtUtc: !currentStatus ? new Date().toISOString() : '' }
          : item
      ))
      fetchOffboarding()
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to update item')
    } finally {
      setCompleting(null)
    }
  }

  const getProgress = () => {
    if (!items.length) return 0
    return Math.round((items.filter(i => i.IsCompleted).length / items.length) * 100)
  }

  const groupedItems = items.reduce((acc, item) => {
    const cat = item.Category || 'General'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {} as Record<string, OnboardingItem[]>)

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  if (!offboarding) {
    return <div className="text-center p-8 text-gray-500">Offboarding not found</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/onboarding/offboarding')} className="text-gray-500 hover:text-gray-700">← Back</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Offboarding Progress</h1>
          <p className="text-gray-500">{offboarding.FirstName} {offboarding.LastName} ({offboarding.EmployeeNo})</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="space-y-1">
            <p className="text-sm text-gray-500">Template: <span className="font-medium text-gray-700">{offboarding.TemplateName}</span></p>
            <p className="text-sm text-gray-500">Separation Type: <span className="font-medium text-gray-700">{offboarding.SeparationType || 'N/A'}</span></p>
            {offboarding.LastDayOfWork && (
              <p className="text-sm text-gray-500">Last Day: <span className="font-medium text-gray-700">{new Date(offboarding.LastDayOfWork).toLocaleDateString()}</span></p>
            )}
            {offboarding.Reason && (
              <p className="text-sm text-gray-500">Reason: <span className="font-medium text-gray-700">{offboarding.Reason}</span></p>
            )}
          </div>
          <StatusBadge status={offboarding.Status} />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-gray-200 rounded-full h-3">
            <div className="bg-primary-600 h-3 rounded-full transition-all" style={{ width: `${getProgress()}%` }}></div>
          </div>
          <span className="text-lg font-semibold text-gray-700">{getProgress()}%</span>
        </div>
        <p className="text-sm text-gray-500 mt-2">{items.filter(i => i.IsCompleted).length} of {items.length} items completed</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {Object.entries(groupedItems).map(([category, catItems]) => (
        <div key={category} className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800">{category}</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {catItems.map(item => (
              <div key={item.Id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={item.IsCompleted}
                    onChange={() => toggleItem(item.Id, item.IsCompleted)}
                    disabled={completing === item.Id}
                    className="h-4 w-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                  <div>
                    <p className={`font-medium ${item.IsCompleted ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{item.ItemName}</p>
                    {item.Description && <p className="text-sm text-gray-500">{item.Description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.IsRequired && <span className="text-xs text-blue-600 font-medium">Required</span>}
                  {item.IsCompleted && item.CompletedAtUtc && (
                    <span className="text-xs text-green-600">Completed {new Date(item.CompletedAtUtc).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// MAIN ONBOARDING COMPONENT
// ============================================================
export default function Onboarding() {
  return (
    <Routes>
      <Route path="/" element={<OnboardingList />} />
      <Route path="/templates" element={<OnboardingTemplates />} />
      <Route path="/:id" element={<OnboardingDetail />} />
      <Route path="/offboarding" element={<OffboardingList />} />
      <Route path="/offboarding/templates" element={<OffboardingTemplates />} />
      <Route path="/offboarding/:id" element={<OffboardingDetail />} />
    </Routes>
  )
}
