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
  performanceRating: number | null
  tenureMonths: number
  readinessScore: number
  eligibilityStatus: string
  recommendedNextPositionTitle?: string
  recommendedSalary: number
  projectedSalaryIncreasePercent: number
}

interface GridBoxDef {
  key: string
  title: string
  subtitle: string
  badgeBg: string
  boxBg: string
  borderColor: string
  actionHint: string
  perfTier: 'Low' | 'Med' | 'High'
  potTier: 'High' | 'Med' | 'Low'
}

const NINE_BOXES: GridBoxDef[] = [
  // ROW 1: High Potential
  { key: 'H-L', title: 'Rough Diamond / Enigma', subtitle: 'High Potential, Low Performance', badgeBg: 'bg-amber-100 text-amber-800', boxBg: 'bg-amber-50/40', borderColor: 'border-amber-200', actionHint: 'Needs coaching on delivery & role alignment', perfTier: 'Low', potTier: 'High' },
  { key: 'H-M', title: 'Future Leader / Growth Star', subtitle: 'High Potential, Medium Performance', badgeBg: 'bg-blue-100 text-blue-800', boxBg: 'bg-blue-50/40', borderColor: 'border-blue-200', actionHint: 'High priority development for promotion next cycle', perfTier: 'Med', potTier: 'High' },
  { key: 'H-H', title: 'Top Star / Super Performer', subtitle: 'High Potential, High Performance', badgeBg: 'bg-emerald-100 text-emerald-800', boxBg: 'bg-emerald-50/50', borderColor: 'border-emerald-300 ring-2 ring-emerald-500/20', actionHint: '🌟 Prime candidate for immediate promotion & key retention', perfTier: 'High', potTier: 'High' },

  // ROW 2: Medium Potential
  { key: 'M-L', title: 'Inconsistent / Dilemma', subtitle: 'Medium Potential, Low Performance', badgeBg: 'bg-orange-100 text-orange-800', boxBg: 'bg-orange-50/30', borderColor: 'border-orange-200', actionHint: 'Review motivation, skillset fit, or blockers', perfTier: 'Low', potTier: 'Med' },
  { key: 'M-M', title: 'Core Professional', subtitle: 'Medium Potential, Medium Performance', badgeBg: 'bg-indigo-100 text-indigo-800', boxBg: 'bg-indigo-50/30', borderColor: 'border-indigo-200', actionHint: 'Steady contributor; provide stretch projects', perfTier: 'Med', potTier: 'Med' },
  { key: 'M-H', title: 'High Performer', subtitle: 'Medium Potential, High Performance', badgeBg: 'bg-teal-100 text-teal-800', boxBg: 'bg-teal-50/40', borderColor: 'border-teal-200', actionHint: 'Reward high impact; develop leadership agility', perfTier: 'High', potTier: 'Med' },

  // ROW 3: Low Potential
  { key: 'L-L', title: 'Underperformer / Risk', subtitle: 'Low Potential, Low Performance', badgeBg: 'bg-rose-100 text-rose-800', boxBg: 'bg-rose-50/40', borderColor: 'border-rose-200', actionHint: 'Initiate Performance Improvement Plan (PIP)', perfTier: 'Low', potTier: 'Low' },
  { key: 'L-M', title: 'Effective Specialist', subtitle: 'Low Potential, Medium Performance', badgeBg: 'bg-slate-100 text-slate-800', boxBg: 'bg-slate-50/40', borderColor: 'border-slate-200', actionHint: 'Valued in current operational role', perfTier: 'Med', potTier: 'Low' },
  { key: 'L-H', title: 'Solid Contributor / Workhorse', subtitle: 'Low Potential, High Performance', badgeBg: 'bg-cyan-100 text-cyan-800', boxBg: 'bg-cyan-50/40', borderColor: 'border-cyan-200', actionHint: 'Maximize role efficiency; reward domain mastery', perfTier: 'High', potTier: 'Low' },
]

export default function TalentSight9BoxTab() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)
  const [deptFilter, setDeptFilter] = useState('All')
  const [departments, setDepartments] = useState<any[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [dueRes, deptRes] = await Promise.all([
        api.get('/promotions/due'),
        api.get('/employees/departments')
      ])

      if (dueRes.data.success) {
        setCandidates(dueRes.data.data.candidates || [])
      }
      if (deptRes.data.success) {
        setDepartments(deptRes.data.data.departments || [])
      }
    } catch (err) {
      console.error('Failed to load 9-box talent data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Helper to categorize employee into Performance Tier (Low, Med, High)
  const getPerfTier = (c: Candidate): 'Low' | 'Med' | 'High' => {
    if (c.kpiScorePercent >= 85 || (c.performanceRating && c.performanceRating >= 4.0)) return 'High'
    if (c.kpiScorePercent >= 70 || (c.performanceRating && c.performanceRating >= 3.0)) return 'Med'
    return 'Low'
  }

  // Helper to categorize employee into Potential Tier
  const getPotTier = (c: Candidate): 'High' | 'Med' | 'Low' => {
    if (c.readinessScore >= 80 || c.eligibilityStatus === 'Due for Promotion' || c.eligibilityStatus === 'High Potential') return 'High'
    if (c.readinessScore >= 55) return 'Med'
    return 'Low'
  }

  const filteredCandidates = candidates.filter(c => deptFilter === 'All' || c.departmentId === deptFilter)

  // Place candidates into boxes
  const boxMapping: Record<string, Candidate[]> = {}
  NINE_BOXES.forEach(b => {
    boxMapping[b.key] = []
  })

  filteredCandidates.forEach(c => {
    const pTier = getPerfTier(c)
    const potTier = getPotTier(c)
    const key = `${potTier[0]}-${pTier[0]}`
    if (boxMapping[key]) {
      boxMapping[key].push(c)
    }
  })

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mx-auto" />
        <p className="mt-3 text-sm text-gray-500">Mapping employee talent grid &amp; performance sightlines...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">👁️</span>
            <h3 className="text-lg font-bold text-gray-900">9-Box Talent &amp; Leadership Sight Grid</h3>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Visualizes employees by **Performance** (evaluated KPI score &amp; ratings) vs. **Potential** (growth readiness &amp; tenure).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="All">All Departments</option>
            {departments.map((d: any) => (
              <option key={d.Id} value={d.Id}>{d.Name}</option>
            ))}
          </select>
          <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg">
            {filteredCandidates.length} Active Profiles
          </span>
        </div>
      </div>

      {/* 9-BOX MATRIX GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          {/* Grid Container */}
          <div className="relative">
            {/* Axis Label - Y Potential */}
            <div className="hidden md:flex absolute -left-10 top-1/2 -translate-y-1/2 -rotate-90 text-xs font-extrabold uppercase tracking-widest text-indigo-600">
              &larr; Potential / Growth &rarr;
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {NINE_BOXES.map((box) => {
                const emps = boxMapping[box.key] || []
                return (
                  <div
                    key={box.key}
                    className={`rounded-2xl p-4 border transition-all duration-200 min-h-[190px] flex flex-col justify-between ${box.boxBg} ${box.borderColor}`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${box.badgeBg}`}>
                          {box.title}
                        </span>
                        <span className="w-5 h-5 rounded-full bg-white/80 text-gray-700 text-xs font-mono font-bold flex items-center justify-center shadow-xs">
                          {emps.length}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">{box.subtitle}</p>

                      {/* Employee Chips */}
                      <div className="mt-3 flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                        {emps.map(cand => (
                          <button
                            key={cand.employeeId}
                            onClick={() => setSelectedCandidate(cand)}
                            className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all shadow-xs ${
                              selectedCandidate?.employeeId === cand.employeeId
                                ? 'bg-primary-600 text-white shadow-md ring-2 ring-primary-300'
                                : 'bg-white/90 hover:bg-white text-gray-800 border border-gray-200/80 hover:shadow-xs'
                            }`}
                          >
                            <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-bold flex items-center justify-center">
                              {cand.fullName[0]}
                            </span>
                            <span className="truncate max-w-[100px]">{cand.fullName.split(' ')[0]}</span>
                            <span className={`text-[10px] font-mono font-semibold ${
                              selectedCandidate?.employeeId === cand.employeeId ? 'text-primary-100' : 'text-emerald-600'
                            }`}>
                              {cand.kpiScorePercent}%
                            </span>
                          </button>
                        ))}

                        {emps.length === 0 && (
                          <span className="text-[11px] text-gray-400 italic py-2">No employees currently in this tier</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-gray-200/50 text-[10px] text-gray-500 italic">
                      {box.actionHint}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Axis Label - X Performance */}
            <div className="mt-3 text-center text-xs font-extrabold uppercase tracking-widest text-emerald-600">
              &larr; Performance &amp; KPI Achievement &rarr;
            </div>
          </div>
        </div>

        {/* SELECTED EMPLOYEE TALENT DOSSIER */}
        <div className="lg:col-span-1">
          {selectedCandidate ? (
            <div className="bg-white rounded-3xl p-5 border border-indigo-100 shadow-lg space-y-4 animate-fade-in sticky top-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Talent Dossier</span>
                <button onClick={() => setSelectedCandidate(null)} className="text-gray-400 hover:text-gray-600">&times;</button>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-primary-600 to-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-md">
                  {selectedCandidate.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 text-base">{selectedCandidate.fullName}</h4>
                  <p className="text-xs text-gray-500 font-mono">{selectedCandidate.employeeNo}</p>
                </div>
              </div>

              <div className="text-xs space-y-2 pt-2 border-t border-gray-100">
                <div className="flex justify-between">
                  <span className="text-gray-500">Position:</span>
                  <span className="font-semibold text-gray-800">{selectedCandidate.currentPositionTitle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Department:</span>
                  <span className="font-medium text-gray-700">{selectedCandidate.departmentName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Job Grade:</span>
                  <span className="font-bold text-indigo-600">{selectedCandidate.currentJobGrade}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Current Salary:</span>
                  <span className="font-bold text-gray-900">&#x20B1;{selectedCandidate.currentSalary.toLocaleString()}</span>
                </div>
              </div>

              {/* Performance & KPI Meters */}
              <div className="bg-gray-50 rounded-2xl p-3.5 space-y-2.5 border border-gray-100">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 font-medium">KPI Score</span>
                    <strong className="text-emerald-600">{selectedCandidate.kpiScorePercent}%</strong>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.min(selectedCandidate.kpiScorePercent, 100)}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 font-medium">Overall Readiness</span>
                    <strong className="text-indigo-600">{selectedCandidate.readinessScore}%</strong>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${Math.min(selectedCandidate.readinessScore, 100)}%` }} />
                  </div>
                </div>

                <div className="flex justify-between text-xs pt-1">
                  <span className="text-gray-500">Tenure:</span>
                  <span className="font-semibold text-gray-800">{selectedCandidate.tenureMonths} Months</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Review Rating:</span>
                  <span className="font-semibold text-gray-800">⭐ {selectedCandidate.performanceRating || 'N/A'}</span>
                </div>
              </div>

              {/* Recommended Next Career Move */}
              <div className="p-3 bg-emerald-50/70 rounded-2xl border border-emerald-100 text-xs">
                <span className="font-semibold text-emerald-800 block mb-1">Suggested Promotion Move:</span>
                <p className="font-bold text-gray-900">{selectedCandidate.recommendedNextPositionTitle || 'At Department Ceiling'}</p>
                <p className="text-emerald-700 font-medium mt-1">
                  Target Salary: &#x20B1;{selectedCandidate.recommendedSalary.toLocaleString()} (+{selectedCandidate.projectedSalaryIncreasePercent}%)
                </p>
              </div>

              <div>
                <StatusBadge status={selectedCandidate.eligibilityStatus} className="w-full justify-center py-1 text-xs" />
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-8 border border-dashed border-gray-200 text-center text-gray-400">
              <span className="text-3xl block mb-2">👤</span>
              <p className="text-xs font-medium">Click on any employee chip in the 9-box grid to view their talent dossier, KPI profile, and career progression recommendations.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
