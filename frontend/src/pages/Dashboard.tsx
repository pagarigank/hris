import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

interface DashboardData {
  headcount: {
    TotalEmployees: number
    ActiveEmployees: number
    RegularEmployees: number
    ProbationaryEmployees: number
    ContractualEmployees: number
    NewHiresLastMonth: number
    SeparationsLastMonth: number
  }
  departmentCount: number
  headcountByDepartment: Array<{ DepartmentName: string; Headcount: number }>
  employmentStatusBreakdown: Array<{ name: string; value: number }>
  pendingLeaveRequests: number
  pendingOvertimeRequests: number
  currentPayrollStatus: string | null
  clockInsToday: number
}

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
        <div className="h-4 w-64 bg-gray-100 rounded mt-2 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
                <div className="h-7 w-12 bg-gray-200 rounded animate-pulse" />
              </div>
              <div className="h-10 w-10 bg-gray-200 rounded-lg animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [promoSummary, setPromoSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const [res, promoRes] = await Promise.all([
        api.get('/hr-matrix/dashboard'),
        api.get('/promotions/due').catch(() => ({ data: { data: { summary: null } } }))
      ])
      setData(res.data.data)
      if (promoRes?.data?.data?.summary) {
        setPromoSummary(promoRes.data.data.summary)
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <LoadingSkeleton />
  }

  const statCards = [
    { label: 'Total Employees', value: data?.headcount?.TotalEmployees || 0, icon: '👥', accent: 'bg-primary-500', onClick: () => navigate('/employees') },
    { label: 'Active Employees', value: data?.headcount?.ActiveEmployees || 0, icon: '✅', accent: 'bg-emerald-500', onClick: () => navigate('/employees') },
    { label: 'Departments', value: data?.departmentCount || 0, icon: '🏢', accent: 'bg-violet-500', onClick: () => navigate('/org-structure/departments') },
    { label: 'New Hires', value: data?.headcount?.NewHiresLastMonth || 0, icon: '🆕', accent: 'bg-teal-500', onClick: () => navigate('/employees') },
    { label: 'Separations', value: data?.headcount?.SeparationsLastMonth || 0, icon: '👋', accent: 'bg-rose-500', onClick: () => navigate('/onboarding/offboarding') },
    { label: 'Pending Leaves', value: data?.pendingLeaveRequests || 0, icon: '📅', accent: 'bg-amber-500', onClick: () => navigate('/leave') },
    { label: 'Pending OT', value: data?.pendingOvertimeRequests || 0, icon: '⏰', accent: 'bg-orange-500', onClick: () => navigate('/attendance') },
    { label: 'Clocked In Today', value: data?.clockInsToday || 0, icon: '📱', accent: 'bg-indigo-500', onClick: () => navigate('/attendance') },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight" style={{ textWrap: 'balance' }}>Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1" style={{ textWrap: 'pretty' }}>Welcome to HRIS Philippines</p>
      </div>

      {/* Promotion & KPI Talent Radar Banner */}
      {promoSummary && (
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 rounded-2xl p-5 text-white shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-2xl shadow-inner">
              🚀
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 text-white">
                  Talent Radar
                </span>
                <span className="text-xs text-emerald-100">&bull; Promotion &amp; KPI Engine</span>
              </div>
              <h3 className="text-lg font-bold mt-1">
                {promoSummary.dueCount > 0
                  ? `${promoSummary.dueCount} Employee${promoSummary.dueCount > 1 ? 's' : ''} currently Due for Promotion`
                  : 'All Promotion Candidates Monitored on Track'}
              </h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                {promoSummary.highPotentialCount} High Potentials &bull; &#x20B1;{Number(promoSummary.totalProjectedBudgetImpact || 0).toLocaleString()} projected salary increment budget
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate('/hr-matrix?tab=due-promotions')}
            className="px-4 py-2 bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>Review Eligible Candidates</span>
            <span>&rarr;</span>
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <button
            key={card.label}
            onClick={card.onClick}
            className="bg-white rounded-xl p-4 border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all duration-150 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide" style={{ textWrap: 'pretty' }}>{card.label}</p>
                <p className="text-2xl font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{card.value}</p>
              </div>
              <div className={`${card.accent} p-2.5 rounded-xl text-white text-lg shadow-sm group-hover:scale-110 transition-transform duration-150`}>
                {card.icon}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Headcount by Department */}
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4" style={{ textWrap: 'balance' }}>Headcount by Department</h2>
          {data?.headcountByDepartment && data.headcountByDepartment.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.headcountByDepartment} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="DepartmentName" tick={{ fontSize: 11 }} interval={0} angle={-45} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Bar dataKey="Headcount" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
              No department data available
            </div>
          )}
        </div>

        {/* Employment Status Breakdown */}
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4" style={{ textWrap: 'balance' }}>Employment Status</h2>
          {data?.employmentStatusBreakdown && data.employmentStatusBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.employmentStatusBreakdown}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {data.employmentStatusBreakdown.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
              No employment data available
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4" style={{ textWrap: 'balance' }}>Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: '⏰', label: 'Clock In/Out', href: '/attendance' },
            { icon: '📅', label: 'Request Leave', href: '/leave' },
            { icon: '💰', label: 'View Payslip', href: '/payroll' },
            { icon: '📋', label: 'My DTR', href: '/attendance' },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.href)}
              className="p-4 bg-gray-50 hover:bg-gray-100 rounded-xl text-left transition-all duration-150 hover:shadow-sm group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
            >
              <span className="text-2xl group-hover:scale-110 transition-transform duration-150 inline-block">{action.icon}</span>
              <p className="font-medium text-gray-700 mt-2 text-sm" style={{ textWrap: 'pretty' }}>{action.label}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
