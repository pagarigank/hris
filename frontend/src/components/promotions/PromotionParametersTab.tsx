import { useState, useEffect } from 'react'
import api from '../../lib/api'

interface CriteriaConfig {
  MinKpiScorePercent: number
  MinPerformanceRating: number
  MinTenureMonths: number
  RequireCleanDisciplinary: boolean
  MinCompetencyScore: number
  RecommendedSalaryIncreasePercent: number
  AutoFlagDue: boolean
}

interface KpiDefinition {
  Id: string
  Title: string
  Description?: string
  Category: string
  MetricType: string
  TargetValue: number
  DefaultWeightPercent: number
  Unit?: string
  DepartmentName?: string
  PositionTitle?: string
}

export default function PromotionParametersTab() {
  const [criteria, setCriteria] = useState<CriteriaConfig>({
    MinKpiScorePercent: 85,
    MinPerformanceRating: 4.0,
    MinTenureMonths: 12,
    RequireCleanDisciplinary: true,
    MinCompetencyScore: 3.5,
    RecommendedSalaryIncreasePercent: 10,
    AutoFlagDue: true
  })
  const [definitions, setDefinitions] = useState<KpiDefinition[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [savingCriteria, setSavingCriteria] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // KPI Definition Modal
  const [defModalOpen, setDefModalOpen] = useState(false)
  const [editingDefId, setEditingDefId] = useState<string | null>(null)
  const [defTitle, setDefTitle] = useState('')
  const [defDescription, setDefDescription] = useState('')
  const [defCategory, setDefCategory] = useState('Operational')
  const [defMetricType, setDefMetricType] = useState('Percentage')
  const [defTarget, setDefTarget] = useState<number>(100)
  const [defWeight, setDefWeight] = useState<number>(20)
  const [defUnit, setDefUnit] = useState('%')
  const [defDeptId, setDefDeptId] = useState('')
  const [submittingDef, setSubmittingDef] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [critRes, defRes, deptRes] = await Promise.all([
        api.get('/promotions/criteria'),
        api.get('/kpis/definitions'),
        api.get('/employees/departments')
      ])

      if (critRes.data.success && critRes.data.data.criteria) {
        const c = critRes.data.data.criteria
        setCriteria({
          MinKpiScorePercent: Number(c.MinKpiScorePercent) || 85,
          MinPerformanceRating: Number(c.MinPerformanceRating) || 4.0,
          MinTenureMonths: Number(c.MinTenureMonths) || 12,
          RequireCleanDisciplinary: Boolean(c.RequireCleanDisciplinary),
          MinCompetencyScore: Number(c.MinCompetencyScore) || 3.5,
          RecommendedSalaryIncreasePercent: Number(c.RecommendedSalaryIncreasePercent) || 10,
          AutoFlagDue: Boolean(c.AutoFlagDue)
        })
      }

      if (defRes.data.success) {
        setDefinitions(defRes.data.data.definitions || [])
      }

      if (deptRes.data.success) {
        setDepartments(deptRes.data.data.departments || [])
      }
    } catch (err) {
      console.error('Failed to load parameters data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveCriteria = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingCriteria(true)
    try {
      const res = await api.put('/promotions/criteria', {
        minKpiScorePercent: criteria.MinKpiScorePercent,
        minPerformanceRating: criteria.MinPerformanceRating,
        minTenureMonths: criteria.MinTenureMonths,
        requireCleanDisciplinary: criteria.RequireCleanDisciplinary ? 1 : 0,
        minCompetencyScore: criteria.MinCompetencyScore,
        recommendedSalaryIncreasePercent: criteria.RecommendedSalaryIncreasePercent,
        autoFlagDue: criteria.AutoFlagDue ? 1 : 0
      })

      if (res.data.success) {
        setToastMessage('Promotion evaluation parameters successfully updated!')
        setTimeout(() => setToastMessage(null), 4000)
      }
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to update criteria')
    } finally {
      setSavingCriteria(false)
    }
  }

  const handleOpenAddDef = () => {
    setEditingDefId(null)
    setDefTitle('')
    setDefDescription('')
    setDefCategory('Operational')
    setDefMetricType('Percentage')
    setDefTarget(100)
    setDefWeight(20)
    setDefUnit('%')
    setDefDeptId('')
    setDefModalOpen(true)
  }

  const handleOpenEditDef = (def: KpiDefinition) => {
    setEditingDefId(def.Id)
    setDefTitle(def.Title)
    setDefDescription(def.Description || '')
    setDefCategory(def.Category)
    setDefMetricType(def.MetricType)
    setDefTarget(Number(def.TargetValue))
    setDefWeight(Number(def.DefaultWeightPercent))
    setDefUnit(def.Unit || '')
    setDefDeptId('')
    setDefModalOpen(true)
  }

  const handleSaveDefinition = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!defTitle || defTarget === undefined) return

    setSubmittingDef(true)
    try {
      const payload = {
        title: defTitle,
        description: defDescription,
        category: defCategory,
        metricType: defMetricType,
        targetValue: defTarget,
        defaultWeightPercent: defWeight,
        unit: defUnit,
        departmentId: defDeptId || null
      }

      if (editingDefId) {
        await api.put(`/kpis/definitions/${editingDefId}`, payload)
        setToastMessage('KPI template updated!')
      } else {
        await api.post('/kpis/definitions', payload)
        setToastMessage('New KPI template added to catalog!')
      }

      setDefModalOpen(false)
      loadData()
      setTimeout(() => setToastMessage(null), 3000)
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to save KPI definition')
    } finally {
      setSubmittingDef(false)
    }
  }

  const handleDeleteDefinition = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this KPI template from catalog?')) return

    try {
      await api.delete(`/kpis/definitions/${id}`)
      loadData()
      setToastMessage('KPI definition deleted.')
      setTimeout(() => setToastMessage(null), 3000)
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to delete definition')
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mx-auto" />
        <p className="mt-3 text-sm text-gray-500">Loading promotion criteria and KPI catalog...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span className="font-medium text-sm">{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-600 hover:text-emerald-800">&times;</button>
        </div>
      )}

      {/* SECTION 1: PROMOTION CRITERIA PARAMETERS */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span>⚙️</span> Company Promotion Thresholds &amp; Eligibility Parameters
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Defines the quantitative benchmarks used by the Promotion Engine to automatically flag employees as **Due for Promotion**.
            </p>
          </div>
          <span className="px-3 py-1 bg-primary-50 text-primary-700 text-xs font-semibold rounded-lg">
            Tenant Active Configuration
          </span>
        </div>

        <form onSubmit={handleSaveCriteria} className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Min KPI Score */}
            <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-100">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Minimum KPI Score (%) *
              </label>
              <p className="text-[11px] text-gray-500 mb-2">Target achievement threshold to qualify for promotion nomination.</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="50"
                  max="100"
                  step="1"
                  value={criteria.MinKpiScorePercent}
                  onChange={(e) => setCriteria({ ...criteria, MinKpiScorePercent: Number(e.target.value) })}
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none font-bold text-gray-900"
                />
                <span className="text-sm font-semibold text-gray-600">%</span>
              </div>
            </div>

            {/* Min Performance Rating */}
            <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-100">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Minimum Review Rating (1–5) *
              </label>
              <p className="text-[11px] text-gray-500 mb-2">Latest performance appraisal score requirement (e.g. 4.0 = Exceeds).</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="5"
                  step="0.1"
                  value={criteria.MinPerformanceRating}
                  onChange={(e) => setCriteria({ ...criteria, MinPerformanceRating: Number(e.target.value) })}
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none font-bold text-gray-900"
                />
                <span className="text-sm font-semibold text-amber-500">⭐</span>
              </div>
            </div>

            {/* Min Tenure Months */}
            <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-100">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Minimum Tenure (Months) *
              </label>
              <p className="text-[11px] text-gray-500 mb-2">Time-in-grade requirement before promotion review.</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="3"
                  max="60"
                  step="1"
                  value={criteria.MinTenureMonths}
                  onChange={(e) => setCriteria({ ...criteria, MinTenureMonths: Number(e.target.value) })}
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none font-bold text-gray-900"
                />
                <span className="text-sm font-semibold text-gray-600">mos</span>
              </div>
            </div>

            {/* Minimum Competency Score */}
            <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-100">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Min Competency Score (1–5) *
              </label>
              <p className="text-[11px] text-gray-500 mb-2">Proficiency benchmark across assessed core skills.</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="5"
                  step="0.1"
                  value={criteria.MinCompetencyScore}
                  onChange={(e) => setCriteria({ ...criteria, MinCompetencyScore: Number(e.target.value) })}
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none font-bold text-gray-900"
                />
                <span className="text-sm font-semibold text-indigo-600">🎯</span>
              </div>
            </div>

            {/* Standard Salary Increase Percent */}
            <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-100">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Standard Salary Hike (%) *
              </label>
              <p className="text-[11px] text-gray-500 mb-2">Baseline recommended percentage bump when moving up grades.</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="1"
                  value={criteria.RecommendedSalaryIncreasePercent}
                  onChange={(e) => setCriteria({ ...criteria, RecommendedSalaryIncreasePercent: Number(e.target.value) })}
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none font-bold text-gray-900"
                />
                <span className="text-sm font-semibold text-emerald-600">+%</span>
              </div>
            </div>

            {/* Disciplinary Policy Check */}
            <div className="bg-gray-50/70 p-4 rounded-2xl border border-gray-100 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Disciplinary Gatekeeper
                </label>
                <p className="text-[11px] text-gray-500">Require zero active NTE / NODA violations in the last 12 months.</p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={criteria.RequireCleanDisciplinary}
                    onChange={(e) => setCriteria({ ...criteria, RequireCleanDisciplinary: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
                <span className="text-xs font-semibold text-gray-800">
                  {criteria.RequireCleanDisciplinary ? 'Enforced (Zero Violations)' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={savingCriteria}
              className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              {savingCriteria ? 'Saving Parameters...' : 'Save Promotion Parameters'}
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 2: REUSABLE KPI DEFINITION CATALOG */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4 border-b border-gray-100 gap-3">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span>📚</span> Reusable KPI Catalog &amp; Objective Templates
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Standard organizational KPI definitions ready to assign across departments and positions.
            </p>
          </div>
          <button
            onClick={handleOpenAddDef}
            className="px-4 py-2 bg-gradient-to-r from-primary-600 to-indigo-600 text-white text-xs font-bold rounded-xl hover:shadow-md transition-all shadow-sm"
          >
            + Create KPI Template
          </button>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/75">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Title &amp; Category</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department Scope</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Metric Type</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Target</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Default Weight</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {definitions.map((def) => (
                <tr key={def.Id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-sm text-gray-900">{def.Title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                        {def.Category}
                      </span>
                      {def.Description && (
                        <span className="text-xs text-gray-400 truncate max-w-xs">{def.Description}</span>
                      )}
                    </div>
                  </td>

                  <td className="px-6 py-4 text-xs text-gray-600">
                    {def.DepartmentName || <span className="text-gray-400 font-italic">Company-Wide</span>}
                  </td>

                  <td className="px-6 py-4 text-center">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {def.MetricType}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-center text-sm font-bold text-gray-900">
                    {Number(def.TargetValue).toLocaleString()} {def.Unit}
                  </td>

                  <td className="px-6 py-4 text-center text-xs font-semibold text-gray-600">
                    {def.DefaultWeightPercent}%
                  </td>

                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => handleOpenEditDef(def)}
                      className="text-xs font-semibold text-primary-600 hover:text-primary-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteDefinition(def.Id)}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {definitions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
                    No KPI templates created yet. Click "+ Create KPI Template" to seed standard metrics.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE / EDIT KPI DEFINITION MODAL */}
      {defModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-gray-100">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">
                {editingDefId ? 'Edit KPI Definition Template' : 'Create KPI Definition Template'}
              </h3>
              <button onClick={() => setDefModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>

            <form onSubmit={handleSaveDefinition} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  KPI Title *
                </label>
                <input
                  type="text"
                  value={defTitle}
                  onChange={(e) => setDefTitle(e.target.value)}
                  required
                  placeholder="e.g. System Uptime &amp; SLA Compliance"
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Category *
                  </label>
                  <select
                    value={defCategory}
                    onChange={(e) => setDefCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  >
                    <option value="Operational">Operational</option>
                    <option value="Financial">Financial</option>
                    <option value="Customer">Customer</option>
                    <option value="People">People</option>
                    <option value="Quality">Quality</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Department (Optional)
                  </label>
                  <select
                    value={defDeptId}
                    onChange={(e) => setDefDeptId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  >
                    <option value="">Company-Wide</option>
                    {departments.map((d: any) => (
                      <option key={d.Id} value={d.Id}>{d.Name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Metric Type *
                  </label>
                  <select
                    value={defMetricType}
                    onChange={(e) => setDefMetricType(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  >
                    <option value="Percentage">Percentage</option>
                    <option value="Currency">Currency</option>
                    <option value="Numeric">Numeric</option>
                    <option value="Milestone">Milestone</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Target Value *
                  </label>
                  <input
                    type="number"
                    value={defTarget}
                    onChange={(e) => setDefTarget(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={defUnit}
                    onChange={(e) => setDefUnit(e.target.value)}
                    placeholder="%, PHP, pts"
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Default Weight %
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={defWeight}
                  onChange={(e) => setDefWeight(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={defDescription}
                  onChange={(e) => setDefDescription(e.target.value)}
                  placeholder="Measurement formula and documentation requirements..."
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setDefModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDef}
                  className="px-5 py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-md disabled:opacity-50"
                >
                  {submittingDef ? 'Saving...' : editingDefId ? 'Update Template' : 'Add to Catalog'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
