import { useState, useEffect } from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import dayjs from 'dayjs'
import StatusBadge from '../components/ui/StatusBadge'
import PageHeader from '../components/ui/PageHeader'
import ConfirmDialog from '../components/ui/ConfirmDialog'

// ── Interfaces ──────────────────────────────────────────────

interface LeaveType {
  Id: string
  Code: string
  Name: string
  IsPaid: boolean
  AccrualRatePerMonth: number
  MaxCarryOverDays: number
  IsMonetizable: boolean
  RequiresDocumentation: boolean
  LegalBasis: string | null
}

interface LeaveCredit {
  Id: string
  Year: number
  EarnedDays: number
  UsedDays: number
  CarriedOverDays: number
  MonetizedDays: number
  BalanceDays: number
  LeaveTypeCode: string
  LeaveTypeName: string
  EmployeeNo: string
  FirstName: string
  LastName: string
}

interface LeaveRequest {
  Id: string
  DateFrom: string
  DateTo: string
  TotalDays: number
  IsHalfDay: boolean
  Reason: string
  Status: string
  SubmittedAtUtc: string
  DecidedAtUtc: string | null
  LeaveTypeCode: string
  LeaveTypeName: string
  EmployeeNo: string
  FirstName: string
  LastName: string
}

interface LeaveRequestDetail extends LeaveRequest {
  IsPaid: boolean
  DepartmentId: string
  DepartmentName: string
  AttachmentUrl: string | null
}

interface ApprovalStep {
  SequenceNo: number
  Status: string
  ActedAtUtc: string | null
  Comment: string | null
  ApproverName: string
}

interface CalendarLeave {
  Id: string
  DateFrom: string
  DateTo: string
  TotalDays: number
  IsHalfDay: boolean
  LeaveTypeCode: string
  LeaveTypeName: string
  EmployeeId: string
  FirstName: string
  LastName: string
  EmployeeNo: string
  DepartmentName: string
}

interface ApprovalChainRow {
  Id: string
  DepartmentId: string | null
  DepartmentName: string | null
  LeaveTypeId: string | null
  LeaveTypeName: string | null
  SequenceNo: number
  ApproverId: string
  ApproverName: string
  IsActive: boolean
}

interface Department {
  Id: string
  Name: string
  Code: string
}

// ── LeaveDashboard ──────────────────────────────────────────

function LeaveDashboard() {
  const [leaveCredits, setLeaveCredits] = useState<LeaveCredit[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLeaveData()
  }, [])

  const fetchLeaveData = async () => {
    try {
      const [creditsRes, requestsRes] = await Promise.all([
        api.get('/leave/credits'),
        api.get('/leave/requests'),
      ])
      setLeaveCredits(creditsRes.data.data?.leaveCredits || [])
      setLeaveRequests(requestsRes.data.data?.leaveRequests || [])
    } catch (error) {
      console.error('Failed to fetch leave data:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Management"
        subtitle="View your leave credits and request leave"
        action={
          <Link
            to="/leave/request"
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition inline-flex items-center"
          >
            <span className="mr-2">+</span>
            Request Leave
          </Link>
        }
        secondaryAction={
          <Link
            to="/leave/calendar"
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition inline-flex items-center"
          >
            Calendar
          </Link>
        }
      />

      {/* Leave Credits */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Leave Credits</h2>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {leaveCredits.map((credit) => (
              <div key={credit.Id} className="border border-gray-200 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700">{credit.LeaveTypeName}</p>
                <div className="mt-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Available</span>
                    <span className="font-semibold text-primary-600">{credit.BalanceDays}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-500 h-2 rounded-full"
                      style={{ width: `${credit.EarnedDays > 0 ? (credit.UsedDays / credit.EarnedDays) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {credit.UsedDays} of {credit.EarnedDays} used
                  </p>
                </div>
              </div>
            ))}
            {leaveCredits.length === 0 && (
              <p className="text-gray-500 text-sm col-span-full text-center py-4">No leave credits found</p>
            )}
          </div>
        )}
      </div>

      {/* Recent Requests */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Recent Leave Requests</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leave Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dates</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leaveRequests.map((request) => (
                  <tr key={request.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-gray-900">{request.LeaveTypeName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                      {dayjs(request.DateFrom).format('MMM D')} - {dayjs(request.DateTo).format('MMM D, YYYY')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-900">{request.TotalDays}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={request.Status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link to={`/leave/${request.Id}`} className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
                {leaveRequests.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      No leave requests found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── LeaveRequestForm ────────────────────────────────────────

function LeaveRequestForm() {
  const navigate = useNavigate()
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [formData, setFormData] = useState({
    leaveTypeId: '',
    dateFrom: '',
    dateTo: '',
    isHalfDay: false,
    reason: '',
    isLwop: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/leave/types').then(({ data }) => setLeaveTypes(data.data?.leaveTypes || []))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/leave/request', formData)
      navigate('/leave')
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to submit leave request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link to="/leave" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
          &larr; Back to Leave
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Request Leave</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Leave Type</label>
            <select
              value={formData.leaveTypeId}
              onChange={(e) => setFormData({ ...formData, leaveTypeId: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              required
            >
              <option value="">Select leave type</option>
              {leaveTypes.map((type) => (
                <option key={type.Id} value={type.Id}>
                  {type.Name} ({type.AccrualRatePerMonth * 12} days/year)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
              <input
                type="date"
                value={formData.dateFrom}
                onChange={(e) => setFormData({ ...formData, dateFrom: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
              <input
                type="date"
                value={formData.dateTo}
                onChange={(e) => setFormData({ ...formData, dateTo: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={formData.isHalfDay}
                onChange={(e) => setFormData({ ...formData, isHalfDay: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Half Day
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={formData.isLwop}
                onChange={(e) => setFormData({ ...formData, isLwop: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Leave Without Pay (LWOP)
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Reason</label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
              placeholder="Please provide a reason for your leave request..."
              required
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
            <Link
              to="/leave"
              className="flex-1 text-center border border-gray-300 text-gray-700 font-semibold py-3 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── LeaveRequestDetail ──────────────────────────────────────

function LeaveRequestDetail() {
  const requestId = window.location.pathname.split('/').pop()
  const [detail, setDetail] = useState<LeaveRequestDetail | null>(null)
  const [approvalSteps, setApprovalSteps] = useState<ApprovalStep[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (requestId) fetchDetail()
  }, [requestId])

  const fetchDetail = async () => {
    try {
      const { data } = await api.get(`/leave/request/${requestId}`)
      setDetail(data.data?.leaveRequest || null)
      setApprovalSteps(data.data?.approvalSteps || [])
    } catch (error) {
      console.error('Failed to fetch leave detail:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    setShowCancelConfirm(false)
    setCancelling(true)
    setError('')
    try {
      await api.put(`/leave/request/${requestId}/cancel`)
      fetchDetail()
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to cancel request')
    } finally {
      setCancelling(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>
  if (!detail) return <div className="text-center py-12 text-gray-500">Leave request not found</div>

  const stepStatus = (stepStatus: string, index: number) => {
    if (stepStatus === 'Approved') return 'bg-green-500 text-white'
    if (stepStatus === 'Rejected') return 'bg-red-500 text-white'
    if (stepStatus === 'Cancelled') return 'bg-gray-300 text-gray-500'
    // Pending
    const firstPending = approvalSteps.findIndex(s => s.Status === 'Pending')
    if (index === firstPending) return 'bg-yellow-400 text-white'
    return 'bg-gray-200 text-gray-500'
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel Leave Request"
        message="Are you sure you want to cancel this leave request? This action cannot be undone."
        confirmLabel="Yes, Cancel"
        variant="danger"
        onConfirm={handleCancel}
        onCancel={() => setShowCancelConfirm(false)}
        loading={cancelling}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Link to="/leave" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
          &larr; Back to Leave
        </Link>
        {detail.Status === 'Pending' && (
          <button
            onClick={() => setShowCancelConfirm(true)}
            disabled={cancelling}
            className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            {cancelling ? 'Cancelling...' : 'Cancel Request'}
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Leave Request</h1>
            <p className="text-gray-500 text-sm mt-1">Submitted {dayjs(detail.SubmittedAtUtc).format('MMM D, YYYY [at] h:mm A')}</p>
          </div>
          <StatusBadge status={detail.Status} />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Leave Type</span>
            <p className="font-medium text-gray-800">{detail.LeaveTypeName}</p>
          </div>
          <div>
            <span className="text-gray-500">Employee</span>
            <p className="font-medium text-gray-800">{detail.FirstName} {detail.LastName} ({detail.EmployeeNo})</p>
          </div>
          <div>
            <span className="text-gray-500">Department</span>
            <p className="font-medium text-gray-800">{detail.DepartmentName}</p>
          </div>
          <div>
            <span className="text-gray-500">Total Days</span>
            <p className="font-medium text-gray-800">{detail.TotalDays} {detail.IsHalfDay ? '(Half Day)' : ''}</p>
          </div>
          <div>
            <span className="text-gray-500">Date From</span>
            <p className="font-medium text-gray-800">{dayjs(detail.DateFrom).format('MMM D, YYYY')}</p>
          </div>
          <div>
            <span className="text-gray-500">Date To</span>
            <p className="font-medium text-gray-800">{dayjs(detail.DateTo).format('MMM D, YYYY')}</p>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500">Reason</span>
            <p className="font-medium text-gray-800">{detail.Reason}</p>
          </div>
        </div>

        {/* Approval Chain */}
        {approvalSteps.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Approval Chain</h3>
            <div className="space-y-3">
              {approvalSteps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${stepStatus(step.Status, idx)}`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{step.ApproverName}</p>
                    {step.ActedAtUtc && (
                      <p className="text-xs text-gray-500">
                        {step.Status} {dayjs(step.ActedAtUtc).format('MMM D, h:mm A')}
                        {step.Comment && ` — ${step.Comment}`}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── LeaveCalendar ───────────────────────────────────────────

function LeaveCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [leaves, setLeaves] = useState<CalendarLeave[]>([])
  const [loading, setLoading] = useState(true)
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [departments, setDepartments] = useState<Department[]>([])

  useEffect(() => {
    fetchDepartments()
  }, [])

  useEffect(() => {
    fetchCalendarLeaves()
  }, [currentDate, departmentFilter])

  const fetchDepartments = async () => {
    try {
      const { data } = await api.get('/employees/departments')
      setDepartments(data.data?.departments || [])
    } catch (error) {
      console.error('Failed to fetch departments:', error)
    }
  }

  const fetchCalendarLeaves = async () => {
    setLoading(true)
    try {
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth()
      const startDate = dayjs(new Date(year, month, 1)).format('YYYY-MM-DD')
      const endDate = dayjs(new Date(year, month + 1, 0)).format('YYYY-MM-DD')
      const params: any = { startDate, endDate }
      if (departmentFilter) params.departmentId = departmentFilter
      const { data } = await api.get('/leave/calendar', { params })
      setLeaves(data.data?.leaves || [])
    } catch (error) {
      console.error('Failed to fetch calendar:', error)
    } finally {
      setLoading(false)
    }
  }

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const getLeavesForDay = (day: number) => {
    const target = new Date(year, month, day)
    target.setHours(0, 0, 0, 0)
    return leaves.filter((leave) => {
      const from = dayjs(leave.DateFrom).startOf('day').toDate()
      const to = dayjs(leave.DateTo).startOf('day').toDate()
      return target >= from && target <= to
    })
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  const leaveColors: Record<string, string> = {
    VL: 'bg-blue-100 text-blue-800 border-blue-200',
    SL: 'bg-orange-100 text-orange-800 border-orange-200',
    EL: 'bg-purple-100 text-purple-800 border-purple-200',
    ML: 'bg-pink-100 text-pink-800 border-pink-200',
    LWOP: 'bg-gray-100 text-gray-600 border-gray-200',
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Leave Calendar</h1>
          <p className="text-gray-500">Approved leaves for the team</p>
        </div>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.Id} value={d.Id}>{d.Name}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} aria-label="Previous month" className="p-2 hover:bg-gray-100 rounded-lg transition">
            &larr;
          </button>
          <h2 className="text-lg font-semibold text-gray-800">{dayjs(currentDate).format('MMMM YYYY')}</h2>
          <button onClick={nextMonth} aria-label="Next month" className="p-2 hover:bg-gray-100 rounded-lg transition">
            &rarr;
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">{d}</div>
          ))}
        </div>

        {/* Calendar Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for first week */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[80px] bg-gray-50 rounded" />
            ))}
            {/* Day cells */}
            {daysArray.map((day) => {
              const dayLeaves = getLeavesForDay(day)
              const isToday = dayjs().isSame(dayjs(new Date(year, month, day)), 'day')
              return (
                <div
                  key={day}
                  className={`min-h-[80px] border rounded p-1 ${isToday ? 'border-primary-400 bg-primary-50' : 'border-gray-100'}`}
                >
                  <div className={`text-xs font-medium mb-1 ${isToday ? 'text-primary-600' : 'text-gray-700'}`}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {dayLeaves.slice(0, 3).map((leave) => (
                      <div
                        key={leave.Id}
                        className={`text-[10px] px-1 py-0.5 rounded border truncate ${leaveColors[leave.LeaveTypeCode] || 'bg-gray-100 text-gray-600'}`}
                        title={`${leave.FirstName} ${leave.LastName} — ${leave.LeaveTypeName}`}
                      >
                        {leave.FirstName} {leave.LastName}
                      </div>
                    ))}
                    {dayLeaves.length > 3 && (
                      <div className="text-[10px] text-gray-500 pl-1">+{dayLeaves.length - 3} more</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── LeaveTypesManagement ────────────────────────────────────

function LeaveTypesManagement() {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<LeaveType | null>(null)
  const [form, setForm] = useState({
    code: '', name: '', isPaid: true, accrualRatePerMonth: 0,
    maxCarryOverDays: 0, isMonetizable: false, requiresDocumentation: false, legalBasis: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => { fetchLeaveTypes() }, [])

  const fetchLeaveTypes = async () => {
    try {
      const { data } = await api.get('/leave/types')
      setLeaveTypes(data.data?.leaveTypes || [])
    } catch (err) {
      console.error('Failed to fetch leave types:', err)
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ code: '', name: '', isPaid: true, accrualRatePerMonth: 0, maxCarryOverDays: 0, isMonetizable: false, requiresDocumentation: false, legalBasis: '' })
    setShowForm(true)
    setError('')
  }

  const openEdit = (lt: LeaveType) => {
    setEditing(lt)
    setForm({
      code: lt.Code, name: lt.Name, isPaid: lt.IsPaid,
      accrualRatePerMonth: lt.AccrualRatePerMonth, maxCarryOverDays: lt.MaxCarryOverDays,
      isMonetizable: lt.IsMonetizable, requiresDocumentation: lt.RequiresDocumentation,
      legalBasis: lt.LegalBasis || '',
    })
    setShowForm(true)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/leave/types/${editing.Id}`, form)
      } else {
        await api.post('/leave/types', form)
      }
      setShowForm(false)
      fetchLeaveTypes()
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to save leave type')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (lt: LeaveType) => {
    setDeleteError('')
    try {
      await api.delete(`/leave/types/${lt.Id}`)
      fetchLeaveTypes()
    } catch (err: any) {
      setDeleteError(err.response?.data?.error?.message || 'Failed to delete leave type')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Types"
        subtitle="Configure leave types available in your organization"
        action={
          <button
            onClick={openCreate}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition inline-flex items-center"
          >
            <span className="mr-2">+</span>
            Add Leave Type
          </button>
        }
      />

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">{editing ? 'Edit' : 'Create'} Leave Type</h2>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Accrual Rate (per month)</label>
                <input type="number" step="0.01" value={form.accrualRatePerMonth}
                  onChange={(e) => setForm({ ...form, accrualRatePerMonth: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Carry-Over Days</label>
                <input type="number" step="0.01" value={form.maxCarryOverDays}
                  onChange={(e) => setForm({ ...form, maxCarryOverDays: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Legal Basis</label>
                <input value={form.legalBasis} onChange={(e) => setForm({ ...form, legalBasis: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="e.g. Labor Code Art. 94" />
              </div>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.isPaid} onChange={(e) => setForm({ ...form, isPaid: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                Paid
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.isMonetizable} onChange={(e) => setForm({ ...form, isMonetizable: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                Monetizable
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.requiresDocumentation} onChange={(e) => setForm({ ...form, requiresDocumentation: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                Requires Documentation
              </label>
            </div>
            <div className="flex gap-4">
              <button type="submit" disabled={saving}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {deleteError}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Accrual/Month</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Max Carry-Over</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monetizable</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leaveTypes.map((lt) => (
                  <tr key={lt.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-800">{lt.Code}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{lt.Name}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{lt.AccrualRatePerMonth}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{lt.MaxCarryOverDays}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${lt.IsPaid ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {lt.IsPaid ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${lt.IsMonetizable ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                        {lt.IsMonetizable ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(lt)} className="text-primary-600 hover:text-primary-700 font-medium">Edit</button>
                        <button onClick={() => handleDelete(lt)} className="text-red-600 hover:text-red-700 font-medium">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {leaveTypes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">No leave types configured</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── LeaveApprovalChainConfig ────────────────────────────────

function LeaveApprovalChainConfig() {
  const [chains, setChains] = useState<ApprovalChainRow[]>([])
  const [loading, setLoading] = useState(true)
  const [departments, setDepartments] = useState<Department[]>([])
  const [employees, setEmployees] = useState<{ Id: string; FirstName: string; LastName: string; EmployeeNo: string }[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ departmentId: '', sequenceNo: 1, approverId: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    fetchChains()
    fetchDepartments()
    fetchEmployees()
  }, [])

  const fetchChains = async () => {
    try {
      const { data } = await api.get('/leave/approval-chains')
      setChains(data.data?.approvalChains || [])
    } catch (err) {
      console.error('Failed to fetch chains:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchDepartments = async () => {
    try {
      const { data } = await api.get('/employees/departments')
      setDepartments(data.data?.departments || [])
    } catch (err) {
      console.error('Failed to fetch departments:', err)
    }
  }

  const fetchEmployees = async () => {
    try {
      const { data } = await api.get('/employees')
      setEmployees(data.data?.employees || [])
    } catch (err) {
      console.error('Failed to fetch employees:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post('/leave/approval-chains', {
        departmentId: form.departmentId || null,
        sequenceNo: Number(form.sequenceNo),
        approverId: form.approverId,
      })
      setShowForm(false)
      fetchChains()
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to save approval chain')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (chainId: string) => {
    setDeleteError('')
    try {
      await api.delete(`/leave/approval-chains/${chainId}`)
      fetchChains()
    } catch (err: any) {
      setDeleteError(err.response?.data?.error?.message || 'Failed to delete')
    }
  }

  // Group chains by department
  const grouped: Record<string, ApprovalChainRow[]> = {}
  for (const chain of chains) {
    const key = chain.DepartmentName || 'Default (All Departments)'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(chain)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Approval Chains</h1>
          <p className="text-gray-500">Configure per-department leave approval workflow</p>
        </div>
        <button onClick={() => { setShowForm(true); setError(''); setForm({ departmentId: '', sequenceNo: chains.length + 1, approverId: '' }) }}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition inline-flex items-center">
          <span className="mr-2">+</span>
          Add Step
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Add Approval Step</h2>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department (blank = default)</label>
                <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">All Departments</option>
                  {departments.map((d) => <option key={d.Id} value={d.Id}>{d.Name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sequence # *</label>
                <input type="number" min="1" value={form.sequenceNo}
                  onChange={(e) => setForm({ ...form, sequenceNo: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Approver *</label>
                <select value={form.approverId} onChange={(e) => setForm({ ...form, approverId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required>
                  <option value="">Select approver</option>
                  {employees.map((e) => <option key={e.Id} value={e.Id}>{e.FirstName} {e.LastName} ({e.EmployeeNo})</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-4">
              <button type="submit" disabled={saving}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition disabled:opacity-50">
                {saving ? 'Saving...' : 'Add Step'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No approval chains configured. Default supervisor hierarchy will be used.
          </p>
        ) : (
          <div className="space-y-6">
            {deleteError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {deleteError}
              </div>
            )}
            {Object.entries(grouped).map(([deptName, steps]) => (
              <div key={deptName}>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">{deptName}</h3>
                <div className="space-y-2">
                  {steps.sort((a, b) => a.SequenceNo - b.SequenceNo).map((step) => (
                    <div key={step.Id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2">
                      <span className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
                        {step.SequenceNo}
                      </span>
                      <span className="flex-1 text-sm font-medium text-gray-800">{step.ApproverName}</span>
                      <button onClick={() => handleDelete(step.Id)} className="text-red-500 hover:text-red-700 text-sm">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── LeaveYearEnd ────────────────────────────────────────────

function LeaveYearEnd() {
  const [year, setYear] = useState(new Date().getFullYear() - 1)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const handleProcess = async () => {
    setShowConfirm(false)
    setProcessing(true)
    setError('')
    setResult(null)
    try {
      const { data } = await api.post('/leave/year-end', { year })
      setResult(data.data)
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to process year-end')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <ConfirmDialog
        open={showConfirm}
        title="Run Year-End Processing"
        message={`This will carry-over, monetize, or forfeit unused leave credits for ${year}. This action cannot be undone.`}
        confirmLabel="Yes, Process"
        variant="danger"
        onConfirm={handleProcess}
        onCancel={() => setShowConfirm(false)}
        loading={processing}
      />
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Year-End Leave Processing</h1>
        <p className="text-gray-500">Process carry-over, monetization, and forfeiture of unused leave credits</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Processing Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
            This will process all active employees' leave credits for {year}:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Carry-over unused days up to each leave type's MaxCarryOverDays limit</li>
              <li>Monetize excess days for leave types marked as Monetizable</li>
              <li>Forfeit remaining balance</li>
            </ul>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}

          {result && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">
              Year-end processing completed for {year}.
            </div>
          )}

          <button
            onClick={() => setShowConfirm(true)}
            disabled={processing}
            className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-semibold transition disabled:opacity-50"
          >
            {processing ? 'Processing...' : `Process Year-End ${year}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Leave Component ────────────────────────────────────

export default function Leave() {
  return (
    <Routes>
      <Route path="/" element={<LeaveDashboard />} />
      <Route path="/request" element={<LeaveRequestForm />} />
      <Route path="/calendar" element={<LeaveCalendar />} />
      <Route path="/types" element={<LeaveTypesManagement />} />
      <Route path="/approval-chains" element={<LeaveApprovalChainConfig />} />
      <Route path="/year-end" element={<LeaveYearEnd />} />
      <Route path="/:id" element={<LeaveRequestDetail />} />
    </Routes>
  )
}
