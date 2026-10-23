import { useState, useEffect } from 'react'
import { Routes, Route, Link, useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import dayjs from 'dayjs'

function downloadPdf(url: string, filename: string) {
  api.get(url, { responseType: 'blob' }).then(res => {
    const blob = new Blob([res.data], { type: 'application/pdf' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    link.click()
    URL.revokeObjectURL(link.href)
  }).catch(err => alert(err.response?.data?.error?.message || 'Failed to download PDF'))
}

interface PayrollPeriod {
  Id: string
  PeriodStart: string
  PeriodEnd: string
  PayDate: string
  PayFrequency: string
  Status: string
  runs?: PayrollRun[]
}

interface PayrollRun {
  Id: string
  RunDate: string
  Status: string
  TotalGrossPay: number
  TotalNetPay: number
  TotalEmployerCost: number
  payslipCount?: number
}

interface Payslip {
  Id: string
  BasicPay: number
  TotalWorkedDays: number
  AbsentDeduction: number
  LateDeduction: number
  UndertimeDeduction: number
  OvertimePay: number
  NightDiffPay: number
  HolidayPay: number
  RestDayPremium: number
  Allowances: number
  DeMinimisBenefits: number
  GrossPay: number
  SssEmployeeShare: number
  SssEmployerShare: number
  SssMPFEmployee: number
  SssMPFEmployer: number
  PhilHealthEmployeeShare: number
  PhilHealthEmployerShare: number
  PagIbigEmployeeShare: number
  PagIbigEmployerShare: number
  WithholdingTax: number
  ThirteenthMonthPayAccrual: number
  LoanDeductions: number
  OtherDeductions: number
  TotalDeductions: number
  NetPay: number
  EmployeeNo: string
  FirstName: string
  LastName: string
  MiddleName: string
  TIN: string
  SssNo: string
  PhilHealthNo: string
  PagIbigNo: string
  PeriodStart: string
  PeriodEnd: string
  PayDate: string
  PayFrequency: string
}

interface LineItem {
  Id: string
  ItemType: string
  Code: string
  Description: string
  Amount: number
}

interface Loan {
  Id: string
  LoanType: string
  PrincipalAmount: number
  MonthlyAmortization: number
  RemainingBalance: number
  StartDate: string
  EndDate: string
  EmployeeNo: string
  FirstName: string
  LastName: string
}

interface ThirteenthMonthRecord {
  Id: string
  Year: number
  TotalBasicSalaryEarned: number
  ComputedAmount: number
  PaidDate: string
  PayoutStatus: string
  EmployeeNo: string
  FirstName: string
  LastName: string
}

interface GovReport {
  Id: string
  ReportType: string
  PeriodCovered: string
  FileUrl: string
  GeneratedAtUtc: string
}

const STATUS_COLORS: Record<string, string> = {
  Open: 'bg-blue-100 text-blue-800',
  Processing: 'bg-yellow-100 text-yellow-800',
  Approved: 'bg-green-100 text-green-800',
  Paid: 'bg-purple-100 text-purple-800',
  Closed: 'bg-gray-100 text-gray-600',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

function PayrollList() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'periods' | 'payslips'>('periods')

  useEffect(() => {
    if (activeTab === 'periods') fetchPeriods()
    else fetchPayslips()
  }, [activeTab])

  const fetchPeriods = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/payroll/periods')
      setPeriods(data.data?.payrollPeriods || [])
    } catch (error) {
      console.error('Failed to fetch payroll periods:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPayslips = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/payroll/payslips')
      setPayslips(data.data?.payslips || [])
    } catch (error) {
      console.error('Failed to fetch payslips:', error)
    } finally {
      setLoading(false)
    }
  }

  const [payslips, setPayslips] = useState<Payslip[]>([])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Payroll</h1>
        <p className="text-gray-500">Manage payroll periods, runs, and payslips</p>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {(['periods', 'payslips'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === tab ? 'border-primary-600 text-primary-600 bg-primary-50 rounded-t-lg' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab === 'periods' ? 'Payroll Periods' : 'All Payslips'}
          </button>
        ))}
      </div>

      {activeTab === 'periods' ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Payroll Periods</h2>
            <Link to="/payroll/new" className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
              New Period
            </Link>
          </div>
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Range</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pay Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {periods.map((period) => (
                    <tr key={period.Id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-medium">{period.PayFrequency}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                        {dayjs(period.PeriodStart).format('MMM D')} - {dayjs(period.PeriodEnd).format('MMM D, YYYY')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700">{dayjs(period.PayDate).format('MMM D, YYYY')}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={period.Status} /></td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Link to={`/payroll/${period.Id}`} className="text-primary-600 hover:text-primary-900 text-sm font-medium">View</Link>
                      </td>
                    </tr>
                  ))}
                  {periods.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No payroll periods found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Basic Pay</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gross Pay</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Deductions</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net Pay</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payslips.map((p) => (
                    <tr key={p.Id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-medium">{p.LastName}, {p.FirstName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700 text-sm">
                        {dayjs(p.PeriodStart).format('MMM D')} - {dayjs(p.PeriodEnd).format('MMM D, YYYY')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700 text-right">₱{(p.BasicPay || 0).toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700 text-right">₱{(p.GrossPay || 0).toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-red-600 text-right">-₱{(p.TotalDeductions || 0).toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-green-600 text-right font-semibold">₱{(p.NetPay || 0).toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Link to={`/payroll/payslip/${p.Id}`} className="text-primary-600 hover:text-primary-900 text-sm font-medium">View</Link>
                      </td>
                    </tr>
                  ))}
                  {payslips.length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">No payslips found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NewPayrollPeriod() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ periodStart: '', periodEnd: '', payDate: '', payFrequency: 'Monthly' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/payroll/period', form)
      navigate('/payroll')
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create period')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/payroll" className="text-primary-600 hover:text-primary-700 text-sm font-medium">← Back to Payroll</Link>
      <h1 className="text-2xl font-bold text-gray-800">New Payroll Period</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-xl">
        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period Start</label>
            <input type="date" required value={form.periodStart} onChange={e => setForm({...form, periodStart: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period End</label>
            <input type="date" required value={form.periodEnd} onChange={e => setForm({...form, periodEnd: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pay Date</label>
            <input type="date" required value={form.payDate} onChange={e => setForm({...form, payDate: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pay Frequency</label>
            <select value={form.payFrequency} onChange={e => setForm({...form, payFrequency: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500">
              <option value="Monthly">Monthly</option>
              <option value="SemiMonthly">Semi-Monthly</option>
              <option value="Weekly">Weekly</option>
              <option value="Daily">Daily</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button type="submit" disabled={loading}
            className="bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
            {loading ? 'Creating...' : 'Create Period'}
          </button>
          <Link to="/payroll" className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition">Cancel</Link>
        </div>
      </form>
    </div>
  )
}

function PayrollPeriodDetail() {
  const { id } = useParams<{ id: string }>()
  const [period, setPeriod] = useState<PayrollPeriod | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { fetchPeriod() }, [id])

  const fetchPeriod = async () => {
    try {
      const { data } = await api.get(`/payroll/periods/${id}`)
      setPeriod(data.data?.period || data.data)
    } catch (error) {
      console.error('Failed to fetch period:', error)
    } finally {
      setLoading(false)
    }
  }

  const runPayroll = async () => {
    if (!confirm('Run payroll for this period?')) return
    setActionLoading(true)
    try {
      await api.post('/payroll/run', { payrollPeriodId: id })
      setMessage('Payroll run completed successfully')
      fetchPeriod()
    } catch (err: any) {
      setMessage(err.response?.data?.error?.message || 'Failed to run payroll')
    } finally {
      setActionLoading(false)
    }
  }

  const updateStatus = async (newStatus: string) => {
    if (!confirm(`Change status to ${newStatus}?`)) return
    setActionLoading(true)
    try {
      await api.patch(`/payroll/periods/${id}/status`, { status: newStatus })
      setMessage(`Status updated to ${newStatus}`)
      fetchPeriod()
    } catch (err: any) {
      setMessage(err.response?.data?.error?.message || 'Failed to update status')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
  if (!period) return <div className="text-center text-gray-500 p-8">Period not found</div>

  return (
    <div className="space-y-6">
      <Link to="/payroll" className="text-primary-600 hover:text-primary-700 text-sm font-medium">← Back to Payroll</Link>

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Payroll Period Detail</h1>
          <p className="text-gray-500">{dayjs(period.PeriodStart).format('MMM D')} - {dayjs(period.PeriodEnd).format('MMM D, YYYY')}</p>
        </div>
        <StatusBadge status={period.Status} />
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.includes('success') || message.includes('updated') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Pay Frequency</p>
          <p className="text-lg font-semibold text-gray-800 mt-1">{period.PayFrequency}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Pay Date</p>
          <p className="text-lg font-semibold text-gray-800 mt-1">{dayjs(period.PayDate).format('MMM D, YYYY')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Status</p>
          <p className="text-lg font-semibold text-gray-800 mt-1">{period.Status}</p>
        </div>
      </div>

      {period.Status === 'Open' && (
        <button onClick={runPayroll} disabled={actionLoading}
          className="bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
          {actionLoading ? 'Running...' : 'Run Payroll'}
        </button>
      )}

      {period.Status === 'Processing' && (
        <button onClick={() => updateStatus('Approved')} disabled={actionLoading}
          className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
          {actionLoading ? 'Approving...' : 'Approve Payroll'}
        </button>
      )}

      {period.Status === 'Approved' && (
        <button onClick={() => updateStatus('Paid')} disabled={actionLoading}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
          {actionLoading ? 'Updating...' : 'Mark as Paid'}
        </button>
      )}

      {period.Status === 'Paid' && (
        <button onClick={() => updateStatus('Closed')} disabled={actionLoading}
          className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
          {actionLoading ? 'Closing...' : 'Close Period'}
        </button>
      )}

      {period.runs && period.runs.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800">Payroll Runs</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Run Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gross Pay</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net Pay</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {period.runs.map(run => (
                  <tr key={run.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-700">{dayjs(run.RunDate).format('MMM D, YYYY h:mm A')}</td>
                    <td className="px-6 py-4"><StatusBadge status={run.Status} /></td>
                    <td className="px-6 py-4 text-right text-gray-700">₱{(run.TotalGrossPay || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-green-600 font-semibold">₱{(run.TotalNetPay || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">
                      <Link to={`/payroll/run/${run.Id}`} className="text-primary-600 hover:text-primary-900 text-sm font-medium">View Run</Link>
                    </td>
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

function PayrollRunDetail() {
  const { id } = useParams<{ id: string }>()
  const [run, setRun] = useState<PayrollRun | null>(null)
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [id])

  const fetchData = async () => {
    try {
      const [runRes, payslipsRes] = await Promise.all([
        api.get(`/payroll/runs/${id}`),
        api.get(`/payroll/runs/${id}/payslips`)
      ])
      setRun(runRes.data.data)
      setPayslips(payslipsRes.data.data?.payslips || [])
    } catch (error) {
      console.error('Failed to fetch run:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
  if (!run) return <div className="text-center text-gray-500 p-8">Run not found</div>

  return (
    <div className="space-y-6">
      <Link to="/payroll" className="text-primary-600 hover:text-primary-700 text-sm font-medium">← Back to Payroll</Link>
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Payroll Run</h1>
          <p className="text-gray-500">Run on {dayjs(run.RunDate).format('MMM D, YYYY h:mm A')}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={run.Status} />
          <button onClick={() => downloadPdf(`/payroll/summary/${id}/pdf`, `payroll-summary-${dayjs(run.RunDate).format('YYYY-MM-DD')}.pdf`)}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            Download Summary PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Gross Pay</p>
          <p className="text-lg font-semibold text-gray-800 mt-1">₱{(run.TotalGrossPay || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Net Pay</p>
          <p className="text-lg font-semibold text-green-600 mt-1">₱{(run.TotalNetPay || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Employer Cost</p>
          <p className="text-lg font-semibold text-gray-800 mt-1">₱{(run.TotalEmployerCost || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Payslips</p>
          <p className="text-lg font-semibold text-gray-800 mt-1">{payslips.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Payslips</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Basic Pay</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gross</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Deductions</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net Pay</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payslips.map(p => (
                <tr key={p.Id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-900 font-medium">{p.LastName}, {p.FirstName}</td>
                  <td className="px-6 py-4 text-right text-gray-700">₱{(p.BasicPay || 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-gray-700">₱{(p.GrossPay || 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-red-600">-₱{(p.TotalDeductions || 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-green-600 font-semibold">₱{(p.NetPay || 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/payroll/payslip/${p.Id}`} className="text-primary-600 hover:text-primary-900 text-sm font-medium">Detail</Link>
                  </td>
                </tr>
              ))}
              {payslips.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No payslips</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function PayslipDetail() {
  const { id } = useParams<{ id: string }>()
  const [payslip, setPayslip] = useState<Payslip | null>(null)
  const [lineItems, setLineItems] = useState<{ earnings: LineItem[]; deductions: LineItem[] }>({ earnings: [], deductions: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [id])

  const fetchData = async () => {
    try {
      const [payslipRes, itemsRes] = await Promise.all([
        api.get(`/payroll/payslips/${id}`),
        api.get(`/payroll/payslips/${id}/line-items`)
      ])
      setPayslip(payslipRes.data.data)
      setLineItems(itemsRes.data.data || { earnings: [], deductions: [] })
    } catch (error) {
      console.error('Failed to fetch payslip:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
  if (!payslip) return <div className="text-center text-gray-500 p-8">Payslip not found</div>

  return (
    <div className="space-y-6">
      <Link to="/payroll" className="text-primary-600 hover:text-primary-700 text-sm font-medium">← Back to Payroll</Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Payslip</h1>
            <p className="text-gray-500">{payslip.FirstName} {payslip.LastName} ({payslip.EmployeeNo})</p>
          </div>
          <div className="flex items-start gap-4">
            <div className="text-right text-sm text-gray-500">
              <p>{dayjs(payslip.PeriodStart).format('MMM D')} - {dayjs(payslip.PeriodEnd).format('MMM D, YYYY')}</p>
              <p>Pay Date: {dayjs(payslip.PayDate).format('MMM D, YYYY')}</p>
            </div>
            <button onClick={() => downloadPdf(`/payroll/payslips/${id}/pdf`, `payslip-${payslip.EmployeeNo}.pdf`)}
              className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap">
              Download PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
          <div><span className="text-gray-500">TIN:</span> <span className="font-medium">{payslip.TIN || 'N/A'}</span></div>
          <div><span className="text-gray-500">SSS:</span> <span className="font-medium">{payslip.SssNo || 'N/A'}</span></div>
          <div><span className="text-gray-500">PhilHealth:</span> <span className="font-medium">{payslip.PhilHealthNo || 'N/A'}</span></div>
          <div><span className="text-gray-500">Pag-IBIG:</span> <span className="font-medium">{payslip.PagIbigNo || 'N/A'}</span></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Earnings</h3>
            <div className="space-y-2">
              {lineItems.earnings.map(item => (
                <div key={item.Id} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.Description}</span>
                  <span className="font-medium text-gray-800">₱{item.Amount.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
                <span className="text-gray-800">Gross Pay</span>
                <span className="text-gray-800">₱{payslip.GrossPay.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3">Deductions</h3>
            <div className="space-y-2">
              {lineItems.deductions.map(item => (
                <div key={item.Id} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.Description}</span>
                  <span className="font-medium text-red-600">-₱{item.Amount.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
                <span className="text-gray-800">Total Deductions</span>
                <span className="text-red-600">-₱{payslip.TotalDeductions.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-green-50 rounded-lg">
          <div className="flex justify-between">
            <span className="text-lg font-bold text-green-800">Net Pay</span>
            <span className="text-lg font-bold text-green-800">₱{payslip.NetPay.toLocaleString()}</span>
          </div>
        </div>

        <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-gray-500">13th Month Accrual:</span> <span className="font-medium">₱{payslip.ThirteenthMonthPayAccrual.toLocaleString()}</span></div>
            <div><span className="text-gray-500">Days Worked:</span> <span className="font-medium">{payslip.TotalWorkedDays}</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmployeeLoans() {
  const [loans, setLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ employeeId: '', loanType: 'SSS', principalAmount: 0, monthlyAmortization: 0, startDate: '' })
  const [submitting, setSubmitting] = useState(false)
  const [employees, setEmployees] = useState<{ Id: string; EmployeeNo: string; FirstName: string; LastName: string }[]>([])

  useEffect(() => { fetchLoans(); fetchEmployees() }, [])

  const fetchEmployees = async () => {
    try {
      const { data } = await api.get('/employees')
      setEmployees(data.data?.employees || [])
    } catch (error) {
      console.error('Failed to fetch employees:', error)
    }
  }

  const fetchLoans = async () => {
    try {
      const { data } = await api.get('/payroll/loans')
      setLoans(data.data?.loans || [])
    } catch (error) {
      console.error('Failed to fetch loans:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post('/payroll/loans', form)
      setShowForm(false)
      setForm({ employeeId: '', loanType: 'SSS', principalAmount: 0, monthlyAmortization: 0, startDate: '' })
      fetchLoans()
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to create loan')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Employee Loans</h1>
          <p className="text-gray-500">Manage employee loan amortizations</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
          {showForm ? 'Cancel' : 'New Loan'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
              <select required value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Select employee...</option>
                {employees.map(emp => (
                  <option key={emp.Id} value={emp.Id}>{emp.LastName}, {emp.FirstName} ({emp.EmployeeNo})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loan Type</label>
                <select value={form.loanType} onChange={e => setForm({...form, loanType: e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="SSS">SSS</option>
                <option value="PagIbig">Pag-IBIG</option>
                <option value="GSIS_Conso">GSIS Consolidation</option>
                <option value="GSIS_Policy">GSIS Policy</option>
                <option value="GSIS_Enhanced">GSIS Enhanced</option>
                <option value="GSIS_Emergency">GSIS Emergency</option>
                <option value="CompanyLoan">Company Loan</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Principal Amount</label>
              <input type="number" required step="0.01" min="0" value={form.principalAmount || ''} onChange={e => setForm({...form, principalAmount: parseFloat(e.target.value) || 0})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Amortization</label>
              <input type="number" required step="0.01" min="0" value={form.monthlyAmortization || ''} onChange={e => setForm({...form, monthlyAmortization: parseFloat(e.target.value) || 0})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" required value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="mt-4">
            <button type="submit" disabled={submitting}
              className="bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
              {submitting ? 'Creating...' : 'Create Loan'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {loading ? (
          <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Loan Type</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Principal</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monthly Amort.</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Remaining</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loans.map(loan => (
                  <tr key={loan.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-900 font-medium">{loan.LastName}, {loan.FirstName}</td>
                    <td className="px-6 py-4 text-gray-700">{loan.LoanType}</td>
                    <td className="px-6 py-4 text-right text-gray-700">₱{loan.PrincipalAmount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-gray-700">₱{loan.MonthlyAmortization.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-gray-700">₱{loan.RemainingBalance.toLocaleString()}</td>
                    <td className="px-6 py-4 text-gray-700">{dayjs(loan.StartDate).format('MMM D, YYYY')}</td>
                  </tr>
                ))}
                {loans.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No active loans</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function ThirteenthMonthPay() {
  const [records, setRecords] = useState<ThirteenthMonthRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [year, setYear] = useState(new Date().getFullYear())

  useEffect(() => { fetchRecords() }, [year])

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/payroll/thirteenth-month', { params: { year } })
      setRecords(data.data?.records || [])
    } catch (error) {
      console.error('Failed to fetch 13th month:', error)
    } finally {
      setLoading(false)
    }
  }

  const compute13thMonth = async () => {
    if (!confirm(`Compute 13th month pay for ${year}?`)) return
    setComputing(true)
    try {
      const { data } = await api.post('/payroll/thirteenth-month/compute', { year })
      alert(data.data?.message || 'Computation complete')
      fetchRecords()
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to compute')
    } finally {
      setComputing(false)
    }
  }

  const totalComputed = records.reduce((sum, r) => sum + (r.ComputedAmount || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">13th Month Pay</h1>
          <p className="text-gray-500">PD 851 — Mandatory annual benefit</p>
        </div>
        <div className="flex gap-3">
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => downloadPdf(`/payroll/thirteenth-month/${year}/pdf`, `13th-month-${year}.pdf`)}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition">
            Download PDF
          </button>
          <button onClick={compute13thMonth} disabled={computing}
            className="bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
            {computing ? 'Computing...' : 'Compute 13th Month'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <p className="text-sm text-gray-500">Total Computed Amount ({year})</p>
        <p className="text-2xl font-bold text-gray-800">₱{totalComputed.toLocaleString()}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {loading ? (
          <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Basic Earned</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">13th Month</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map(r => (
                  <tr key={r.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-900 font-medium">{r.LastName}, {r.FirstName}</td>
                    <td className="px-6 py-4 text-right text-gray-700">₱{(r.TotalBasicSalaryEarned || 0).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-green-600 font-semibold">₱{(r.ComputedAmount || 0).toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={r.PayoutStatus || 'Pending'} />
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No records. Click "Compute 13th Month" to generate.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

interface PeraEnrollment {
  Id: string
  EmployeeId: string
  IsEnrolled: boolean
  EnrolledDate: string
  ContributionType: string
  EmployeeContributionAmount: number
  EmployerMatchType: string | null
  EmployerMatchValue: number | null
  EmployerMatchMaxCap: number | null
  PERAAdministratorId: string | null
  PERAAccountNo: string | null
  EmployeeNo: string
  FirstName: string
  LastName: string
}

interface PeraContribution {
  Id: string
  EmployeeId: string
  ContributionDate: string
  EmployeeContribution: number
  EmployerContribution: number
  ContributionYear: number
  ContributionMonth: number
  EmployeeNo: string
  FirstName: string
  LastName: string
}

interface PeraSummary {
  employeeId: string
  year: number
  ytdEmployeeShare: number
  ytdEmployerShare: number
  contributionCount: number
  annualLimitLocal: number
  annualLimitOfw: number
  remainingLimitLocal: number
}

function PERAManagement() {
  const [enrollments, setEnrollments] = useState<PeraEnrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'enrollments' | 'contributions'>('enrollments')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ employeeId: '', contributionType: 'Fixed', employeeContributionAmount: 0, employerMatchType: '', employerMatchValue: 0, employerMatchMaxCap: 0, peraAdministratorId: '', peraAccountNo: '' })
  const [message, setMessage] = useState('')
  const [contributions, setContributions] = useState<PeraContribution[]>([])
  const [summary, setSummary] = useState<PeraSummary | null>(null)
  const [summaryEmpId, setSummaryEmpId] = useState('')
  const [summaryYear, setSummaryYear] = useState(new Date().getFullYear())
  const [employees, setEmployees] = useState<{ Id: string; EmployeeNo: string; FirstName: string; LastName: string }[]>([])

  useEffect(() => {
    if (activeTab === 'enrollments') {
      fetchEnrollments()
      fetchEmployees()
    } else {
      fetchContributions()
    }
  }, [activeTab])

  const fetchEnrollments = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/payroll/pera/enrollments')
      setEnrollments(data.data?.enrollments || [])
    } catch (error) {
      console.error('Failed to fetch PERA enrollments:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchEmployees = async () => {
    try {
      const { data } = await api.get('/employees')
      setEmployees(data.data?.employees || [])
    } catch (error) {
      console.error('Failed to fetch employees:', error)
    }
  }

  const fetchContributions = async (empId?: string) => {
    setLoading(true)
    try {
      const params: any = { year: summaryYear }
      if (empId) params.employeeId = empId
      const { data } = await api.get('/payroll/pera/contributions', { params })
      setContributions(data.data?.contributions || [])
    } catch (error) {
      console.error('Failed to fetch contributions:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSummary = async (empId: string) => {
    try {
      const { data } = await api.get(`/payroll/pera/contributions/${empId}/summary`, { params: { year: summaryYear } })
      setSummary(data.data)
    } catch (error) {
      console.error('Failed to fetch PERA summary:', error)
    }
  }

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/payroll/pera/enroll', {
        employeeId: form.employeeId,
        contributionType: form.contributionType,
        employeeContributionAmount: form.employeeContributionAmount,
        employerMatchType: form.employerMatchType || null,
        employerMatchValue: form.employerMatchValue || null,
        employerMatchMaxCap: form.employerMatchMaxCap || null,
        peraAdministratorId: form.peraAdministratorId || null,
        peraAccountNo: form.peraAccountNo || null,
      })
      setShowForm(false)
      setForm({ employeeId: '', contributionType: 'Fixed', employeeContributionAmount: 0, employerMatchType: '', employerMatchValue: 0, employerMatchMaxCap: 0, peraAdministratorId: '', peraAccountNo: '' })
      setMessage('PERA enrollment saved')
      fetchEnrollments()
    } catch (error: any) {
      setMessage(error.response?.data?.error?.message || 'Failed to enroll')
    }
  }

  const handleUnenroll = async (id: string) => {
    if (!confirm('Unenroll this employee from PERA?')) return
    try {
      await api.delete(`/payroll/pera/enrollments/${id}`)
      setMessage('Employee unenrolled from PERA')
      fetchEnrollments()
    } catch (error: any) {
      setMessage(error.response?.data?.error?.message || 'Failed to unenroll')
    }
  }

  const handleSummaryLookup = () => {
    if (summaryEmpId) {
      fetchSummary(summaryEmpId)
    }
  }

  const unenrolledEmployees = employees.filter(emp => !enrollments.some(e => e.EmployeeId === emp.Id && e.IsEnrolled))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">PERA Management</h1>
        <p className="text-gray-500">Personal Equity and Retirement Account (RA 9505) — Voluntary retirement savings</p>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {message}
          <button onClick={() => setMessage('')} className="float-right font-bold">&times;</button>
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200">
        {(['enrollments', 'contributions'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === tab ? 'border-primary-600 text-primary-600 bg-primary-50 rounded-t-lg' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}>
            {tab === 'enrollments' ? 'Enrollments' : 'Contributions'}
          </button>
        ))}
      </div>

      {activeTab === 'enrollments' ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Enrolled Employees</h2>
            <button onClick={() => { setShowForm(!showForm); setMessage('') }}
              className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
              {showForm ? 'Cancel' : 'Enroll Employee'}
            </button>
          </div>

          {showForm && (
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <form onSubmit={handleEnroll} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                  <select value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required>
                    <option value="">Select employee...</option>
                    {unenrolledEmployees.map(emp => (
                      <option key={emp.Id} value={emp.Id}>{emp.LastName}, {emp.FirstName} ({emp.EmployeeNo})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contribution Amount (₱)</label>
                  <input type="number" step="0.01" value={form.employeeContributionAmount}
                    onChange={e => setForm({ ...form, employeeContributionAmount: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employer Match Type</label>
                  <select value={form.employerMatchType} onChange={e => setForm({ ...form, employerMatchType: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">No match</option>
                    <option value="Fixed">Fixed Amount</option>
                    <option value="Percentage">Percentage</option>
                  </select>
                </div>
                {form.employerMatchType && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {form.employerMatchType === 'Fixed' ? 'Match Amount (₱)' : 'Match Percentage (%)'}
                    </label>
                    <input type="number" step="0.01" value={form.employerMatchValue}
                      onChange={e => setForm({ ...form, employerMatchValue: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                )}
                {form.employerMatchType && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Match Max Cap (₱)</label>
                    <input type="number" step="0.01" value={form.employerMatchMaxCap}
                      onChange={e => setForm({ ...form, employerMatchMaxCap: parseFloat(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PERA Account No</label>
                  <input type="text" value={form.peraAccountNo}
                    onChange={e => setForm({ ...form, peraAccountNo: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex items-end">
                  <button type="submit" className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg font-medium text-sm transition">
                    Enroll
                  </button>
                </div>
              </form>
            </div>
          )}

          {loading ? (
            <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">EE Contribution</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Employer Match</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Match Cap</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {enrollments.filter(e => e.IsEnrolled).map(e => (
                    <tr key={e.Id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-medium">{e.LastName}, {e.FirstName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700 text-right">₱{(e.EmployeeContributionAmount || 0).toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700 text-right">{e.EmployerMatchType ? `${e.EmployerMatchType === 'Fixed' ? '₱' : ''}${e.EmployerMatchValue || 0}${e.EmployerMatchType === 'Percentage' ? '%' : ''}` : 'None'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700 text-right">{e.EmployerMatchMaxCap ? `₱${e.EmployerMatchMaxCap.toLocaleString()}` : 'N/A'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center"><span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Enrolled</span></td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button onClick={() => handleUnenroll(e.Id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Unenroll</button>
                      </td>
                    </tr>
                  ))}
                  {enrollments.filter(e => e.IsEnrolled).length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No enrolled employees</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                <select value={summaryYear} onChange={e => { setSummaryYear(parseInt(e.target.value)); setSummary(null) }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                <select value={summaryEmpId} onChange={e => setSummaryEmpId(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">All employees</option>
                  {employees.map(emp => (
                    <option key={emp.Id} value={emp.Id}>{emp.LastName}, {emp.FirstName}</option>
                  ))}
                </select>
              </div>
              <button onClick={handleSummaryLookup}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                View Summary
              </button>
              <button onClick={() => downloadPdf(`/payroll/government-reports/PERA_Summary/pdf?periodCovered=${summaryYear}`, `PERA-Summary-${summaryYear}.pdf`)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition">
                Export PDF
              </button>
            </div>

            {summary && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span className="text-gray-500">YTD Employee Share:</span> <span className="font-medium">₱{summary.ytdEmployeeShare.toLocaleString()}</span></div>
                <div><span className="text-gray-500">YTD Employer Share:</span> <span className="font-medium">₱{summary.ytdEmployerShare.toLocaleString()}</span></div>
                <div><span className="text-gray-500">Contributions:</span> <span className="font-medium">{summary.contributionCount}</span></div>
                <div><span className="text-gray-500">Remaining Limit:</span> <span className="font-medium text-amber-600">₱{summary.remainingLimitLocal.toLocaleString()}</span></div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Contribution History</h2>
            </div>
            {loading ? (
              <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">EE Share</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">ER Share</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {contributions.map(c => (
                      <tr key={c.Id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-medium">{c.LastName}, {c.FirstName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-700">{dayjs(c.ContributionDate).format('MMM D, YYYY')}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-700 text-right">₱{(c.EmployeeContribution || 0).toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-700 text-right">₱{(c.EmployerContribution || 0).toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-700 text-right font-medium">₱{((c.EmployeeContribution || 0) + (c.EmployerContribution || 0)).toLocaleString()}</td>
                      </tr>
                    ))}
                    {contributions.length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No contributions found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function GovernmentReports() {
  const [reports, setReports] = useState<GovReport[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [form, setForm] = useState({ reportType: 'BIR_Alphalist', periodCovered: '' })

  const REPORT_TYPES = [
    { value: 'BIR_Alphalist', label: 'BIR Alphalist' },
    { value: 'BIR_1601C', label: 'BIR Form 1601C' },
    { value: 'SSS_R3', label: 'SSS R-3' },
    { value: 'SSS_R5', label: 'SSS R-5' },
    { value: 'PhilHealth_RF1', label: 'PhilHealth RF-1' },
    { value: 'PagIbig_M1A', label: 'Pag-IBIG M1-A' },
    { value: 'PagIbig_M2', label: 'Pag-IBIG M2' },
  ]

  useEffect(() => { fetchReports() }, [])

  const fetchReports = async () => {
    try {
      const { data } = await api.get('/payroll/government-reports')
      setReports(data.data?.reports || [])
    } catch (error) {
      console.error('Failed to fetch reports:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateReport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.periodCovered) return
    setGenerating(true)
    try {
      await api.post('/payroll/government-reports/generate', form)
      fetchReports()
      setForm({ ...form, periodCovered: '' })
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Government Reports</h1>
        <p className="text-gray-500">Generate and download regulatory reports</p>
      </div>

      <form onSubmit={generateReport} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
            <select value={form.reportType} onChange={e => setForm({...form, reportType: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {REPORT_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period Covered (e.g., Jan 2026)</label>
            <input type="text" required value={form.periodCovered} onChange={e => setForm({...form, periodCovered: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Jan 2026" />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={generating}
              className="bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white px-4 py-2 rounded-lg font-medium text-sm transition w-full">
              {generating ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </form>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Generated Reports</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Report Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Generated</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map(r => (
                  <tr key={r.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-900 font-medium">{r.ReportType}</td>
                    <td className="px-6 py-4 text-gray-700">{r.PeriodCovered}</td>
                    <td className="px-6 py-4 text-gray-700">{dayjs(r.GeneratedAtUtc).format('MMM D, YYYY h:mm A')}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => downloadPdf(`/payroll/government-reports/${r.ReportType}/pdf?periodCovered=${encodeURIComponent(r.PeriodCovered)}`, `${r.ReportType}-${r.PeriodCovered}.pdf`)}
                        className="text-primary-600 hover:text-primary-900 text-sm font-medium">Download PDF</button>
                    </td>
                  </tr>
                ))}
                {reports.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No reports generated yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Payroll() {
  return (
    <Routes>
      <Route path="/" element={<PayrollList />} />
      <Route path="/new" element={<NewPayrollPeriod />} />
      <Route path="/:id" element={<PayrollPeriodDetail />} />
      <Route path="/run/:id" element={<PayrollRunDetail />} />
      <Route path="/payslip/:id" element={<PayslipDetail />} />
      <Route path="/payslips" element={<PayrollList />} />
      <Route path="/loans" element={<EmployeeLoans />} />
      <Route path="/thirteenth-month" element={<ThirteenthMonthPay />} />
      <Route path="/pera" element={<PERAManagement />} />
      <Route path="/government-reports" element={<GovernmentReports />} />
    </Routes>
  )
}
