import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import api from '../lib/api'
import StatusBadge from '../components/ui/StatusBadge'
import DueForPromotionTab from '../components/promotions/DueForPromotionTab'
import KpiManagementTab from '../components/promotions/KpiManagementTab'
import TalentSight9BoxTab from '../components/promotions/TalentSight9BoxTab'
import PromotionParametersTab from '../components/promotions/PromotionParametersTab'

type Tab =
  | 'due-promotions'
  | 'kpis'
  | 'talent-sight'
  | 'criteria-config'
  | 'headcount'
  | 'org-chart'
  | 'competency'
  | 'performance'
  | 'disciplinary'
  | 'attrition'

const TABS: { key: Tab; label: string; icon: string; badge?: string }[] = [
  { key: 'due-promotions', label: 'Due for Promotion', icon: '🚀', badge: 'Active' },
  { key: 'kpis', label: 'KPI & Goals', icon: '🎯' },
  { key: 'talent-sight', label: '9-Box Talent Sight', icon: '👁️' },
  { key: 'criteria-config', label: 'Promotion Parameters', icon: '⚙️' },
  { key: 'headcount', label: 'Headcount', icon: '👥' },
  { key: 'org-chart', label: 'Org Chart', icon: '🏢' },
  { key: 'competency', label: 'Competency', icon: '📊' },
  { key: 'performance', label: 'Performance', icon: '⭐' },
  { key: 'disciplinary', label: 'Disciplinary', icon: '⚠️' },
  { key: 'attrition', label: 'Attrition', icon: '📉' },
]

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

export default function HrMatrix() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as Tab) || 'due-promotions'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  const handleTabChange = (key: Tab) => {
    setActiveTab(key)
    setSearchParams({ tab: key })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">HR Analytics &amp; Talent Matrix</h1>
        <p className="text-gray-500 text-sm mt-1">
          Integrated talent sight, KPI objective tracking, and automated promotion readiness evaluations.
        </p>
      </div>
      
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-1.5 overflow-x-auto pb-px">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-3.5 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-600 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'due-promotions' && <DueForPromotionTab />}
      {activeTab === 'kpis' && <KpiManagementTab />}
      {activeTab === 'talent-sight' && <TalentSight9BoxTab />}
      {activeTab === 'criteria-config' && <PromotionParametersTab />}
      {activeTab === 'headcount' && <HeadcountTab />}
      {activeTab === 'org-chart' && <OrgChartTab />}
      {activeTab === 'competency' && <CompetencyTab />}
      {activeTab === 'performance' && <PerformanceTab />}
      {activeTab === 'disciplinary' && <DisciplinaryTab />}
      {activeTab === 'attrition' && <AttritionTab />}
    </div>
  )
}

function HeadcountTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/hr-matrix/headcount').then(res => {
      setData(res.data.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
  if (!data) return <div className="text-gray-500">No data available</div>

  const chartData = (data.currentHeadcount || []).map((d: any) => ({
    name: d.DepartmentName,
    Total: d.Headcount,
    Regular: d.RegularCount,
    Probationary: d.ProbationaryCount,
    Contractual: d.ContractualCount,
  }))

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Active', value: chartData.reduce((s: number, d: any) => s + d.Total, 0), color: 'bg-blue-500' },
          { label: 'Regular', value: chartData.reduce((s: number, d: any) => s + d.Regular, 0), color: 'bg-green-500' },
          { label: 'Probationary', value: chartData.reduce((s: number, d: any) => s + d.Probationary, 0), color: 'bg-yellow-500' },
          { label: 'Contractual', value: chartData.reduce((s: number, d: any) => s + d.Contractual, 0), color: 'bg-purple-500' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow p-4">
            <div className={`h-1 ${card.color} rounded-t mb-3`}></div>
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-2xl font-bold text-gray-800">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Headcount by Department Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Headcount by Department</h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Regular" fill="#10B981" />
              <Bar dataKey="Probationary" fill="#F59E0B" />
              <Bar dataKey="Contractual" fill="#8B5CF6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Current Headcount Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">Current Headcount by Department</h3>
        </div>
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Regular</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Probationary</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Contractual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {chartData.map((d: any, i: number) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-6 py-3 text-sm font-medium text-gray-900">{d.name}</td>
                <td className="px-6 py-3 text-sm text-gray-700 text-right font-semibold">{d.Total}</td>
                <td className="px-6 py-3 text-sm text-gray-700 text-right">{d.Regular}</td>
                <td className="px-6 py-3 text-sm text-gray-700 text-right">{d.Probationary}</td>
                <td className="px-6 py-3 text-sm text-gray-700 text-right">{d.Contractual}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

function OrgChartTab() {
  const [orgData, setOrgData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/hr-matrix/org-chart').then(res => {
      setOrgData(res.data.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
  if (!orgData) return <div className="text-gray-500">No org chart data available</div>

  const renderNode = (node: any, level: number = 0) => {
    if (!node) return null
    return (
      <div key={node.Id} className="flex flex-col items-center">
        <div className={`bg-white border rounded-xl p-3 shadow-sm text-center ${level === 0 ? 'border-primary-300 bg-primary-50' : 'border-gray-200'}`} style={{ minWidth: 160 }}>
          <div className="text-sm font-semibold text-gray-800">{node.FirstName} {node.LastName}</div>
          <div className="text-xs text-gray-500">{node.PositionTitle}</div>
          <div className="text-xs text-gray-400">{node.DepartmentName}</div>
        </div>
        {node.children && node.children.length > 0 && (
          <>
            <div className="w-px h-4 bg-gray-300"></div>
            <div className="flex gap-4 relative">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-px bg-gray-300" style={{ width: `calc(100% - ${(node.children.length - 1) * 16}px)` }}></div>
              {node.children.map((child: any) => (
                <div key={child.Id} className="flex flex-col items-center pt-4">
                  <div className="w-px h-4 bg-gray-300"></div>
                  {renderNode(child, level + 1)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  const chartData = Array.isArray(orgData.orgChart) ? orgData.orgChart : [orgData.orgChart]

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow p-4">
        <p className="text-sm text-gray-500">Total Employees: <span className="font-semibold text-gray-800">{orgData.totalEmployees}</span></p>
      </div>
      <div className="bg-white rounded-xl shadow p-6 overflow-x-auto">
        <div className="flex justify-center gap-8 min-w-max pb-4">
          {chartData.map((root: any) => renderNode(root))}
        </div>
      </div>
    </div>
  )
}

function CompetencyTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/hr-matrix/competency').then(res => {
      setData(res.data.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
  if (!data) return <div className="text-gray-500">No competency data available</div>

  const matrix = data.competencyMatrix || []
  const skills = data.skills || []

  // Group by employee for the matrix view
  const employeeMap = new Map<string, any>()
  for (const entry of matrix) {
    const key = `${entry.EmployeeNo}-${entry.FirstName}-${entry.LastName}`
    if (!employeeMap.has(key)) {
      employeeMap.set(key, {
        name: `${entry.FirstName} ${entry.LastName}`,
        department: entry.DepartmentName,
        skills: {},
      })
    }
    employeeMap.get(key).skills[entry.SkillName] = entry.ProficiencyLevel
  }

  const employees = Array.from(employeeMap.values())

  // Skill distribution for chart
  const skillDist = skills.map((skill: string) => {
    const entries = matrix.filter((m: any) => m.SkillName === skill)
    const avg = entries.length > 0 ? entries.reduce((s: number, e: any) => s + e.ProficiencyLevel, 0) / entries.length : 0
    return { name: skill, avg: Math.round(avg * 10) / 10, count: entries.length }
  })

  const profColors = ['#EF4444', '#F59E0B', '#EAB308', '#3B82F6', '#10B981']

  return (
    <div className="space-y-6">
      {/* Average Proficiency Chart */}
      {skillDist.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Average Proficiency by Skill</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={skillDist}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 5]} />
              <Tooltip />
              <Bar dataKey="avg" fill="#3B82F6" name="Avg Level" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Competency Matrix Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">Competency Matrix</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-[180px] bg-gray-50">Department</th>
                {skills.map((skill: string) => (
                  <th key={skill} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{skill}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {employees.map((emp, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 sticky left-0 bg-white">{emp.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 sticky left-[180px] bg-white">{emp.department}</td>
                  {skills.map((skill: string) => {
                    const level = emp.skills[skill] || 0
                    return (
                      <td key={skill} className="px-4 py-3 text-center">
                        {level > 0 ? (
                          <span className={`inline-block w-8 h-8 rounded-full text-white text-sm font-semibold leading-8`} style={{ backgroundColor: profColors[level - 1] || '#9CA3AF' }}>
                            {level}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={2 + skills.length} className="px-6 py-8 text-center text-gray-500">No competency assessments recorded yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function PerformanceTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/hr-matrix/performance').then(res => {
      setData(res.data.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
  if (!data) return <div className="text-gray-500">No performance data available</div>

  const reviews = data.performanceReviews || []

  // Rating distribution
  const ratingDist = [
    { name: 'Outstanding (4.5-5)', count: reviews.filter((r: any) => r.Rating >= 4.5).length },
    { name: 'Exceeds (3.5-4.4)', count: reviews.filter((r: any) => r.Rating >= 3.5 && r.Rating < 4.5).length },
    { name: 'Meets (2.5-3.4)', count: reviews.filter((r: any) => r.Rating >= 2.5 && r.Rating < 3.5).length },
    { name: 'Below (1.5-2.4)', count: reviews.filter((r: any) => r.Rating >= 1.5 && r.Rating < 2.5).length },
    { name: 'Poor (<1.5)', count: reviews.filter((r: any) => r.Rating < 1.5).length },
  ].filter(d => d.count > 0)

  return (
    <div className="space-y-6">
      {/* Rating Distribution */}
      {ratingDist.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Rating Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={ratingDist} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#3B82F6" name="Reviews" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Reviews Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">Performance Reviews</h3>
        </div>
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Rating</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reviewer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {reviews.map((r: any, i: number) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-6 py-3 text-sm font-medium text-gray-900">{r.FirstName} {r.LastName}</td>
                <td className="px-6 py-3 text-sm text-gray-500">{r.DepartmentName}</td>
                <td className="px-6 py-3 text-sm text-gray-700">{r.ReviewPeriod}</td>
                <td className="px-6 py-3 text-sm text-center">
                  {r.Rating ? (
                    <span className={`font-semibold ${r.Rating >= 4 ? 'text-green-600' : r.Rating >= 3 ? 'text-blue-600' : r.Rating >= 2 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {Number(r.Rating).toFixed(1)}
                    </span>
                  ) : <span className="text-gray-400">N/A</span>}
                </td>
                <td className="px-6 py-3 text-sm text-gray-500">{r.ReviewerFirstName} {r.ReviewerLastName}</td>
                <td className="px-6 py-3 text-sm">
                  <StatusBadge status={r.Status} />
                </td>
              </tr>
            ))}
            {reviews.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">No performance reviews recorded yet</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

function DisciplinaryTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/hr-matrix/disciplinary').then(res => {
      setData(res.data.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
  if (!data) return <div className="text-gray-500">No disciplinary data available</div>

  const records = data.disciplinaryRecords || []

  // Category distribution for chart
  const catMap: Record<string, number> = {}
  records.forEach((r: any) => { catMap[r.Category] = (catMap[r.Category] || 0) + 1 })
  const catData = Object.entries(catMap).map(([name, count]) => ({ name, count }))

  return (
    <div className="space-y-6">
      {/* Category Distribution Chart */}
      {catData.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Records by Category</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={catData} cx="50%" cy="50%" outerRadius={90} dataKey="count" nameKey="name" label={({ name, count }: any) => `${name}: ${count}`}>
                {catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Records Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">Disciplinary Records</h3>
        </div>
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Incident Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action Taken</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {records.map((r: any, i: number) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-6 py-3 text-sm font-medium text-gray-900">{r.FirstName} {r.LastName}</td>
                <td className="px-6 py-3 text-sm text-gray-500">{r.DepartmentName}</td>
                <td className="px-6 py-3 text-sm text-gray-700">{r.IncidentDate ? new Date(r.IncidentDate).toLocaleDateString() : '-'}</td>
                <td className="px-6 py-3 text-sm text-gray-700">{r.Category}</td>
                <td className="px-6 py-3 text-sm text-gray-700 max-w-xs truncate">{r.ActionTaken}</td>
                <td className="px-6 py-3 text-sm">
                  <StatusBadge status={r.Status} />
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">No disciplinary records</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

function AttritionTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/hr-matrix/attrition').then(res => {
      setData(res.data.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
  if (!data) return <div className="text-gray-500">No attrition data available</div>

  const current = data.currentAttrition || []

  // Current attrition chart
  const chartData = current.map((d: any) => ({
    name: d.DepartmentName,
    Separations: d.Separations,
    Headcount: d.CurrentHeadcount,
    Rate: Number(d.AttritionRate).toFixed(1),
  }))

  return (
    <div className="space-y-6">
      {/* Current Attrition Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Current Attrition by Department (Last 30 Days)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="Headcount" fill="#3B82F6" name="Current Headcount" />
              <Bar yAxisId="left" dataKey="Separations" fill="#EF4444" name="Separations" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Attrition Rate Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {chartData.map((d: any, i: number) => (
          <div key={i} className="bg-white rounded-xl shadow p-4">
            <p className="text-sm text-gray-500">{d.name}</p>
            <p className="text-2xl font-bold text-gray-800">{d.Rate}%</p>
            <p className="text-xs text-gray-400">{d.Separations} separations / {d.Headcount} headcount</p>
          </div>
        ))}
        {chartData.length === 0 && (
          <div className="col-span-3 bg-white rounded-xl shadow p-8 text-center text-gray-500">No attrition data recorded yet</div>
        )}
      </div>

      {/* Historical Metrics Table */}
      {data.attritionMetrics && data.attritionMetrics.length > 0 && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800">Historical Attrition Metrics</h3>
          </div>
          <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Voluntary</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Involuntary</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.attritionMetrics.map((r: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm text-gray-700">{r.Year}</td>
                  <td className="px-6 py-3 text-sm text-gray-700">{r.Month}</td>
                  <td className="px-6 py-3 text-sm text-gray-900">{r.DepartmentName}</td>
                  <td className="px-6 py-3 text-sm text-gray-700 text-right">{r.VoluntarySeparations}</td>
                  <td className="px-6 py-3 text-sm text-gray-700 text-right">{r.InvoluntarySeparations}</td>
                  <td className="px-6 py-3 text-sm text-right font-semibold">{Number(r.AttritionRatePercent).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
