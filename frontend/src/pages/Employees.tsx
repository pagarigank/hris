import { useState, useEffect } from 'react'
import { Link, Routes, Route, useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import PageHeader from '../components/ui/PageHeader'
import StatusBadge from '../components/ui/StatusBadge'
import Button from '../components/ui/Button'
import FileUpload, { useFileDownload } from '../components/ui/FileUpload'

interface Employee {
  Id: string
  EmployeeNo: string
  FirstName: string
  MiddleName: string
  LastName: string
  Suffix: string
  BirthDate: string
  Gender: string
  CivilStatus: string
  Nationality: string
  PhilSysNo: string
  TIN: string
  SssNo: string
  PhilHealthNo: string
  PagIbigNo: string
  Email: string
  MobileNumber: string
  Address: string
  EmploymentStatus: string
  DateHired: string
  DateRegularized: string
  DateSeparated: string
  SeparationReason: string
  DepartmentId: string
  DepartmentName: string
  PositionId: string
  PositionTitle: string
  ImmediateSupervisorId: string
  SupervisorFirstName: string
  SupervisorLastName: string
  BasicSalary: number
  PayFrequency: string
  BankName: string
  BankAccountNo: string
  PhotoUrl: string
  IsActive: boolean
}

interface Department { Id: string; Name: string; Code: string; ParentDepartmentId: string | null }
interface Position { Id: string; Title: string; DepartmentId: string; DepartmentName: string; JobGrade: string; SalaryGradeMin: number; SalaryGradeMax: number }

interface Dependent { Id: string; FullName: string; Relationship: string; BirthDate: string }
interface Document { Id: string; DocType: string; FileUrl: string; UploadedAtUtc: string; ExpiryDate: string }
interface HistoryRecord { Id: string; EffectiveDate: string; ChangeType: string; OldValueJson: string; NewValueJson: string; CreatedByFirstName: string; CreatedByLastName: string }
interface Loan { Id: string; LoanType: string; PrincipalAmount: number; MonthlyAmortization: number; RemainingBalance: number; StartDate: string; EndDate: string }
interface PeraSummary { ytdEmployeeShare: number; ytdEmployerShare: number; contributionCount: number; annualLimitLocal: number; remainingLimitLocal: number }

function EmployeeList() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchEmployees() }, [])

  const fetchEmployees = async () => {
    try {
      const { data } = await api.get('/employees')
      setEmployees(data.data?.employees || [])
    } catch (error) {
      console.error('Failed to fetch employees:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredEmployees = employees.filter(
    (emp) =>
      emp.FirstName?.toLowerCase().includes(search.toLowerCase()) ||
      emp.LastName?.toLowerCase().includes(search.toLowerCase()) ||
      emp.Email?.toLowerCase().includes(search.toLowerCase()) ||
      emp.EmployeeNo?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        subtitle="Manage your workforce"
        action={
          <Link
            to="/employees/new"
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition inline-flex items-center"
          >
            <span className="mr-2">+</span>
            Add Employee
          </Link>
        }
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search by name, email, or employee no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-96 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          />
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Dept</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Position</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredEmployees.map((employee) => (
                  <tr key={employee.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                          {employee.PhotoUrl ? (
                            <img src={employee.PhotoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                          ) : (
                            <span className="font-medium text-primary-700">{employee.FirstName?.[0]}{employee.LastName?.[0]}</span>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="font-medium text-gray-900">{employee.FirstName} {employee.LastName}</div>
                          <div className="text-sm text-gray-500">{employee.EmployeeNo}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden sm:table-cell text-gray-900">{employee.DepartmentName}</td>
                    <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell text-gray-900">{employee.PositionTitle}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={employee.EmploymentStatus} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-3">
                      <Link to={`/employees/${employee.Id}`} className="text-primary-600 hover:text-primary-900 font-medium">View</Link>
                      <Link to={`/employees/${employee.Id}/edit`} className="text-gray-500 hover:text-gray-700 font-medium">Edit</Link>
                    </td>
                  </tr>
                ))}
                {filteredEmployees.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No employees found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function DocumentDownloadLink({ filePath }: { filePath: string }) {
  const { getDownloadUrl } = useFileDownload()
  const [url, setUrl] = useState('#')

  useEffect(() => {
    if (filePath) getDownloadUrl(filePath).then(setUrl)
  }, [filePath])

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="text-primary-600 hover:text-primary-800 hover:underline truncate block max-w-[200px]">
      {filePath.split('/').pop() || filePath}
    </a>
  )
}

function EmployeeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [dependents, setDependents] = useState<Dependent[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loans, setLoans] = useState<Loan[]>([])
  const [peraEnrollment, setPeraEnrollment] = useState<any>(null)
  const [peraSummary, setPeraSummary] = useState<PeraSummary | null>(null)
  const [payslips, setPayslips] = useState<any[]>([])

  useEffect(() => {
    fetchEmployeeData()
  }, [id])

  const fetchEmployeeData = async () => {
    if (!id) return
    const currentYear = new Date().getFullYear()
    try {
      const [empRes, depRes, docRes, histRes, loansRes, peraEnrollRes, peraSumRes, payslipRes] = await Promise.all([
        api.get(`/employees/${id}`),
        api.get(`/employees/${id}/dependents`).catch(() => ({ data: { data: { dependents: [] } } })),
        api.get(`/employees/${id}/documents`).catch(() => ({ data: { data: { documents: [] } } })),
        api.get(`/employees/${id}/history`).catch(() => ({ data: { data: { history: [] } } })),
        api.get('/payroll/loans', { params: { employeeId: id } }).catch(() => ({ data: { data: { loans: [] } } })),
        api.get('/payroll/pera/enrollments', { params: { employeeId: id } }).catch(() => ({ data: { data: { enrollments: [] } } })),
        api.get(`/payroll/pera/contributions/${id}/summary`, { params: { year: currentYear } }).catch(() => ({ data: null })),
        api.get('/payroll/payslips', { params: { employeeId: id } }).catch(() => ({ data: { data: { payslips: [] } } })),
      ])
      setEmployee(empRes.data.data?.employee)
      setDependents(depRes.data.data?.dependents || [])
      setDocuments(docRes.data.data?.documents || [])
      setHistory(histRes.data.data?.history || [])
      setLoans(loansRes.data.data?.loans || [])
      const enrollments = peraEnrollRes.data.data?.enrollments || []
      setPeraEnrollment(enrollments.find((e: any) => e.IsEnrolled) || null)
      setPeraSummary(peraSumRes.data.data)
      setPayslips(payslipRes.data.data?.payslips || [])
    } catch {
      // errors handled individually above
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="animate-pulse text-gray-500 py-8">Loading employee details...</div>
  if (!employee) return <div className="text-gray-500 py-8">Employee not found</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => navigate('/employees')} className="text-primary-600 hover:text-primary-700 text-sm mb-2">&larr; Back to Employees</button>
          <h1 className="text-2xl font-bold text-gray-800">{employee.FirstName} {employee.LastName}</h1>
          <p className="text-gray-500">{employee.EmployeeNo} &middot; {employee.PositionTitle}</p>
        </div>
        <Link to={`/employees/${id}/edit`}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors duration-150 shadow-sm">
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Personal Information</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {[
              ['Employee No', employee.EmployeeNo],
              ['Full Name', `${employee.FirstName} ${employee.MiddleName || ''} ${employee.LastName} ${employee.Suffix || ''}`],
              ['Birth Date', employee.BirthDate ? new Date(employee.BirthDate).toLocaleDateString() : '-'],
              ['Gender', employee.Gender || '-'],
              ['Civil Status', employee.CivilStatus || '-'],
              ['Nationality', employee.Nationality || '-'],
              ['PhilSys No.', employee.PhilSysNo || '-'],
              ['Email', employee.Email || '-'],
              ['Mobile', employee.MobileNumber || '-'],
              ['Address', employee.Address || '-'],
            ].map(([label, value]) => (
              <div key={label as string} className={label === 'Address' ? 'col-span-2' : ''}>
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-900 mt-1">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Employment Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Employment Details</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {[
              ['Department', employee.DepartmentName],
              ['Position', employee.PositionTitle],
              ['Supervisor', employee.SupervisorFirstName ? `${employee.SupervisorFirstName} ${employee.SupervisorLastName}` : '-'],
              ['Status', employee.EmploymentStatus],
              ['Date Hired', employee.DateHired ? new Date(employee.DateHired).toLocaleDateString() : '-'],
              ['Date Regularized', employee.DateRegularized ? new Date(employee.DateRegularized).toLocaleDateString() : '-'],
              ['Date Separated', employee.DateSeparated ? new Date(employee.DateSeparated).toLocaleDateString() : '-'],
              ['Separation Reason', employee.SeparationReason || '-'],
              ['Basic Salary', employee.BasicSalary ? `\u20B1${Number(employee.BasicSalary).toLocaleString()}` : '-'],
              ['Pay Frequency', employee.PayFrequency || '-'],
              ['Active', employee.IsActive ? 'Yes' : 'No'],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-900 mt-1">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Government IDs */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Government IDs</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {[
              ['TIN', employee.TIN],
              ['SSS No.', employee.SssNo],
              ['PhilHealth No.', employee.PhilHealthNo],
              ['Pag-IBIG No.', employee.PagIbigNo],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-900 mt-1">{value || '-'}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Bank Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Bank Information</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {[
              ['Bank Name', employee.BankName],
              ['Account No.', employee.BankAccountNo],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-gray-500">{label}</dt>
                <dd className="font-medium text-gray-900 mt-1">{value || '-'}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Dependents */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Dependents ({dependents.length})</h2>
          {dependents.length === 0 ? (
            <p className="text-gray-500 text-sm">No dependents on file</p>
          ) : (
            <div className="space-y-3">
              {dependents.map(dep => (
                <div key={dep.Id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">{dep.FullName}</div>
                    <div className="text-sm text-gray-500">{dep.Relationship}{dep.BirthDate ? ` \u00B7 ${new Date(dep.BirthDate).toLocaleDateString()}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Employment History */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Employment History ({history.length})</h2>
          {history.length === 0 ? (
            <p className="text-gray-500 text-sm">No changes recorded</p>
          ) : (
            <div className="space-y-3">
              {history.slice(0, 10).map(h => (
                <div key={h.Id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-900">{h.ChangeType}</span>
                    <span className="text-sm text-gray-500">{new Date(h.EffectiveDate).toLocaleDateString()}</span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    by {h.CreatedByFirstName} {h.CreatedByLastName}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Documents ({documents.length})</h2>
          </div>

          {/* Upload area */}
          <FileUpload
            context="document"
            label="Upload Employee Document"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            onUploaded={async (filePath) => {
              try {
                await api.post(`/employees/${id}/documents`, {
                  docType: 'Other',
                  fileUrl: filePath,
                })
                fetchEmployeeData()
              } catch (err: any) {
                alert(err.response?.data?.error?.message || 'Failed to save document record')
              }
            }}
            onError={(msg) => alert(msg)}
            className="mb-4"
          />

          {documents.length === 0 ? (
            <p className="text-gray-500 text-sm">No documents uploaded</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Expiry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {documents.map(doc => (
                    <tr key={doc.Id}>
                      <td className="px-4 py-2">{doc.DocType}</td>
                      <td className="px-4 py-2">
                        <DocumentDownloadLink filePath={doc.FileUrl} />
                      </td>
                      <td className="px-4 py-2">{new Date(doc.UploadedAtUtc).toLocaleDateString()}</td>
                      <td className="px-4 py-2">{doc.ExpiryDate ? new Date(doc.ExpiryDate).toLocaleDateString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Payroll & Benefits */}
        <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Payroll &amp; Benefits</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Loans */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                Loans ({loans.length})
              </h3>
              {loans.length === 0 ? (
                <p className="text-gray-400 text-sm">No active loans</p>
              ) : (
                <div className="space-y-2">
                  {loans.map(loan => (
                    <div key={loan.Id} className="p-3 bg-gray-50 rounded-lg text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-800">{loan.LoanType}</span>
                        <span className="text-gray-500">&#x20B1;{loan.MonthlyAmortization.toLocaleString()}/mo</span>
                      </div>
                      <div className="flex justify-between mt-1 text-gray-500">
                        <span>Balance: &#x20B1;{loan.RemainingBalance.toLocaleString()}</span>
                        <span>Principal: &#x20B1;{loan.PrincipalAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PERA */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                PERA
              </h3>
              {!peraEnrollment ? (
                <p className="text-gray-400 text-sm">Not enrolled</p>
              ) : (
                <div className="space-y-2">
                  <div className="p-3 bg-green-50 rounded-lg text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-800">EE Contribution</span>
                      <span>&#x20B1;{peraEnrollment.EmployeeContributionAmount?.toLocaleString() || '0'}</span>
                    </div>
                    {peraEnrollment.EmployerMatchType && (
                      <div className="flex justify-between mt-1 text-gray-600">
                        <span>ER Match</span>
                        <span>{peraEnrollment.EmployerMatchType === 'Fixed' ? `\u20B1${peraEnrollment.EmployerMatchValue}` : `${peraEnrollment.EmployerMatchValue}%`}</span>
                      </div>
                    )}
                  </div>
                  {peraSummary && (
                    <div className="p-3 bg-blue-50 rounded-lg text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">YTD EE Share</span>
                        <span className="font-medium">&#x20B1;{peraSummary.ytdEmployeeShare?.toLocaleString() || '0'}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-gray-600">YTD ER Share</span>
                        <span className="font-medium">&#x20B1;{peraSummary.ytdEmployerShare?.toLocaleString() || '0'}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-gray-600">Contributions</span>
                        <span className="font-medium">{peraSummary.contributionCount || 0}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-gray-600">Remaining Limit</span>
                        <span className="font-medium text-amber-600">&#x20B1;{peraSummary.remainingLimitLocal?.toLocaleString() || '200,000'}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pag-IBIG & SSS Contributions */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 uppercase mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500 inline-block"></span>
                Contributions
              </h3>
              {payslips.length === 0 ? (
                <p className="text-gray-400 text-sm">No contribution history</p>
              ) : (
                <div className="space-y-2">
                  <div className="p-3 bg-purple-50 rounded-lg text-sm">
                    <div className="font-medium text-gray-800 mb-2">Pag-IBIG</div>
                    <div className="flex justify-between text-gray-600">
                      <span>Total EE Share</span>
                      <span className="font-medium">&#x20B1;{payslips.reduce((s, p) => s + (p.PagIbigEmployeeShare || 0), 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 mt-1">
                      <span>Total ER Share</span>
                      <span className="font-medium">&#x20B1;{payslips.reduce((s, p) => s + (p.PagIbigEmployerShare || 0), 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 mt-1">
                      <span>Pay periods</span>
                      <span className="font-medium">{payslips.filter(p => (p.PagIbigEmployeeShare || 0) > 0).length}</span>
                    </div>
                  </div>
                  <div className="p-3 bg-orange-50 rounded-lg text-sm">
                    <div className="font-medium text-gray-800 mb-2">SSS</div>
                    <div className="flex justify-between text-gray-600">
                      <span>Total EE Share</span>
                      <span className="font-medium">&#x20B1;{payslips.reduce((s, p) => s + (p.SssEmployeeShare || 0), 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 mt-1">
                      <span>Total ER Share</span>
                      <span className="font-medium">&#x20B1;{payslips.reduce((s, p) => s + (p.SssEmployerShare || 0), 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 mt-1">
                      <span>Months paid</span>
                      <span className="font-medium">{new Set(payslips.filter(p => (p.SssEmployeeShare || 0) > 0).map(p => p.PeriodStart?.slice(0, 7))).size}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

function EmployeeForm({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    employeeNo: '', firstName: '', middleName: '', lastName: '', suffix: '',
    birthDate: '', gender: '', civilStatus: '', nationality: '',
    philSysNo: '', tin: '', sssNo: '', philHealthNo: '', pagIbigNo: '',
    email: '', mobileNumber: '', address: '',
    employmentStatus: 'Probationary', dateHired: '', dateRegularized: '',
    dateSeparated: '', separationReason: '',
    departmentId: '', positionId: '',
    immediateSupervisorId: '', basicSalary: '', payFrequency: 'Monthly',
    bankName: '', bankAccountNo: '', photoUrl: '', isActive: 'true',
  })

  useEffect(() => {
    Promise.all([
      api.get('/employees/departments'),
      api.get('/employees/positions'),
      api.get('/employees?pageSize=200'),
    ]).then(([deptRes, posRes, empRes]) => {
      setDepartments(deptRes.data.data?.departments || [])
      setPositions(posRes.data.data?.positions || [])
      setEmployees(empRes.data.data?.employees || [])
    })

    if (mode === 'edit' && id) {
      api.get(`/employees/${id}`).then(res => {
        const emp = res.data.data?.employee
        if (emp) {
          setForm({
            employeeNo: emp.EmployeeNo || '',
            firstName: emp.FirstName || '', middleName: emp.MiddleName || '',
            lastName: emp.LastName || '', suffix: emp.Suffix || '',
            birthDate: emp.BirthDate ? emp.BirthDate.split('T')[0] : '',
            gender: emp.Gender || '', civilStatus: emp.CivilStatus || '',
            nationality: emp.Nationality || '',
            philSysNo: emp.PhilSysNo || '',
            tin: emp.TIN || '', sssNo: emp.SssNo || '',
            philHealthNo: emp.PhilHealthNo || '', pagIbigNo: emp.PagIbigNo || '',
            email: emp.Email || '', mobileNumber: emp.MobileNumber || '',
            address: emp.Address || '',
            employmentStatus: emp.EmploymentStatus || 'Probationary',
            dateHired: emp.DateHired ? emp.DateHired.split('T')[0] : '',
            dateRegularized: emp.DateRegularized ? emp.DateRegularized.split('T')[0] : '',
            dateSeparated: emp.DateSeparated ? emp.DateSeparated.split('T')[0] : '',
            separationReason: emp.SeparationReason || '',
            departmentId: emp.DepartmentId || '', positionId: emp.PositionId || '',
            immediateSupervisorId: emp.ImmediateSupervisorId || '',
            basicSalary: emp.BasicSalary?.toString() || '',
            payFrequency: emp.PayFrequency || 'Monthly',
            bankName: emp.BankName || '', bankAccountNo: emp.BankAccountNo || '',
            photoUrl: emp.PhotoUrl || '',
            isActive: emp.IsActive ? 'true' : 'false',
          })
        }
        setLoading(false)
      }).catch(() => setLoading(false))
    }
  }, [mode, id])

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))

  const filteredPositions = form.departmentId
    ? positions.filter(p => p.DepartmentId === form.departmentId)
    : positions

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      const payload = {
        ...form,
        basicSalary: form.basicSalary ? Number(form.basicSalary) : undefined,
        isActive: form.isActive === 'true',
      }

      if (mode === 'create') {
        await api.post('/employees', payload)
        navigate('/employees')
      } else {
        await api.put(`/employees/${id}`, payload)
        navigate(`/employees/${id}`)
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to save employee')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="animate-pulse text-gray-500 py-8">Loading...</div>

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => navigate(-1)} className="text-primary-600 hover:text-primary-700 text-sm mb-2">&larr; Back</button>
        <h1 className="text-2xl font-bold text-gray-800">{mode === 'create' ? 'Add New Employee' : 'Edit Employee'}</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Personal Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee No *</label>
              <input type="text" required value={form.employeeNo} onChange={e => set('employeeNo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <input type="text" required value={form.firstName} onChange={e => set('firstName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Middle Name</label>
              <input type="text" value={form.middleName} onChange={e => set('middleName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
              <input type="text" required value={form.lastName} onChange={e => set('lastName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Suffix</label>
              <input type="text" value={form.suffix} onChange={e => set('suffix', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Birth Date</label>
              <input type="date" value={form.birthDate} onChange={e => set('birthDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
              <select value={form.gender} onChange={e => set('gender', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Civil Status</label>
              <select value={form.civilStatus} onChange={e => set('civilStatus', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="">Select</option>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Widowed">Widowed</option>
                <option value="Separated">Separated</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nationality</label>
              <input type="text" value={form.nationality} onChange={e => set('nationality', e.target.value)} placeholder="Filipino"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PhilSys No. (National ID)</label>
              <input type="text" value={form.philSysNo} onChange={e => set('philSysNo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
              <input type="text" value={form.mobileNumber} onChange={e => set('mobileNumber', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input type="text" value={form.address} onChange={e => set('address', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
          </div>
        </div>

        {/* Employment Details */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Employment Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
              <select required value={form.departmentId} onChange={e => { set('departmentId', e.target.value); set('positionId', '') }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="">Select Department</option>
                {departments.map(d => <option key={d.Id} value={d.Id}>{d.Name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Position *</label>
              <select required value={form.positionId} onChange={e => set('positionId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="">Select Position</option>
                {filteredPositions.map(p => <option key={p.Id} value={p.Id}>{p.Title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor</label>
              <select value={form.immediateSupervisorId} onChange={e => set('immediateSupervisorId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="">None</option>
                {employees.filter(e => e.Id !== id).map(e => (
                  <option key={e.Id} value={e.Id}>{e.FirstName} {e.LastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employment Status *</label>
              <select required value={form.employmentStatus} onChange={e => set('employmentStatus', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="Probationary">Probationary</option>
                <option value="Regular">Regular</option>
                <option value="Contractual">Contractual</option>
                <option value="Project-Based">Project-Based</option>
                <option value="Seasonal">Seasonal</option>
                <option value="Separated">Separated</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Hired *</label>
              <input type="date" required value={form.dateHired} onChange={e => set('dateHired', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Regularized</label>
              <input type="date" value={form.dateRegularized} onChange={e => set('dateRegularized', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Basic Salary (PHP) *</label>
              <input type="number" required step="0.01" min="0" value={form.basicSalary} onChange={e => set('basicSalary', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pay Frequency</label>
              <select value={form.payFrequency} onChange={e => set('payFrequency', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="Monthly">Monthly</option>
                <option value="SemiMonthly">Semi-Monthly</option>
                <option value="Weekly">Weekly</option>
                <option value="Daily">Daily</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Active</label>
              <select value={form.isActive} onChange={e => set('isActive', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            {form.isActive === 'false' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date Separated</label>
                  <input type="date" value={form.dateSeparated} onChange={e => set('dateSeparated', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Separation Reason</label>
                  <input type="text" value={form.separationReason} onChange={e => set('separationReason', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
                </div>
              </>
            )}
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Photo URL</label>
              <input type="text" value={form.photoUrl} onChange={e => set('photoUrl', e.target.value)} placeholder="https://..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
          </div>
        </div>

        {/* Government IDs */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Government IDs</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ['tin', 'TIN'],
              ['sssNo', 'SSS No.'],
              ['philHealthNo', 'PhilHealth No.'],
              ['pagIbigNo', 'Pag-IBIG No.'],
            ].map(([field, label]) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type="text" value={(form as any)[field]} onChange={e => set(field, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
              </div>
            ))}
          </div>
        </div>

        {/* Bank Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Bank Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
              <input type="text" value={form.bankName} onChange={e => set('bankName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account No.</label>
              <input type="text" value={form.bankAccountNo} onChange={e => set('bankAccountNo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none" />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors duration-150 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]">
            {saving ? (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : null}
            {saving ? 'Saving...' : mode === 'create' ? 'Create Employee' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function Employees() {
  return (
    <Routes>
      <Route path="/" element={<EmployeeList />} />
      <Route path="/new" element={<EmployeeForm mode="create" />} />
      <Route path="/:id" element={<EmployeeDetail />} />
      <Route path="/:id/edit" element={<EmployeeForm mode="edit" />} />
    </Routes>
  )
}
