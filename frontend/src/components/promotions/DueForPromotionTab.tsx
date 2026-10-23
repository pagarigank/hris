import { useState, useEffect } from 'react'
import api from '../../lib/api'
import StatusBadge from '../ui/StatusBadge'

interface Candidate {
  employeeId: string
  employeeNo: string
  fullName: string
  currentSalary: number
  departmentId: string
  departmentName: string
  currentPositionId: string
  currentPositionTitle: string
  currentJobGrade: string
  kpiScorePercent: number
  kpiEligible: boolean
  performanceRating: number | null
  performanceEligible: boolean
  tenureMonths: number
  tenureEligible: boolean
  disciplinaryViolationsCount: number
  disciplinaryEligible: boolean
  competencyScoreAvg: number
  competencyEligible: boolean
  readinessScore: number
  eligibilityStatus: 'Due for Promotion' | 'High Potential' | 'Developing' | 'Disqualified'
  summaryReason: string
  recommendedNextPositionId?: string
  recommendedNextPositionTitle?: string
  recommendedSalary: number
  projectedSalaryIncreaseAmount: number
  projectedSalaryIncreasePercent: number
  hasPendingRequest?: boolean
  pendingRequestStatus?: string
}

interface PromotionRequest {
  Id: string
  EmployeeId: string
  EmployeeNo: string
  FirstName: string
  LastName: string
  DepartmentName: string
  CurrentPositionTitle: string
  ProposedPositionTitle: string
  CurrentBasicSalary: number
  ProposedBasicSalary: number
  JustificationReason: string
  Status: string
  EffectiveDate: string
  NominatedByFirstName?: string
  NominatedByLastName?: string
  CreatedAtUtc: string
}

interface Position {
  Id: string
  Title: string
  DepartmentId: string
  SalaryGradeMin?: number
  SalaryGradeMax?: number
}

export default function DueForPromotionTab() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [criteria, setCriteria] = useState<any>(null)
  const [requests, setRequests] = useState<PromotionRequest[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'due' | 'pipeline'>('due')

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDept, setSelectedDept] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // Nomination Modal
  const [nominateModalOpen, setNominateModalOpen] = useState(false)
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)
  const [proposedPosId, setProposedPosId] = useState('')
  const [proposedSalary, setProposedSalary] = useState<number>(0)
  const [justification, setJustification] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0])
  const [submitting, setSubmitting] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [dueRes, reqRes, deptRes, posRes] = await Promise.all([
        api.get('/promotions/due'),
        api.get('/promotions/requests'),
        api.get('/employees/departments'),
        api.get('/employees/positions')
      ])

      if (dueRes.data.success) {
        setCandidates(dueRes.data.data.candidates || [])
        setSummary(dueRes.data.data.summary || null)
        setCriteria(dueRes.data.data.criteria || null)
      }

      if (reqRes.data.success) {
        setRequests(reqRes.data.data.requests || [])
      }

      if (deptRes.data.success) {
        setDepartments(deptRes.data.data.departments || [])
      }

      if (posRes.data.success) {
        setPositions(posRes.data.data.positions || [])
      }
    } catch (err) {
      console.error('Failed to load promotion data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenNominate = (cand: Candidate) => {
    setSelectedCandidate(cand)
    setProposedPosId(cand.recommendedNextPositionId || '')
    setProposedSalary(cand.recommendedSalary || cand.currentSalary * 1.1)
    setJustification(`Demonstrated outstanding KPI achievement (${cand.kpiScorePercent}%) and performance rating (${cand.performanceRating || 'N/A'}) with ${cand.tenureMonths} months tenure in position.`)
    setNominateModalOpen(true)
  }

  const handleSubmitNomination = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCandidate || !proposedPosId || !proposedSalary || !justification) return

    setSubmitting(true)
    try {
      const res = await api.post('/promotions/requests', {
        employeeId: selectedCandidate.employeeId,
        proposedPositionId: proposedPosId,
        proposedBasicSalary: proposedSalary,
        justificationReason: justification,
        effectiveDate,
        kpiScoreAtNomination: selectedCandidate.kpiScorePercent,
        performanceRatingAtNomination: selectedCandidate.performanceRating,
        tenureMonthsAtNomination: selectedCandidate.tenureMonths
      })

      if (res.data.success) {
        setActionMessage('Promotion nomination submitted successfully!')
        setNominateModalOpen(false)
        loadData()
        setTimeout(() => setActionMessage(null), 4000)
      }
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to submit nomination')
    } finally {
      setSubmitting(false)
    }
  }

  const handleActionOnRequest = async (requestId: string, action: 'Approve' | 'Endorse' | 'Reject') => {
    const confirmText = action === 'Approve'
      ? 'Are you sure you want to approve this promotion? This will automatically update the employee\'s position and basic salary in the master 201 file.'
      : `Are you sure you want to ${action.toLowerCase()} this promotion request?`

    if (!window.confirm(confirmText)) return

    try {
      const res = await api.put(`/promotions/requests/${requestId}/action`, {
        action,
        actionNotes: `Action ${action} recorded by management.`
      })

      if (res.data.success) {
        setActionMessage(res.data.data.message || `Request ${action}d`)
        loadData()
        setTimeout(() => setActionMessage(null), 4000)
      }
    } catch (err: any) {
      alert(err.response?.data?.error?.message || `Failed to ${action} request`)
    }
  }

  // Filter candidates
  const filteredCandidates = candidates.filter(c => {
    const matchesSearch = c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.employeeNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.currentPositionTitle.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesDept = !selectedDept || c.departmentId === selectedDept
    const matchesStatus = statusFilter === 'All' || c.eligibilityStatus === statusFilter
    return matchesSearch && matchesDept && matchesStatus
  })

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mx-auto" />
        <p className="mt-3 text-sm text-gray-500">Evaluating employee KPIs, tenure, and promotion eligibility...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {actionMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-xl">✅</span>
            <span className="font-medium text-sm">{actionMessage}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-emerald-600 hover:text-emerald-800">&times;</button>
        </div>
      )}

      {/* Executive KPI & Promotion Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-500/10">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100">Due for Promotion</p>
            <span className="p-2 rounded-xl bg-white/20 backdrop-blur text-lg">🚀</span>
          </div>
          <p className="text-3xl font-extrabold mt-3">{summary?.dueCount || 0}</p>
          <p className="text-xs text-emerald-100 mt-1 flex items-center gap-1">
            <span>Ready Now</span> &bull; <span>Exceeds KPI ({criteria?.MinKpiScorePercent}%+)</span>
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-500/10">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-100">High Potential</p>
            <span className="p-2 rounded-xl bg-white/20 backdrop-blur text-lg">⭐</span>
          </div>
          <p className="text-3xl font-extrabold mt-3">{summary?.highPotentialCount || 0}</p>
          <p className="text-xs text-blue-100 mt-1">Ready within 3–6 months cycle</p>
        </div>

        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 text-white shadow-lg shadow-amber-500/10">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-100">Active Pipeline</p>
            <span className="p-2 rounded-xl bg-white/20 backdrop-blur text-lg">📝</span>
          </div>
          <p className="text-3xl font-extrabold mt-3">{requests.filter(r => r.Status === 'PendingReview' || r.Status === 'Endorsed').length}</p>
          <p className="text-xs text-amber-100 mt-1">Pending Management Review</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-fuchsia-600 rounded-2xl p-5 text-white shadow-lg shadow-purple-500/10">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-purple-100">Projected Salary Impact</p>
            <span className="p-2 rounded-xl bg-white/20 backdrop-blur text-lg">💰</span>
          </div>
          <p className="text-2xl font-extrabold mt-3">
            &#x20B1;{Number(summary?.totalProjectedBudgetImpact || 0).toLocaleString()}
          </p>
          <p className="text-xs text-purple-100 mt-1">Total annualized budget variance</p>
        </div>
      </div>

      {/* View Switcher & Toolbar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Toggle between Due List and Pipeline */}
        <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto">
          <button
            onClick={() => setViewMode('due')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              viewMode === 'due'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            🎯 Due Candidates ({candidates.length})
          </button>
          <button
            onClick={() => setViewMode('pipeline')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              viewMode === 'pipeline'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            📋 Nominations Pipeline ({requests.length})
          </button>
        </div>

        {/* Filter Controls (for Candidates View) */}
        {viewMode === 'due' && (
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <input
              type="text"
              placeholder="Search candidate or title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Departments</option>
              {departments.map((d: any) => (
                <option key={d.Id} value={d.Id}>{d.Name}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="All">All Statuses</option>
              <option value="Due for Promotion">Due for Promotion (Ready Now)</option>
              <option value="High Potential">High Potential (3-6 mos)</option>
              <option value="Developing">Developing</option>
              <option value="Disqualified">Disqualified</option>
            </select>
          </div>
        )}
      </div>

      {/* CANDIDATES DUE FOR PROMOTION VIEW */}
      {viewMode === 'due' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">Promotion Eligibility & Readiness Matrix</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Evaluation criteria: KPI Score &ge; {criteria?.MinKpiScorePercent}% &bull; Rating &ge; {criteria?.MinPerformanceRating} &bull; Tenure &ge; {criteria?.MinTenureMonths} mos &bull; Clean Disciplinary
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg">
              Showing {filteredCandidates.length} employees
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/75">
                <tr>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department &amp; Position</th>
                  <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">KPI Score</th>
                  <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Review / Tenure</th>
                  <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Disciplinary</th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Readiness &amp; Status</th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Recommended Next Move</th>
                  <th className="px-6 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredCandidates.map((c) => (
                  <tr key={c.employeeId} className="hover:bg-gray-50/80 transition-colors">
                    {/* Employee Profile */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-sm">
                          {c.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-gray-900">{c.fullName}</div>
                          <div className="text-xs text-gray-400 font-mono">{c.employeeNo}</div>
                        </div>
                      </div>
                    </td>

                    {/* Department & Current Position */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-800">{c.currentPositionTitle}</div>
                      <div className="text-xs text-gray-500">{c.departmentName} &bull; <span className="text-indigo-600 font-medium">{c.currentJobGrade}</span></div>
                    </td>

                    {/* KPI Score */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                        c.kpiScorePercent >= (criteria?.MinKpiScorePercent || 85)
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
                          : c.kpiScorePercent >= 70
                          ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20'
                          : 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20'
                      }`}>
                        <span>{c.kpiScorePercent}%</span>
                      </div>
                    </td>

                    {/* Rating & Tenure */}
                    <td className="px-6 py-4 whitespace-nowrap text-center text-xs">
                      <div className="font-semibold text-gray-800 flex items-center justify-center gap-1">
                        <span>⭐</span>
                        <span>{c.performanceRating ? Number(c.performanceRating).toFixed(1) : 'N/A'}</span>
                      </div>
                      <div className="text-gray-400 mt-0.5">{c.tenureMonths} mos in role</div>
                    </td>

                    {/* Disciplinary */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {c.disciplinaryEligible ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700" title="Clean record (0 violations)">
                          🛡️ Clean
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-50 text-rose-700" title={`${c.disciplinaryViolationsCount} disciplinary record(s)`}>
                          ⚠️ {c.disciplinaryViolationsCount} Violations
                        </span>
                      )}
                    </td>

                    {/* Readiness & Status */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={c.eligibilityStatus} />
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-20 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                c.readinessScore >= 85 ? 'bg-emerald-500' : c.readinessScore >= 70 ? 'bg-blue-500' : 'bg-gray-400'
                              }`}
                              style={{ width: `${Math.min(c.readinessScore, 100)}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono text-gray-500">{c.readinessScore}%</span>
                        </div>
                      </div>
                    </td>

                    {/* Recommended Move */}
                    <td className="px-6 py-4 text-xs">
                      {c.recommendedNextPositionTitle ? (
                        <div>
                          <div className="font-semibold text-gray-900">{c.recommendedNextPositionTitle}</div>
                          <div className="text-emerald-700 font-medium">
                            &#x20B1;{c.recommendedSalary.toLocaleString()} (+{c.projectedSalaryIncreasePercent}%)
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">At Department Ceiling</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {c.hasPendingRequest ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold ring-1 ring-amber-600/20">
                          ⏳ {c.pendingRequestStatus}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleOpenNominate(c)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                            c.eligibilityStatus === 'Due for Promotion'
                              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 hover:shadow'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span>🚀 Nominate</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}

                {filteredCandidates.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                      No promotion candidates match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* NOMINATIONS PIPELINE VIEW */}
      {viewMode === 'pipeline' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">Promotion Requests Pipeline</h3>
              <p className="text-xs text-gray-500 mt-0.5">Formal nomination reviews, executive endorsements, and automated salary updates</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg">
              {requests.length} total requests
            </span>
          </div>

          <div className="divide-y divide-gray-100">
            {requests.map((r) => {
              const increase = r.ProposedBasicSalary - r.CurrentBasicSalary
              const percentInc = r.CurrentBasicSalary > 0 ? ((increase / r.CurrentBasicSalary) * 100).toFixed(1) : 0

              return (
                <div key={r.Id} className="p-6 hover:bg-gray-50/70 transition-colors">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center">
                        {r.FirstName[0]}{r.LastName[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-gray-900 text-base">{r.FirstName} {r.LastName}</h4>
                          <span className="text-xs font-mono text-gray-400">({r.EmployeeNo})</span>
                          <StatusBadge status={r.Status} />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {r.DepartmentName} &bull; Nominated by {r.NominatedByFirstName || 'Manager'} on {new Date(r.CreatedAtUtc).toLocaleDateString()}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                          <div className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700">
                            From: <span className="font-semibold">{r.CurrentPositionTitle}</span> (&#x20B1;{Number(r.CurrentBasicSalary).toLocaleString()})
                          </div>
                          <span>&rarr;</span>
                          <div className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-medium">
                            To: <span className="font-bold">{r.ProposedPositionTitle}</span> (&#x20B1;{Number(r.ProposedBasicSalary).toLocaleString()})
                            <span className="ml-1 text-emerald-600 font-bold">(+&#x20B1;{increase.toLocaleString()} / +{percentInc}%)</span>
                          </div>
                          <div className="text-gray-400">
                            Effective: <span className="font-medium text-gray-600">{new Date(r.EffectiveDate).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2.5 rounded-lg border border-gray-100 max-w-2xl">
                          <span className="font-semibold text-gray-700">Justification:</span> {r.JustificationReason}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons for Approver */}
                    {(r.Status === 'PendingReview' || r.Status === 'Endorsed') && (
                      <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                        <button
                          onClick={() => handleActionOnRequest(r.Id, 'Approve')}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all"
                        >
                          ✓ Approve &amp; Sync Salary
                        </button>
                        {r.Status === 'PendingReview' && (
                          <button
                            onClick={() => handleActionOnRequest(r.Id, 'Endorse')}
                            className="px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-all"
                          >
                            Endorse
                          </button>
                        )}
                        <button
                          onClick={() => handleActionOnRequest(r.Id, 'Reject')}
                          className="px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-all"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {requests.length === 0 && (
              <div className="p-12 text-center text-gray-400">
                No active promotion nominations in the pipeline.
              </div>
            )}
          </div>
        </div>
      )}

      {/* NOMINATION MODAL */}
      {nominateModalOpen && selectedCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full p-6 border border-gray-100">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Nominate for Promotion</h3>
                <p className="text-xs text-gray-500">Employee: {selectedCandidate.fullName} ({selectedCandidate.employeeNo})</p>
              </div>
              <button onClick={() => setNominateModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>

            <form onSubmit={handleSubmitNomination} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-xs bg-gray-50 p-3 rounded-xl border border-gray-100">
                <div>
                  <span className="text-gray-400">Current Position:</span>
                  <p className="font-semibold text-gray-800">{selectedCandidate.currentPositionTitle}</p>
                </div>
                <div>
                  <span className="text-gray-400">Current Salary:</span>
                  <p className="font-semibold text-gray-800">&#x20B1;{selectedCandidate.currentSalary.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-gray-400">KPI Achievement:</span>
                  <p className="font-semibold text-emerald-600">{selectedCandidate.kpiScorePercent}%</p>
                </div>
                <div>
                  <span className="text-gray-400">Tenure:</span>
                  <p className="font-semibold text-gray-800">{selectedCandidate.tenureMonths} Months</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Proposed Target Position *
                </label>
                <select
                  value={proposedPosId}
                  onChange={(e) => {
                    const posId = e.target.value
                    setProposedPosId(posId)
                    const found = positions.find(p => p.Id === posId)
                    if (found && found.SalaryGradeMin) {
                      setProposedSalary(Math.max(selectedCandidate.currentSalary * 1.1, Number(found.SalaryGradeMin)))
                    }
                  }}
                  required
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                >
                  <option value="">Select Target Position</option>
                  {positions.filter(p => p.DepartmentId === selectedCandidate.departmentId && p.Id !== selectedCandidate.currentPositionId).map(pos => (
                    <option key={pos.Id} value={pos.Id}>
                      {pos.Title} (Min: &#x20B1;{Number(pos.SalaryGradeMin || 0).toLocaleString()} - Max: &#x20B1;{Number(pos.SalaryGradeMax || 0).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Proposed Basic Salary (&#x20B1;) *
                </label>
                <input
                  type="number"
                  step="500"
                  value={proposedSalary}
                  onChange={(e) => setProposedSalary(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none font-semibold text-gray-900"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Recommended minimum: &#x20B1;{selectedCandidate.recommendedSalary.toLocaleString()} (+{selectedCandidate.projectedSalaryIncreasePercent}%)
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Target Effective Date *
                </label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Nomination Justification &amp; Merit Summary *
                </label>
                <textarea
                  rows={3}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  required
                  placeholder="Detail KPI outcomes, leadership capabilities, and business rationale..."
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setNominateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-xl shadow-md disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Nomination'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
