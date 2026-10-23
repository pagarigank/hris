import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import api from '../lib/api'
import dayjs from 'dayjs'
import ConfirmDialog from '../components/ui/ConfirmDialog'

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

// ── Interfaces ──────────────────────────────────────────────

interface OvertimeRequest {
  Id: string
  WorkDate: string
  RequestedHours: number
  Reason: string | null
  Status: string
  EmployeeNo: string
  FirstName: string
  LastName: string
}

interface Shift {
  Id: string
  Name: string
  TimeIn: string
  TimeOut: string
  BreakMinutes: number
  GraceMinutesLate: number
  IsNightShift: boolean
}

interface Schedule {
  Id: string
  EmployeeId: string
  ShiftId: string
  EffectiveDate: string
  DayOfWeekPattern: string | null
  ExpiryDate: string | null
  EmployeeNo: string
  FirstName: string
  LastName: string
  ShiftName: string
}

interface Geofence {
  Id: string
  Name: string
  Latitude: number
  Longitude: number
  RadiusMeters: number
}

interface Holiday {
  Id: string
  HolidayDate: string
  Name: string
  Type: string
}

interface Device {
  Id: string
  DeviceId: string
  DeviceType: string
  RegisteredAtUtc: string
  IsTrusted: boolean
  EmployeeNo: string
  FirstName: string
  LastName: string
}

interface Employee {
  Id: string
  EmployeeNo: string
  FirstName: string
  LastName: string
}

// ── Helpers ─────────────────────────────────────────────────

function getGeolocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ latitude: 14.5995, longitude: 120.9842 })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve({ latitude: 14.5995, longitude: 120.9842 }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  })
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Present: 'bg-green-100 text-green-800',
    Absent: 'bg-red-100 text-red-800',
    HalfDay: 'bg-yellow-100 text-yellow-800',
    Leave: 'bg-blue-100 text-blue-800',
    Pending: 'bg-yellow-100 text-yellow-800',
    Approved: 'bg-green-100 text-green-800',
    Rejected: 'bg-red-100 text-red-800',
    Cancelled: 'bg-gray-100 text-gray-800',
  }
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  )
}

// ── Attendance Dashboard ────────────────────────────────────

interface DTRRecord {
  date: string
  clockIn: string | null
  clockOut: string | null
  totalHours: number
}

interface TodayData {
  date: string
  clockIn: string | null
  clockOut: string | null
  totalHours: number
}

function AttendanceDashboard() {
  const [today, setToday] = useState<TodayData | null>(null)
  const [records, setRecords] = useState<DTRRecord[]>([])
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [clockingIn, setClockingIn] = useState(false)
  const [clockingOut, setClockingOut] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [error, setError] = useState('')

  useEffect(() => {
    fetchData()
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [days])

  const fetchData = async () => {
    try {
      const [todayRes, dtrRes] = await Promise.all([
        api.get('/attendance/today'),
        api.get(`/attendance/dtr?days=${days}`),
      ])
      setToday(todayRes.data)
      setRecords(dtrRes.data?.data?.records || [])
    } catch (err) {
      console.error('Failed to fetch attendance data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleClockIn = async () => {
    setClockingIn(true)
    setError('')
    try {
      const coords = await getGeolocation()
      await api.post('/attendance/clock-in', coords)
      fetchData()
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to clock in')
    } finally {
      setClockingIn(false)
    }
  }

  const handleClockOut = async () => {
    setClockingOut(true)
    setError('')
    try {
      const coords = await getGeolocation()
      await api.post('/attendance/clock-out', coords)
      fetchData()
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to clock out')
    } finally {
      setClockingOut(false)
    }
  }

  const isClockedIn = !!(today?.clockIn && !today?.clockOut)
  const manilaTime = dayjs(currentTime).format('hh:mm:ss A')
  const manilaDate = dayjs(currentTime).format('dddd, MMMM D, YYYY')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
        <p className="text-gray-500 text-sm mt-1">Clock in/out and view your daily time records</p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-700 hover:text-red-900 font-medium">&times;</button>
        </div>
      )}

      {/* Clock Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left">
            <p className="text-sm text-gray-500 uppercase tracking-wide font-medium">Current Time</p>
            <p className="text-4xl font-bold text-gray-900 tabular-nums mt-1">{manilaTime}</p>
            <p className="text-sm text-gray-500 mt-1">{manilaDate}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleClockIn}
              disabled={clockingIn || isClockedIn}
              className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-150 ${
                isClockedIn
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm hover:shadow disabled:opacity-50'
              }`}
            >
              {clockingIn ? 'Clocking In...' : isClockedIn ? 'Already Clocked In' : 'Clock In'}
            </button>
            <button
              onClick={handleClockOut}
              disabled={clockingOut || !isClockedIn}
              className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-150 ${
                !isClockedIn
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm hover:shadow disabled:opacity-50'
              }`}
            >
              {clockingOut ? 'Clocking Out...' : !isClockedIn ? 'Not Clocked In' : 'Clock Out'}
            </button>
          </div>
        </div>

        {/* Today Summary */}
        {today && (
          <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Clock In</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">
                {today.clockIn ? dayjs(today.clockIn).format('hh:mm A') : '--'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Clock Out</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">
                {today.clockOut ? dayjs(today.clockOut).format('hh:mm A') : '--'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Total Hours</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">
                {today.totalHours > 0 ? `${today.totalHours.toFixed(1)}h` : '--'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* DTR Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Records</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => {
              const now = dayjs();
              downloadPdf(`/attendance/dtr/pdf?month=${now.month()+1}&year=${now.year()}`, `dtr-${now.format('YYYY-MM')}.pdf`);
            }}
              className="text-primary-600 hover:text-primary-700 text-sm font-medium border border-primary-300 rounded-lg px-3 py-1.5 transition">
              Download PDF
            </button>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
            </select>
          </div>
        </div>
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clock In</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clock Out</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((r, i) => (
                  <tr key={`${r.date}-${i}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{dayjs(r.date).format('ddd, MMM D, YYYY')}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.clockIn ? dayjs(r.clockIn).format('hh:mm A') : '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{r.clockOut ? dayjs(r.clockOut).format('hh:mm A') : '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 tabular-nums">{r.totalHours > 0 ? `${r.totalHours.toFixed(1)}h` : '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <StatusBadge status={r.clockIn ? (r.clockOut ? 'Present' : 'Present') : 'Absent'} />
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No DTR records found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Overtime ────────────────────────────────────────────────

function OvertimeList() {
  const [requests, setRequests] = useState<OvertimeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { fetchRequests() }, [filter])

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const params = filter ? `?status=${filter}` : ''
      const { data } = await api.get(`/attendance/overtime${params}`)
      setRequests(data?.data?.requests || [])
    } catch (error) {
      console.error('Failed to fetch OT requests:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (id: string) => {
    try {
      await api.put(`/attendance/overtime/${id}/approve`)
      fetchRequests()
    } catch { setError('Failed to approve') }
  }

  const handleReject = async (id: string) => {
    try {
      await api.put(`/attendance/overtime/${id}/reject`)
      fetchRequests()
    } catch { setError('Failed to reject') }
  }

  const handleCancel = async (id: string) => {
    try {
      await api.put(`/attendance/overtime/${id}/cancel`)
      fetchRequests()
    } catch { setError('Failed to cancel') }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Overtime Requests</h1>
          <p className="text-gray-500">Submit and manage overtime requests</p>
        </div>
        <div className="flex gap-3">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
          <button onClick={() => setShowForm(true)} className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700">
            + Request Overtime
          </button>
        </div>
      </div>

      {showForm && (
        <OvertimeForm onClose={() => { setShowForm(false); fetchRequests() }} />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-700 hover:text-red-900 font-medium">&times;</button>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Work Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map((r) => (
                  <tr key={r.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{r.EmployeeNo} - {r.FirstName} {r.LastName}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{dayjs(r.WorkDate).format('MMM D, YYYY')}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{r.RequestedHours}h</td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-[200px] truncate">{r.Reason || '-'}</td>
                    <td className="px-6 py-4 text-sm"><StatusBadge status={r.Status} /></td>
                    <td className="px-6 py-4 text-sm">
                      {r.Status === 'Pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleApprove(r.Id)} className="text-green-600 hover:text-green-800 text-xs font-medium">Approve</button>
                          <button onClick={() => handleReject(r.Id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Reject</button>
                          <button onClick={() => handleCancel(r.Id)} className="text-gray-600 hover:text-gray-800 text-xs font-medium">Cancel</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No overtime requests found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function OvertimeForm({ onClose }: { onClose: () => void }) {
  const [workDate, setWorkDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [requestedHours, setRequestedHours] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post('/attendance/overtime', { workDate, requestedHours: parseFloat(requestedHours), reason })
      onClose()
    } catch (error: any) {
      setError(error.response?.data?.error?.message || 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Submit Overtime Request</h3>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between items-center mb-4">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-700 hover:text-red-900 font-medium">&times;</button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Work Date</label>
            <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hours Requested</label>
            <input type="number" step="0.5" min="0.5" max="12" value={requestedHours} onChange={(e) => setRequestedHours(e.target.value)} required placeholder="e.g. 2" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Reason for overtime..." />
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={submitting} className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
          <button type="button" onClick={onClose} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Shifts Management ───────────────────────────────────────

function ShiftsManagement() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { fetchShifts() }, [])

  const fetchShifts = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/attendance/shifts')
      setShifts(data?.data?.shifts || [])
    } catch (error) {
      console.error('Failed to fetch shifts:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this shift?')) return
    try {
      await api.delete(`/attendance/shifts/${id}`)
      fetchShifts()
    } catch { setError('Failed to delete') }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Shifts</h1>
          <p className="text-gray-500">Manage work shifts and schedules</p>
        </div>
        <button onClick={() => { setEditingShift(null); setShowForm(true) }} className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700">
          + Add Shift
        </button>
      </div>

      {showForm && (
        <ShiftForm
          shift={editingShift}
          onClose={() => { setShowForm(false); setEditingShift(null); fetchShifts() }}
        />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-700 hover:text-red-900 font-medium">&times;</button>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time In</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time Out</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Break (min)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grace (min)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Night Shift</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shifts.map((s) => (
                  <tr key={s.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{s.Name}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{s.TimeIn}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{s.TimeOut}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{s.BreakMinutes}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{s.GraceMinutesLate}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{s.IsNightShift ? 'Yes' : 'No'}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingShift(s); setShowForm(true) }} className="text-primary-600 hover:text-primary-800 text-xs font-medium">Edit</button>
                        <button onClick={() => handleDelete(s.Id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {shifts.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">No shifts configured</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function ShiftForm({ shift, onClose }: { shift: Shift | null; onClose: () => void }) {
  const [name, setName] = useState(shift?.Name || '')
  const [timeIn, setTimeIn] = useState(shift?.TimeIn || '09:00')
  const [timeOut, setTimeOut] = useState(shift?.TimeOut || '18:00')
  const [breakMinutes, setBreakMinutes] = useState(shift?.BreakMinutes || 60)
  const [graceMinutesLate, setGraceMinutesLate] = useState(shift?.GraceMinutesLate || 15)
  const [isNightShift, setIsNightShift] = useState(shift?.IsNightShift || false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload = { name, timeIn, timeOut, breakMinutes, graceMinutesLate, isNightShift }
      if (shift) {
        await api.put(`/attendance/shifts/${shift.Id}`, payload)
      } else {
        await api.post('/attendance/shifts', payload)
      }
      onClose()
    } catch (error: any) {
      setError(error.response?.data?.error?.message || 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{shift ? 'Edit Shift' : 'Add Shift'}</h3>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between items-center mb-4">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-700 hover:text-red-900 font-medium">&times;</button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shift Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Morning Shift" />
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isNightShift} onChange={(e) => setIsNightShift(e.target.checked)} className="rounded" />
              Night Shift
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time In</label>
            <input type="time" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time Out</label>
            <input type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Break Minutes</label>
            <input type="number" min="0" value={breakMinutes} onChange={(e) => setBreakMinutes(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grace Period (min late)</label>
            <input type="number" min="0" value={graceMinutesLate} onChange={(e) => setGraceMinutesLate(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={submitting} className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={onClose} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Schedules Management ────────────────────────────────────

function SchedulesManagement() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { fetchSchedules() }, [])

  const fetchSchedules = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/attendance/schedules')
      setSchedules(data?.data?.schedules || [])
    } catch (error) {
      console.error('Failed to fetch schedules:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule?')) return
    try {
      await api.delete(`/attendance/schedules/${id}`)
      fetchSchedules()
    } catch { setError('Failed to delete') }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Employee Schedules</h1>
          <p className="text-gray-500">Assign shifts to employees</p>
        </div>
        <button onClick={() => { setEditingSchedule(null); setShowForm(true) }} className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700">
          + Assign Schedule
        </button>
      </div>

      {showForm && (
        <ScheduleForm
          schedule={editingSchedule}
          onClose={() => { setShowForm(false); setEditingSchedule(null); fetchSchedules() }}
        />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-700 hover:text-red-900 font-medium">&times;</button>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shift</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Effective Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expiry Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days Pattern</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {schedules.map((s) => (
                  <tr key={s.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{s.EmployeeNo} - {s.FirstName} {s.LastName}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{s.ShiftName}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{dayjs(s.EffectiveDate).format('MMM D, YYYY')}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{s.ExpiryDate ? dayjs(s.ExpiryDate).format('MMM D, YYYY') : 'Ongoing'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{s.DayOfWeekPattern || 'All Days'}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingSchedule(s); setShowForm(true) }} className="text-primary-600 hover:text-primary-800 text-xs font-medium">Edit</button>
                        <button onClick={() => handleDelete(s.Id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {schedules.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No schedules assigned</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function ScheduleForm({ schedule, onClose }: { schedule: Schedule | null; onClose: () => void }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [employeeId, setEmployeeId] = useState(schedule?.EmployeeId || '')
  const [shiftId, setShiftId] = useState(schedule?.ShiftId || '')
  const [effectiveDate, setEffectiveDate] = useState(schedule?.EffectiveDate ? dayjs(schedule.EffectiveDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'))
  const [expiryDate, setExpiryDate] = useState(schedule?.ExpiryDate ? dayjs(schedule.ExpiryDate).format('YYYY-MM-DD') : '')
  const [dayPattern, setDayPattern] = useState(schedule?.DayOfWeekPattern || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/employees?pageSize=200').then(({ data }) => setEmployees(data?.data?.employees || []))
    api.get('/attendance/shifts?pageSize=100').then(({ data }) => setShifts(data?.data?.shifts || []))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload = { employeeId, shiftId, effectiveDate, expiryDate: expiryDate || null, dayOfWeekPattern: dayPattern || null }
      if (schedule) {
        await api.put(`/attendance/schedules/${schedule.Id}`, payload)
      } else {
        await api.post('/attendance/schedules', payload)
      }
      onClose()
    } catch (error: any) {
      setError(error.response?.data?.error?.message || 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{schedule ? 'Edit Schedule' : 'Assign Schedule'}</h3>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between items-center mb-4">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-700 hover:text-red-900 font-medium">&times;</button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.Id} value={e.Id}>{e.EmployeeNo} - {e.FirstName} {e.LastName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shift</label>
            <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Select shift</option>
              {shifts.map((s) => (
                <option key={s.Id} value={s.Id}>{s.Name} ({s.TimeIn} - {s.TimeOut})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Effective Date</label>
            <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date (optional)</label>
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Days Pattern (optional)</label>
            <input type="text" value={dayPattern} onChange={(e) => setDayPattern(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Mon,Tue,Wed,Thu,Fri" />
          </div>
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={submitting} className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={onClose} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Geofences Management ────────────────────────────────────

function GeofencesManagement() {
  const [geofences, setGeofences] = useState<Geofence[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingGeofence, setEditingGeofence] = useState<Geofence | null>(null)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => { fetchGeofences() }, [])

  const fetchGeofences = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/attendance/geofences')
      setGeofences(data?.data?.geofences || [])
    } catch (error) {
      console.error('Failed to fetch geofences:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/attendance/geofences/${deleteTarget}`)
      fetchGeofences()
    } catch { setError('Failed to delete') }
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Geofence"
        message="Are you sure you want to delete this geofence?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Geofences</h1>
          <p className="text-gray-500">Configure location boundaries for attendance</p>
        </div>
        <button onClick={() => { setEditingGeofence(null); setShowForm(true) }} className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700">
          + Add Geofence
        </button>
      </div>

      {showForm && (
        <GeofenceForm
          geofence={editingGeofence}
          onClose={() => { setShowForm(false); setEditingGeofence(null); fetchGeofences() }}
        />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-700 hover:text-red-900 font-medium">&times;</button>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Latitude</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Longitude</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Radius (m)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {geofences.map((g) => (
                  <tr key={g.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{g.Name}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{g.Latitude}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{g.Longitude}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{g.RadiusMeters}m</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingGeofence(g); setShowForm(true) }} className="text-primary-600 hover:text-primary-800 text-xs font-medium">Edit</button>
                        <button onClick={() => setDeleteTarget(g.Id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {geofences.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No geofences configured</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function GeofenceForm({ geofence, onClose }: { geofence: Geofence | null; onClose: () => void }) {
  const [name, setName] = useState(geofence?.Name || '')
  const [latitude, setLatitude] = useState(geofence?.Latitude || 14.5995)
  const [longitude, setLongitude] = useState(geofence?.Longitude || 120.9842)
  const [radiusMeters, setRadiusMeters] = useState(geofence?.RadiusMeters || 100)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload = { Name: name, Latitude: latitude, Longitude: longitude, RadiusMeters: radiusMeters }
      if (geofence) {
        await api.put(`/attendance/geofences/${geofence.Id}`, payload)
      } else {
        await api.post('/attendance/geofences', payload)
      }
      onClose()
    } catch (error: any) {
      setError(error.response?.data?.error?.message || 'Failed to save geofence')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{geofence ? 'Edit Geofence' : 'Add Geofence'}</h3>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between items-center mb-4">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-700 hover:text-red-900 font-medium">&times;</button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Office Main" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Radius (meters)</label>
            <input type="number" min="10" value={radiusMeters} onChange={(e) => setRadiusMeters(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
            <input type="number" step="0.00000001" value={latitude} onChange={(e) => setLatitude(Number(e.target.value))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
            <input type="number" step="0.00000001" value={longitude} onChange={(e) => setLongitude(Number(e.target.value))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={submitting} className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={onClose} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Holidays Management ─────────────────────────────────────

function HolidaysManagement() {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => { fetchHolidays() }, [year])

  const fetchHolidays = async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/attendance/holidays?year=${year}`)
      setHolidays(data?.data?.holidays || [])
    } catch (error) {
      console.error('Failed to fetch holidays:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/attendance/holidays/${deleteTarget}`)
      fetchHolidays()
    } catch { setError('Failed to delete') }
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Holiday"
        message="Are you sure you want to delete this holiday?"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Holidays</h1>
          <p className="text-gray-500">Manage Philippine regular and special non-working holidays</p>
        </div>
        <div className="flex gap-3">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button onClick={() => { setEditingHoliday(null); setShowForm(true) }} className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700">
            + Add Holiday
          </button>
        </div>
      </div>

      {showForm && (
        <HolidayForm
          holiday={editingHoliday}
          onClose={() => { setShowForm(false); setEditingHoliday(null); fetchHolidays() }}
        />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-700 hover:text-red-900 font-medium">&times;</button>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {holidays.map((h) => (
                  <tr key={h.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{dayjs(h.HolidayDate).format('MMMM D, YYYY')}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{h.Name}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{h.Type}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingHoliday(h); setShowForm(true) }} className="text-primary-600 hover:text-primary-800 text-xs font-medium">Edit</button>
                        <button onClick={() => setDeleteTarget(h.Id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {holidays.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No holidays for {year}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function HolidayForm({ holiday, onClose }: { holiday: Holiday | null; onClose: () => void }) {
  const [holidayDate, setHolidayDate] = useState(holiday?.HolidayDate ? dayjs(holiday.HolidayDate).format('YYYY-MM-DD') : '')
  const [name, setName] = useState(holiday?.Name || '')
  const [type, setType] = useState(holiday?.Type || 'Regular')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload = { holidayDate, name, type }
      if (holiday) {
        await api.put(`/attendance/holidays/${holiday.Id}`, payload)
      } else {
        await api.post('/attendance/holidays', payload)
      }
      onClose()
    } catch (error: any) {
      setError(error.response?.data?.error?.message || 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{holiday ? 'Edit Holiday' : 'Add Holiday'}</h3>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between items-center mb-4">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-700 hover:text-red-900 font-medium">&times;</button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Holiday Date</label>
            <input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="Regular">Regular Holiday</option>
              <option value="SpecialNonWorking">Special Non-Working Day</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Holiday Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. New Year's Day" />
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={submitting} className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={onClose} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Devices Management ──────────────────────────────────────

function DevicesManagement() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchDevices() }, [])

  const fetchDevices = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/attendance/devices')
      setDevices(data?.data?.devices || [])
    } catch (error) {
      console.error('Failed to fetch devices:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this device?')) return
    try {
      await api.delete(`/attendance/devices/${id}`)
      fetchDevices()
    } catch { setError('Failed to remove device') }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Registered Devices</h1>
          <p className="text-gray-500">Manage trusted attendance devices</p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700">
          + Register Device
        </button>
      </div>

      {showForm && (
        <DeviceForm onClose={() => { setShowForm(false); fetchDevices() }} />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-700 hover:text-red-900 font-medium">&times;</button>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trusted</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registered</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {devices.map((d) => (
                  <tr key={d.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-mono text-gray-900">{d.DeviceId}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{d.DeviceType}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{d.EmployeeNo} - {d.FirstName} {d.LastName}</td>
                    <td className="px-6 py-4 text-sm">
                      {d.IsTrusted ? (
                        <span className="text-green-600 font-medium">Yes</span>
                      ) : (
                        <span className="text-gray-400">No</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{dayjs(d.RegisteredAtUtc).format('MMM D, YYYY')}</td>
                    <td className="px-6 py-4 text-sm">
                      <button onClick={() => handleDelete(d.Id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Remove</button>
                    </td>
                  </tr>
                ))}
                {devices.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No devices registered</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function DeviceForm({ onClose }: { onClose: () => void }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [deviceType, setDeviceType] = useState('Web')
  const [isTrusted, setIsTrusted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/employees?pageSize=200').then(({ data }) => setEmployees(data?.data?.employees || []))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post('/attendance/devices', { employeeId, deviceId, deviceType, isTrusted })
      onClose()
    } catch (error: any) {
      setError(error.response?.data?.error?.message || 'Failed to register')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Register Device</h3>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between items-center mb-4">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-700 hover:text-red-900 font-medium">&times;</button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.Id} value={e.Id}>{e.EmployeeNo} - {e.FirstName} {e.LastName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Device ID</label>
            <input type="text" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Unique device identifier" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Device Type</label>
            <select value={deviceType} onChange={(e) => setDeviceType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="Web">Web Browser</option>
              <option value="Mobile">Mobile App</option>
              <option value="Biometric">Biometric Device</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isTrusted} onChange={(e) => setIsTrusted(e.target.checked)} className="rounded" />
              Trusted Device
            </label>
          </div>
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={submitting} className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
            {submitting ? 'Registering...' : 'Register'}
          </button>
          <button type="button" onClick={onClose} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// ── DTR (Daily Time Record) Page ────────────────────────────

interface DTRRecord {
  Id: string
  WorkDate: string
  ScheduledTimeIn: string
  ScheduledTimeOut: string
  ActualTimeIn: string | null
  ActualTimeOut: string | null
  LateMinutes: number
  UndertimeMinutes: number
  OvertimeMinutes: number
  NightDiffMinutes: number
  Status: string
  IsManualEntry: boolean
  RemarkNote: string | null
  EmployeeNo: string
  FirstName: string
  LastName: string
  DepartmentName: string | null
}

function DtrPage() {
  const [records, setRecords] = useState<DTRRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 25

  const today = dayjs().format('YYYY-MM-DD')
  const firstOfMonth = dayjs().startOf('month').format('YYYY-MM-DD')
  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)
  const [employeeId, setEmployeeId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    api.get('/employees?pageSize=500').then(({ data }) => setEmployees(data?.data?.employees || [])).catch(() => {})
  }, [])

  useEffect(() => {
    fetchRecords()
  }, [page, startDate, endDate, employeeId, statusFilter])

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        startDate,
        endDate,
      })
      if (employeeId) params.set('employeeId', employeeId)
      if (statusFilter) params.set('status', statusFilter)

      const { data } = await api.get(`/attendance/dtr-records?${params}`)
      setRecords(data?.data?.records || [])
      setTotal(data?.data?.pagination?.total || 0)
    } catch (err) {
      console.error('Failed to fetch DTR records:', err)
      setError('Failed to load DTR records')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPdf = () => {
    const params = new URLSearchParams({
      month: dayjs(startDate).format('M'),
      year: dayjs(startDate).format('YYYY'),
    })
    if (employeeId) params.set('employeeId', employeeId)
    window.open(`/api/v1/attendance/dtr/pdf?${params}`, '_blank')
  }

  const handleRecompute = async () => {
    try {
      await api.post('/attendance/compute-dtr', { date: dayjs().subtract(1, 'day').format('YYYY-MM-DD') })
      fetchRecords()
    } catch {
      setError('Failed to recompute DTR')
    }
  }

  const totalPages = Math.ceil(total / pageSize)
  const summary = records.reduce((acc, r) => ({
    late: acc.late + (r.LateMinutes || 0),
    undertime: acc.undertime + (r.UndertimeMinutes || 0),
    overtime: acc.overtime + (r.OvertimeMinutes || 0),
    nightDiff: acc.nightDiff + (r.NightDiffMinutes || 0),
  }), { late: 0, undertime: 0, overtime: 0, nightDiff: 0 })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Time Records</h1>
          <p className="text-gray-500 text-sm mt-1">Computed attendance records with late, undertime, overtime, and night diff</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDownloadPdf} className="border border-primary-300 text-primary-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-50 transition">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Download PDF
            </span>
          </button>
          <button onClick={handleRecompute} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg>
              Recompute
            </span>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-700 hover:text-red-900 font-medium">&times;</button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Employee</label>
            <select value={employeeId} onChange={e => { setEmployeeId(e.target.value); setPage(1) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">All Employees</option>
              {employees.map(e => (
                <option key={e.Id} value={e.Id}>{e.EmployeeNo} - {e.FirstName} {e.LastName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">All Status</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
              <option value="Late">Late</option>
              <option value="HalfDay">Half Day</option>
              <option value="OnLeave">On Leave</option>
              <option value="Holiday">Holiday</option>
              <option value="RestDay">Rest Day</option>
            </select>
          </div>
          <div className="flex items-end">
            <span className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-lg w-full text-center">
              {total} record{total !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dept</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Scheduled</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actual</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Late</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Under</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">OT</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">ND</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((r) => {
                  const scheduled = `${r.ScheduledTimeIn} - ${r.ScheduledTimeOut}`
                  const actualIn = r.ActualTimeIn ? dayjs(r.ActualTimeIn).format('hh:mm A') : '--'
                  const actualOut = r.ActualTimeOut ? dayjs(r.ActualTimeOut).format('hh:mm A') : '--'
                  return (
                    <tr key={r.Id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap font-medium">
                        {dayjs(r.WorkDate).format('ddd, MMM D')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                        <span className="font-medium">{r.EmployeeNo}</span>
                        <span className="text-gray-400 ml-1">{r.FirstName} {r.LastName}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{r.DepartmentName || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap text-center font-mono">{scheduled}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap text-center font-mono">
                        {actualIn} - {actualOut}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap text-right tabular-nums">
                        {r.LateMinutes > 0 ? (
                          <span className="text-red-600 font-medium">{r.LateMinutes}m</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap text-right tabular-nums">
                        {r.UndertimeMinutes > 0 ? (
                          <span className="text-amber-600 font-medium">{r.UndertimeMinutes}m</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap text-right tabular-nums">
                        {r.OvertimeMinutes > 0 ? (
                          <span className="text-blue-600 font-medium">{r.OvertimeMinutes}m</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap text-right tabular-nums">
                        {r.NightDiffMinutes > 0 ? (
                          <span className="text-violet-600 font-medium">{r.NightDiffMinutes}m</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <StatusBadge status={r.Status} />
                      </td>
                    </tr>
                  )
                })}
                {records.length === 0 && (
                  <tr><td colSpan={10} className="px-6 py-8 text-center text-gray-500">No DTR records found for the selected filters</td></tr>
                )}
              </tbody>
              {records.length > 0 && (
                <tfoot className="bg-gray-50/50 border-t border-gray-200">
                  <tr className="text-sm font-semibold text-gray-700">
                    <td colSpan={5} className="px-4 py-3 text-right">Totals:</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600">{summary.late > 0 ? `${summary.late}m` : '-'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-600">{summary.undertime > 0 ? `${summary.undertime}m` : '-'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-blue-600">{summary.overtime > 0 ? `${summary.overtime}m` : '-'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-violet-600">{summary.nightDiff > 0 ? `${summary.nightDiff}m` : '-'}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Previous</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Attendance Component ───────────────────────────────

export default function Attendance() {
  return (
    <Routes>
      <Route index element={<AttendanceDashboard />} />
      <Route path="dtr" element={<DtrPage />} />
      <Route path="overtime" element={<OvertimeList />} />
      <Route path="shifts" element={<ShiftsManagement />} />
      <Route path="schedules" element={<SchedulesManagement />} />
      <Route path="geofences" element={<GeofencesManagement />} />
      <Route path="holidays" element={<HolidaysManagement />} />
      <Route path="devices" element={<DevicesManagement />} />
    </Routes>
  )
}
