import { useState, useEffect } from 'react'
import api from '../../lib/api'
import StatusBadge from '../ui/StatusBadge'

interface KpiRecord {
  Id: string
  EmployeeId: string
  EmployeeNo: string
  FirstName: string
  LastName: string
  DepartmentName: string
  PositionTitle: string
  ReviewPeriod: string
  Title: string
  Description?: string
  Category: string
  MetricType: string
  Unit?: string
  WeightPercent: number
  TargetValue: number
  ActualValue: number
  AchievementScorePercent: number
  Status: string
  ManagerComment?: string
  EvaluatedAtUtc?: string
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
}

export default function KpiManagementTab() {
  const [kpis, setKpis] = useState<KpiRecord[]>([])
  const [definitions, setDefinitions] = useState<KpiDefinition[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [selectedPeriod, setSelectedPeriod] = useState('2026-Annual')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [searchEmp, setSearchEmp] = useState('')

  // Assign KPI Modal
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedDefId, setSelectedDefId] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formCategory, setFormCategory] = useState('Operational')
  const [formMetricType, setFormMetricType] = useState('Percentage')
  const [formUnit, setFormUnit] = useState('%')
  const [formTarget, setFormTarget] = useState<number>(100)
  const [formWeight, setFormWeight] = useState<number>(25)
  const [formDescription, setFormDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Update Progress Modal
  const [updateModalOpen, setUpdateModalOpen] = useState(false)
  const [activeKpi, setActiveKpi] = useState<KpiRecord | null>(null)
  const [updateActual, setUpdateActual] = useState<number>(0)
  const [updateComment, setUpdateComment] = useState('')
  const [updateStatus, setUpdateStatus] = useState('InProgress')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [kpiRes, defRes, empRes] = await Promise.all([
        api.get('/kpis/employee'),
        api.get('/kpis/definitions'),
        api.get('/employees')
      ])

      if (kpiRes.data.success) {
        setKpis(kpiRes.data.data.kpis || [])
      }
      if (defRes.data.success) {
        setDefinitions(defRes.data.data.definitions || [])
      }
      if (empRes.data.success) {
        setEmployees(empRes.data.data.employees || [])
      }
    } catch (err) {
      console.error('Failed to load KPI data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectDefinition = (defId: string) => {
    setSelectedDefId(defId)
    const found = definitions.find(d => d.Id === defId)
    if (found) {
      setFormTitle(found.Title)
      setFormDescription(found.Description || '')
      setFormCategory(found.Category)
      setFormMetricType(found.MetricType)
      setFormTarget(Number(found.TargetValue))
      setFormWeight(Number(found.DefaultWeightPercent))
      setFormUnit(found.Unit || '')
    }
  }

  const handleAssignKpi = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmployeeId || !formTitle || formTarget === undefined) return

    setSubmitting(true)
    try {
      const res = await api.post('/kpis/employee', {
        employeeId: selectedEmployeeId,
        kpiDefinitionId: selectedDefId || null,
        reviewPeriod: selectedPeriod,
        title: formTitle,
        description: formDescription,
        category: formCategory,
        metricType: formMetricType,
        unit: formUnit,
        weightPercent: formWeight,
        targetValue: formTarget,
        actualValue: 0
      })

      if (res.data.success) {
        setAssignModalOpen(false)
        resetAssignForm()
        loadData()
      }
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to assign KPI')
    } finally {
      setSubmitting(false)
    }
  }

  const resetAssignForm = () => {
    setSelectedEmployeeId('')
    setSelectedDefId('')
    setFormTitle('')
    setFormDescription('')
    setFormCategory('Operational')
    setFormMetricType('Percentage')
    setFormUnit('%')
    setFormTarget(100)
    setFormWeight(25)
  }

  const handleOpenUpdate = (kpi: KpiRecord) => {
    setActiveKpi(kpi)
    setUpdateActual(Number(kpi.ActualValue))
    setUpdateComment(kpi.ManagerComment || '')
    setUpdateStatus(kpi.Status)
    setUpdateModalOpen(true)
  }

  const handleSaveProgress = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeKpi) return

    setSubmitting(true)
    try {
      const res = await api.put(`/kpis/employee/${activeKpi.Id}`, {
        actualValue: updateActual,
        managerComment: updateComment,
        status: updateStatus
      })

      if (res.data.success) {
        setUpdateModalOpen(false)
        loadData()
      }
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to update KPI progress')
    } finally {
      setSubmitting(false)
    }
  }

  // Filtered KPIs
  const filteredKpis = kpis.filter(k => {
    const matchesPeriod = selectedPeriod === 'All' || k.ReviewPeriod === selectedPeriod
    const matchesCat = selectedCategory === 'All' || k.Category === selectedCategory
    const matchesEmp = !searchEmp ||
      `${k.FirstName} ${k.LastName}`.toLowerCase().includes(searchEmp.toLowerCase()) ||
      k.EmployeeNo.toLowerCase().includes(searchEmp.toLowerCase()) ||
      k.Title.toLowerCase().includes(searchEmp.toLowerCase())
    return matchesPeriod && matchesCat && matchesEmp
  })

  // Group KPIs by Employee for overview
  const employeeGroups = filteredKpis.reduce((acc: Record<string, { employee: any; items: KpiRecord[] }>, kpi) => {
    if (!acc[kpi.EmployeeId]) {
      acc[kpi.EmployeeId] = {
        employee: {
          id: kpi.EmployeeId,
          name: `${kpi.FirstName} ${kpi.LastName}`,
          employeeNo: kpi.EmployeeNo,
          dept: kpi.DepartmentName,
          pos: kpi.PositionTitle
        },
        items: []
      }
    }
    acc[kpi.EmployeeId].items.push(kpi)
    return acc
  }, {})

  const avgAchievement = kpis.length > 0
    ? Math.round(kpis.reduce((sum, k) => sum + Number(k.AchievementScorePercent || 0), 0) / kpis.length)
    : 0

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mx-auto" />
        <p className="mt-3 text-sm text-gray-500">Loading KPI goals &amp; achievements...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header & KPI Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total Goals Tracked</p>
          <p className="text-3xl font-extrabold text-gray-900 mt-2">{kpis.length}</p>
          <p className="text-xs text-gray-400 mt-1">Across all departments</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Avg Achievement Rate</p>
          <div className="flex items-center gap-2 mt-2">
            <p className="text-3xl font-extrabold text-emerald-600">{avgAchievement}%</p>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">On Target</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Weighted metric score</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Goals Evaluated</p>
          <p className="text-3xl font-extrabold text-indigo-600 mt-2">
            {kpis.filter(k => k.Status === 'Evaluated').length}
          </p>
          <p className="text-xs text-gray-400 mt-1">{kpis.filter(k => k.Status === 'InProgress').length} currently In Progress</p>
        </div>

        <div className="bg-gradient-to-br from-primary-600 to-indigo-700 rounded-2xl p-5 text-white shadow-md flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-100">Set Objectives</p>
            <p className="text-sm mt-1 text-primary-50">Assign new SMART targets or check-in quarterly actuals.</p>
          </div>
          <button
            onClick={() => setAssignModalOpen(true)}
            className="mt-3 px-4 py-2 bg-white text-primary-700 font-bold text-xs rounded-xl hover:bg-primary-50 transition-all shadow-sm"
          >
            + Assign KPI to Employee
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search employee or goal..."
            value={searchEmp}
            onChange={(e) => setSearchEmp(e.target.value)}
            className="px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="All">All Review Periods</option>
            <option value="2026-Annual">2026-Annual</option>
            <option value="2026-Q1">2026-Q1</option>
            <option value="2026-Q2">2026-Q2</option>
            <option value="2025-Annual">2025-Annual</option>
          </select>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="All">All Categories</option>
            <option value="Operational">Operational</option>
            <option value="Financial">Financial</option>
            <option value="Customer">Customer</option>
            <option value="People">People</option>
            <option value="Quality">Quality</option>
          </select>
        </div>

        <div className="text-xs text-gray-500 font-medium">
          Showing {filteredKpis.length} goals across {Object.keys(employeeGroups).length} employees
        </div>
      </div>

      {/* EMPLOYEE GOAL CARDS */}
      <div className="space-y-4">
        {Object.values(employeeGroups).map(({ employee, items }) => {
          const totalWeight = items.reduce((s, i) => s + Number(i.WeightPercent), 0)
          const empAvgScore = Math.round(
            items.reduce((s, i) => s + (Number(i.AchievementScorePercent) * (Number(i.WeightPercent) / (totalWeight || 100))), 0)
          )

          return (
            <div key={employee.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Employee Banner */}
              <div className="px-6 py-4 bg-gray-50/70 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary-600 text-white font-bold text-xs flex items-center justify-center">
                    {employee.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm">{employee.name}</h4>
                    <p className="text-xs text-gray-500">{employee.pos} &bull; {employee.dept} &bull; <span className="font-mono">{employee.employeeNo}</span></p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[11px] text-gray-400 font-semibold uppercase">Overall KPI Score</p>
                    <p className={`text-base font-extrabold ${empAvgScore >= 85 ? 'text-emerald-600' : empAvgScore >= 70 ? 'text-blue-600' : 'text-amber-600'}`}>
                      {empAvgScore}%
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedEmployeeId(employee.id)
                      setAssignModalOpen(true)
                    }}
                    className="px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg shadow-sm"
                  >
                    + Add Goal
                  </button>
                </div>
              </div>

              {/* KPI Items Grid */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((kpi) => {
                  const ach = Number(kpi.AchievementScorePercent) || 0
                  return (
                    <div key={kpi.Id} className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 flex flex-col justify-between hover:border-gray-200 transition-all">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                            {kpi.Category}
                          </span>
                          <StatusBadge status={kpi.Status} />
                        </div>
                        <h5 className="font-bold text-gray-900 text-sm mt-2">{kpi.Title}</h5>
                        {kpi.Description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{kpi.Description}</p>}

                        {/* Progress Bar & Actuals */}
                        <div className="mt-4 space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Target: <strong className="text-gray-800">{Number(kpi.TargetValue).toLocaleString()} {kpi.Unit}</strong></span>
                            <span className="text-gray-500">Actual: <strong className="text-gray-900">{Number(kpi.ActualValue).toLocaleString()} {kpi.Unit}</strong></span>
                          </div>

                          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                ach >= 100 ? 'bg-emerald-500' : ach >= 70 ? 'bg-blue-500' : 'bg-amber-500'
                              }`}
                              style={{ width: `${Math.min(ach, 100)}%` }}
                            />
                          </div>

                          <div className="flex justify-between items-center text-xs pt-1">
                            <span className="text-[11px] text-gray-400">Weight: {kpi.WeightPercent}%</span>
                            <span className={`font-bold ${ach >= 85 ? 'text-emerald-600' : ach >= 70 ? 'text-blue-600' : 'text-amber-600'}`}>
                              {ach}% Achievement
                            </span>
                          </div>
                        </div>

                        {kpi.ManagerComment && (
                          <div className="mt-3 p-2 rounded-lg bg-white border border-gray-100 text-[11px] text-gray-600 italic">
                            &ldquo;{kpi.ManagerComment}&rdquo;
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-end">
                        <button
                          onClick={() => handleOpenUpdate(kpi)}
                          className="text-xs font-semibold text-primary-600 hover:text-primary-800 flex items-center gap-1"
                        >
                          ✏️ Update Progress
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {Object.keys(employeeGroups).length === 0 && (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400 border border-gray-100">
            No KPI goals found for the selected review period and category.
          </div>
        )}
      </div>

      {/* ASSIGN KPI MODAL */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-gray-100">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Assign KPI Objective</h3>
              <button onClick={() => setAssignModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>

            <form onSubmit={handleAssignKpi} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Employee *
                </label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                >
                  <option value="">Select Employee</option>
                  {employees.map((emp: any) => (
                    <option key={emp.Id} value={emp.Id}>
                      {emp.FirstName} {emp.LastName} ({emp.EmployeeNo}) &bull; {emp.PositionTitle}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Pick from KPI Catalog (Optional)
                </label>
                <select
                  value={selectedDefId}
                  onChange={(e) => handleSelectDefinition(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                >
                  <option value="">Custom Goal (Not from Catalog)</option>
                  {definitions.map((def) => (
                    <option key={def.Id} value={def.Id}>
                      [{def.Category}] {def.Title} (Target: {def.TargetValue} {def.Unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Goal Title *
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  placeholder="e.g. Q1 SLA Resolution Compliance Rate"
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Category *
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
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
                    Metric Type *
                  </label>
                  <select
                    value={formMetricType}
                    onChange={(e) => setFormMetricType(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  >
                    <option value="Percentage">Percentage (%)</option>
                    <option value="Currency">Currency (&#x20B1;)</option>
                    <option value="Numeric">Numeric Count</option>
                    <option value="Milestone">Milestone (Binary)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Target *
                  </label>
                  <input
                    type="number"
                    value={formTarget}
                    onChange={(e) => setFormTarget(Number(e.target.value))}
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
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    placeholder="%, tickets"
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Weight % *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formWeight}
                    onChange={(e) => setFormWeight(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Description &amp; Milestones
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Specific definition of done and evaluation metric..."
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-md disabled:opacity-50"
                >
                  {submitting ? 'Assigning...' : 'Assign Goal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPDATE PROGRESS MODAL */}
      {updateModalOpen && activeKpi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-gray-100">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Record KPI Progress</h3>
                <p className="text-xs text-gray-500">{activeKpi.FirstName} {activeKpi.LastName} &bull; {activeKpi.Title}</p>
              </div>
              <button onClick={() => setUpdateModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>

            <form onSubmit={handleSaveProgress} className="mt-4 space-y-4">
              <div className="flex justify-between text-xs bg-gray-50 p-3 rounded-xl border border-gray-100">
                <span>Target: <strong>{activeKpi.TargetValue} {activeKpi.Unit}</strong></span>
                <span>Current Actual: <strong>{activeKpi.ActualValue} {activeKpi.Unit}</strong></span>
                <span>Weight: <strong>{activeKpi.WeightPercent}%</strong></span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  New Actual Value ({activeKpi.Unit || 'Units'}) *
                </label>
                <input
                  type="number"
                  step="any"
                  value={updateActual}
                  onChange={(e) => setUpdateActual(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none font-bold text-gray-900 text-base"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Status
                </label>
                <select
                  value={updateStatus}
                  onChange={(e) => setUpdateStatus(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                >
                  <option value="InProgress">InProgress</option>
                  <option value="Evaluated">Evaluated (Finalized)</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Manager Coaching &amp; Progress Notes
                </label>
                <textarea
                  rows={3}
                  value={updateComment}
                  onChange={(e) => setUpdateComment(e.target.value)}
                  placeholder="Specific achievements, evidence, or coaching notes..."
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setUpdateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-md disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Progress'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
