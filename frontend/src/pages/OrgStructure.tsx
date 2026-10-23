import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import api from '../lib/api'
import ConfirmDialog from '../components/ui/ConfirmDialog'

interface Department {
  Id: string
  Name: string
  Code: string
  ParentDepartmentId: string | null
}

interface Position {
  Id: string
  Title: string
  DepartmentId: string
  DepartmentName: string
  JobGrade: string
  SalaryGradeMin: number
  SalaryGradeMax: number
}

function DepartmentList() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [form, setForm] = useState({ name: '', code: '', parentDepartmentId: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null)

  useEffect(() => { fetchDepartments() }, [])

  const fetchDepartments = async () => {
    try {
      const { data } = await api.get('/employees/departments')
      setDepartments(data.data?.departments || [])
    } catch (err) {
      console.error('Failed to fetch departments:', err)
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', code: '', parentDepartmentId: '' })
    setShowForm(true)
    setError('')
  }

  const openEdit = (dept: Department) => {
    setEditing(dept)
    setForm({ name: dept.Name, code: dept.Code, parentDepartmentId: dept.ParentDepartmentId || '' })
    setShowForm(true)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        code: form.code,
        parentDepartmentId: form.parentDepartmentId || null,
      }
      if (editing) {
        await api.put(`/employees/departments/${editing.Id}`, payload)
      } else {
        await api.post('/employees/departments', payload)
      }
      setShowForm(false)
      fetchDepartments()
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to save department')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/employees/departments/${deleteTarget.Id}`)
      setDeleteTarget(null)
      fetchDepartments()
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to delete department')
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Departments</h1>
          <p className="text-gray-500">Manage organizational departments</p>
        </div>
        <button onClick={openCreate}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition inline-flex items-center">
          <span className="mr-2">+</span> Add Department
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">{editing ? 'Edit Department' : 'New Department'}</h2>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input type="text" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input type="text" required value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Department</label>
              <select value={form.parentDepartmentId} onChange={e => setForm(p => ({ ...p, parentDepartmentId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="">None (Top Level)</option>
                {departments.filter(d => d.Id !== editing?.Id).map(d => (
                  <option key={d.Id} value={d.Id}>{d.Name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Parent</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {departments.map(dept => {
                  const parent = departments.find(d => d.Id === dept.ParentDepartmentId)
                  return (
                    <tr key={dept.Id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{dept.Name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">{dept.Code}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600 hidden sm:table-cell">{parent?.Name || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-3">
                        <button onClick={() => openEdit(dept)} className="text-primary-600 hover:text-primary-900 font-medium">Edit</button>
                        <button onClick={() => setDeleteTarget(dept)} className="text-red-600 hover:text-red-900 font-medium">Delete</button>
                      </td>
                    </tr>
                  )
                })}
                {departments.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No departments found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Department"
        message={`Are you sure you want to delete "${deleteTarget?.Name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function PositionList() {
  const [positions, setPositions] = useState<Position[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Position | null>(null)
  const [form, setForm] = useState({
    title: '', departmentId: '', jobGrade: '', salaryGradeMin: '', salaryGradeMax: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Position | null>(null)

  useEffect(() => {
    api.get('/employees/positions')
      .then(({ data }) => setPositions(data.data?.positions || []))
      .catch(err => console.error('Failed to fetch positions:', err))
    api.get('/employees/departments')
      .then(({ data }) => setDepartments(data.data?.departments || []))
      .catch(err => console.error('Failed to fetch departments:', err))
      .finally(() => setLoading(false))
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm({ title: '', departmentId: '', jobGrade: '', salaryGradeMin: '', salaryGradeMax: '' })
    setShowForm(true)
    setError('')
  }

  const openEdit = (pos: Position) => {
    setEditing(pos)
    setForm({
      title: pos.Title,
      departmentId: pos.DepartmentId,
      jobGrade: pos.JobGrade || '',
      salaryGradeMin: pos.SalaryGradeMin?.toString() || '',
      salaryGradeMax: pos.SalaryGradeMax?.toString() || '',
    })
    setShowForm(true)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        departmentId: form.departmentId,
        jobGrade: form.jobGrade || null,
        salaryGradeMin: form.salaryGradeMin ? Number(form.salaryGradeMin) : null,
        salaryGradeMax: form.salaryGradeMax ? Number(form.salaryGradeMax) : null,
      }
      if (editing) {
        await api.put(`/employees/positions/${editing.Id}`, payload)
      } else {
        await api.post('/employees/positions', payload)
      }
      setShowForm(false)
      // Refresh positions
      const { data } = await api.get('/employees/positions')
      setPositions(data.data?.positions || [])
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to save position')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/employees/positions/${deleteTarget.Id}`)
      setPositions(prev => prev.filter(p => p.Id !== deleteTarget.Id))
      setDeleteTarget(null)
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to delete position')
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Positions</h1>
          <p className="text-gray-500">Manage job positions and salary grades</p>
        </div>
        <button onClick={openCreate}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition inline-flex items-center">
          <span className="mr-2">+</span> Add Position
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">{editing ? 'Edit Position' : 'New Position'}</h2>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input type="text" required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
              <select required value={form.departmentId} onChange={e => setForm(p => ({ ...p, departmentId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="">Select Department</option>
                {departments.map(d => <option key={d.Id} value={d.Id}>{d.Name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Grade</label>
              <input type="text" value={form.jobGrade} onChange={e => setForm(p => ({ ...p, jobGrade: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Salary (PHP)</label>
              <input type="number" step="0.01" min="0" value={form.salaryGradeMin} onChange={e => setForm(p => ({ ...p, salaryGradeMin: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Salary (PHP)</label>
              <input type="number" step="0.01" min="0" value={form.salaryGradeMax} onChange={e => setForm(p => ({ ...p, salaryGradeMax: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div className="flex items-end gap-3">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Department</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Job Grade</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Salary Range</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {positions.map(pos => (
                  <tr key={pos.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{pos.Title}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600 hidden sm:table-cell">{pos.DepartmentName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600 hidden md:table-cell">{pos.JobGrade || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600 hidden md:table-cell">
                      {pos.SalaryGradeMin && pos.SalaryGradeMax
                        ? `\u20B1${Number(pos.SalaryGradeMin).toLocaleString()} - \u20B1${Number(pos.SalaryGradeMax).toLocaleString()}`
                        : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-3">
                      <button onClick={() => openEdit(pos)} className="text-primary-600 hover:text-primary-900 font-medium">Edit</button>
                        <button onClick={() => setDeleteTarget(pos)} className="text-red-600 hover:text-red-900 font-medium">Delete</button>
                    </td>
                  </tr>
                ))}
                {positions.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No positions found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Position"
        message={`Are you sure you want to delete "${deleteTarget?.Title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

export default function OrgStructure() {
  return (
    <Routes>
      <Route path="/" element={<DepartmentList />} />
      <Route path="/departments" element={<DepartmentList />} />
      <Route path="/positions" element={<PositionList />} />
    </Routes>
  )
}
