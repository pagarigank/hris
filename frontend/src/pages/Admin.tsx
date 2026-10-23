import { useState, useEffect } from 'react'
import { Routes, Route, Link, useParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import StatusBadge from '../components/ui/StatusBadge'

interface Tenant {
  Id: string
  CompanyName: string
  CompanyCode: string
  TIN: string
  SssEmployerNo: string
  PhilHealthEmployerNo: string
  PagIbigEmployerNo: string
  GsisEmployerNo: string
  IsGovernment: boolean
  Address: string
  SubscriptionPlan: string
  Status: string
  CreatedAtUtc: string
  userCount?: number
}

interface User {
  Id: string
  Email: string
  PhoneNumber: string
  IsActive: boolean
  LastLoginAtUtc: string
  CreatedAtUtc: string
  CompanyName: string
  CompanyCode: string
  Roles: string
  TenantId?: string
  roles?: Role[]
}

interface Role {
  Id: string
  Name: string
  IsSystemRole: boolean
  TenantId: string
  CompanyName: string
  PermissionCount: number
  UserCount: number
}

interface Permission {
  Id: string
  Code: string
  Description: string
}

interface ContributionTable {
  Id: number
  EffectiveYear: number
  TableType: string
  BracketMin: number
  BracketMax: number
  EmployeeShare: number | null
  EmployerShare: number | null
  FixedAmount: number | null
  RatePercent: number | null
  Description: string
}

// ──────────────────────────────────────────────────────────────
// TENANT LIST
// ──────────────────────────────────────────────────────────────

function TenantList() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchTenants() }, [])

  const fetchTenants = async () => {
    try {
      const { data } = await api.get('/admin/tenants')
      setTenants(data.data?.tenants || [])
    } catch (error) {
      console.error('Failed to fetch tenants:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Tenants</h1>
          <p className="text-gray-500">Manage companies and organizations</p>
        </div>
        <Link to="/admin/tenants/new" className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
          New Tenant
        </Link>
      </div>

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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tenants.map((tenant) => (
                  <tr key={tenant.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-gray-900 font-medium">{tenant.CompanyName}</div>
                      <div className="text-gray-500 text-xs">{tenant.TIN}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{tenant.CompanyCode}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{tenant.SubscriptionPlan || 'Basic'}</td>
                    <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={tenant.Status} /></td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Link to={`/admin/tenants/${tenant.Id}`} className="text-primary-600 hover:text-primary-900 text-sm font-medium">View</Link>
                    </td>
                  </tr>
                ))}
                {tenants.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No tenants found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// TENANT FORM
// ──────────────────────────────────────────────────────────────

function TenantForm() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    companyName: '', companyCode: '', tin: '', sssEmployerNo: '',
    philHealthEmployerNo: '', pagIbigEmployerNo: '', gsisEmployerNo: '', isGovernment: false,
    address: '', subscriptionPlan: 'Basic', adminEmail: '', adminPassword: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/admin/tenants', form)
      navigate('/admin/tenants')
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create tenant')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/admin/tenants" className="text-primary-600 hover:text-primary-700 text-sm font-medium">← Back to Tenants</Link>
      <h1 className="text-2xl font-bold text-gray-800">New Tenant</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-2xl">
        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
              <input type="text" required value={form.companyName} onChange={e => setForm({...form, companyName: e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Code *</label>
              <input type="text" required value={form.companyCode} onChange={e => setForm({...form, companyCode: e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">TIN</label>
            <input type="text" value={form.tin} onChange={e => setForm({...form, tin: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" id="isGovernment" checked={form.isGovernment}
              onChange={e => setForm({...form, isGovernment: e.target.checked})}
              className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
            <label htmlFor="isGovernment" className="text-sm font-medium text-gray-700">
              Government / Public Institution (uses GSIS instead of SSS)
            </label>
          </div>

          {form.isGovernment && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <p className="text-xs text-blue-700 font-medium">GSIS Configuration</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GSIS Employer No.</label>
                <input type="text" value={form.gsisEmployerNo} onChange={e => setForm({...form, gsisEmployerNo: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SSS Employer No.</label>
              <input type="text" value={form.sssEmployerNo} onChange={e => setForm({...form, sssEmployerNo: e.target.value})}
                disabled={form.isGovernment}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:text-gray-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PhilHealth Employer No.</label>
              <input type="text" value={form.philHealthEmployerNo} onChange={e => setForm({...form, philHealthEmployerNo: e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pag-IBIG Employer No.</label>
              <input type="text" value={form.pagIbigEmployerNo} onChange={e => setForm({...form, pagIbigEmployerNo: e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input type="text" value={form.address} onChange={e => setForm({...form, address: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Plan</label>
            <select value={form.subscriptionPlan} onChange={e => setForm({...form, subscriptionPlan: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500">
              <option value="Basic">Basic</option>
              <option value="Professional">Professional</option>
              <option value="Enterprise">Enterprise</option>
            </select>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Admin User</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email *</label>
                <input type="email" required value={form.adminEmail} onChange={e => setForm({...form, adminEmail: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Password *</label>
                <input type="password" required value={form.adminPassword} onChange={e => setForm({...form, adminPassword: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button type="submit" disabled={loading}
            className="bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
            {loading ? 'Creating...' : 'Create Tenant'}
          </button>
          <Link to="/admin/tenants" className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition">Cancel</Link>
        </div>
      </form>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// TENANT DETAIL
// ──────────────────────────────────────────────────────────────

function TenantDetail() {
  const { id } = useParams<{ id: string }>()
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { fetchTenant() }, [id])

  const fetchTenant = async () => {
    try {
      const { data } = await api.get(`/admin/tenants/${id}`)
      setTenant(data.data)
    } catch (error) {
      console.error('Failed to fetch tenant:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (status: string) => {
    setActionLoading(true)
    try {
      await api.patch(`/admin/tenants/${id}/status`, { status })
      setMessage(`Tenant ${status === 'Active' ? 'activated' : 'suspended'}`)
      fetchTenant()
    } catch (err: any) {
      setMessage(err.response?.data?.error?.message || 'Failed to update status')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
  if (!tenant) return <div className="text-center text-gray-500 p-8">Tenant not found</div>

  return (
    <div className="space-y-6">
      <Link to="/admin/tenants" className="text-primary-600 hover:text-primary-700 text-sm font-medium">← Back to Tenants</Link>

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{tenant.CompanyName}</h1>
          <p className="text-gray-500">{tenant.CompanyCode}</p>
        </div>
        <div className="flex gap-2">
          <StatusBadge status={tenant.Status} />
          {tenant.Status === 'Active' ? (
            <button onClick={() => updateStatus('Suspended')} disabled={actionLoading}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-sm font-medium transition">
              Suspend
            </button>
          ) : (
            <button onClick={() => updateStatus('Active')} disabled={actionLoading}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg text-sm font-medium transition">
              Activate
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.includes('success') || message.includes('activated') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Plan</p>
          <p className="text-lg font-semibold text-gray-800 mt-1">{tenant.SubscriptionPlan || 'Basic'}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Users</p>
          <p className="text-lg font-semibold text-gray-800 mt-1">{tenant.userCount || 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">TIN</p>
          <p className="text-lg font-semibold text-gray-800 mt-1">{tenant.TIN || 'N/A'}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Address:</span> <span className="font-medium">{tenant.Address || 'N/A'}</span></div>
          <div><span className="text-gray-500">Employer Type:</span> <span className="font-medium">{tenant.IsGovernment ? 'Government (GSIS)' : 'Private (SSS)'}</span></div>
          {tenant.IsGovernment ? (
            <div><span className="text-gray-500">GSIS No:</span> <span className="font-medium">{tenant.GsisEmployerNo || 'N/A'}</span></div>
          ) : (
            <div><span className="text-gray-500">SSS No:</span> <span className="font-medium">{tenant.SssEmployerNo || 'N/A'}</span></div>
          )}
          <div><span className="text-gray-500">PhilHealth No:</span> <span className="font-medium">{tenant.PhilHealthEmployerNo || 'N/A'}</span></div>
          <div><span className="text-gray-500">Pag-IBIG No:</span> <span className="font-medium">{tenant.PagIbigEmployerNo || 'N/A'}</span></div>
        </div>
      </div>

      <div className="flex gap-3">
        <Link to={`/admin/users?tenantId=${id}`} className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
          View Users
        </Link>
        <Link to={`/admin/roles?tenantId=${id}`} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition">
          View Roles
        </Link>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// USER LIST
// ──────────────────────────────────────────────────────────────

function UserList() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/admin/users')
      setUsers(data.data?.users || [])
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Users</h1>
          <p className="text-gray-500">Manage user accounts</p>
        </div>
        <Link to="/admin/users/new" className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
          New User
        </Link>
      </div>

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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Roles</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-medium">{user.Email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{user.CompanyName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">
                      <div className="flex gap-1 flex-wrap">
                        {(user.Roles || '').split(',').filter(Boolean).map((role, i) => (
                          <span key={i} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">{role.trim()}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={user.IsActive ? 'Active' : 'Suspended'} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Link to={`/admin/users/${user.Id}`} className="text-primary-600 hover:text-primary-900 text-sm font-medium">View</Link>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// USER FORM
// ──────────────────────────────────────────────────────────────

function UserForm() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [form, setForm] = useState({ tenantId: '', email: '', password: '', phoneNumber: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/admin/tenants').then(({ data }) => setTenants(data.data?.tenants || []))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/admin/users', form)
      navigate('/admin/users')
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/admin/users" className="text-primary-600 hover:text-primary-700 text-sm font-medium">← Back to Users</Link>
      <h1 className="text-2xl font-bold text-gray-800">New User</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-xl">
        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tenant *</label>
            <select required value={form.tenantId} onChange={e => setForm({...form, tenantId: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500">
              <option value="">Select tenant</option>
              {tenants.map(t => <option key={t.Id} value={t.Id}>{t.CompanyName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" required value={form.email} onChange={e => setForm({...form, email: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
            <input type="password" required value={form.password} onChange={e => setForm({...form, password: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input type="text" value={form.phoneNumber} onChange={e => setForm({...form, phoneNumber: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button type="submit" disabled={loading}
            className="bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
            {loading ? 'Creating...' : 'Create User'}
          </button>
          <Link to="/admin/users" className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition">Cancel</Link>
        </div>
      </form>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// USER DETAIL
// ──────────────────────────────────────────────────────────────

function UserDetail() {
  const { id } = useParams<{ id: string }>()
  const [user, setUser] = useState<User | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState('')

  useEffect(() => { fetchData() }, [id])

  const fetchData = async () => {
    try {
      const [userRes, rolesRes] = await Promise.all([
        api.get(`/admin/users/${id}`),
        api.get('/admin/roles')
      ])
      setUser(userRes.data.data)
      setRoles(rolesRes.data.data?.roles || [])
    } catch (error) {
      console.error('Failed to fetch user:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleStatus = async () => {
    setActionLoading(true)
    try {
      await api.patch(`/admin/users/${id}/status`, { isActive: !user?.IsActive })
      setMessage(`User ${user?.IsActive ? 'deactivated' : 'activated'}`)
      fetchData()
    } catch (err: any) {
      setMessage(err.response?.data?.error?.message || 'Failed to update status')
    } finally {
      setActionLoading(false)
    }
  }

  const assignRole = async () => {
    if (!selectedRoleId) return
    setActionLoading(true)
    try {
      await api.post(`/admin/users/${id}/roles`, { roleId: selectedRoleId })
      setMessage('Role assigned')
      setSelectedRoleId('')
      fetchData()
    } catch (err: any) {
      setMessage(err.response?.data?.error?.message || 'Failed to assign role')
    } finally {
      setActionLoading(false)
    }
  }

  const removeRole = async (roleId: string) => {
    setActionLoading(true)
    try {
      await api.delete(`/admin/users/${id}/roles/${roleId}`)
      setMessage('Role removed')
      fetchData()
    } catch (err: any) {
      setMessage(err.response?.data?.error?.message || 'Failed to remove role')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
  if (!user) return <div className="text-center text-gray-500 p-8">User not found</div>

  return (
    <div className="space-y-6">
      <Link to="/admin/users" className="text-primary-600 hover:text-primary-700 text-sm font-medium">← Back to Users</Link>

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{user.Email}</h1>
          <p className="text-gray-500">{user.CompanyName} ({user.CompanyCode})</p>
        </div>
        <button onClick={toggleStatus} disabled={actionLoading}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition ${user.IsActive ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
          {user.IsActive ? 'Deactivate' : 'Activate'}
        </button>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.includes('success') || message.includes('assigned') || message.includes('removed') || message.includes('activated') || message.includes('deactivated') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Status</p>
          <p className="mt-1"><StatusBadge status={user.IsActive ? 'Active' : 'Suspended'} /></p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Phone</p>
          <p className="text-lg font-semibold text-gray-800 mt-1">{user.PhoneNumber || 'N/A'}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 uppercase font-medium">Last Login</p>
          <p className="text-lg font-semibold text-gray-800 mt-1">{user.LastLoginAtUtc ? new Date(user.LastLoginAtUtc).toLocaleString() : 'Never'}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Roles</h2>
        <div className="space-y-2">
          {(user.roles || []).map(role => (
            <div key={role.Id} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">{role.Name}</span>
              <button onClick={() => removeRole(role.Id)} disabled={actionLoading}
                className="text-red-600 hover:text-red-800 text-xs font-medium">Remove</button>
            </div>
          ))}
          {(!user.roles || user.roles.length === 0) && <p className="text-sm text-gray-500">No roles assigned</p>}
        </div>

        <div className="mt-4 flex gap-2">
          <select value={selectedRoleId} onChange={e => setSelectedRoleId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1">
            <option value="">Select role to assign</option>
            {roles.filter(r => !user.roles?.some(ur => ur.Id === r.Id)).map(r => (
              <option key={r.Id} value={r.Id}>{r.Name} ({r.CompanyName || 'Global'})</option>
            ))}
          </select>
          <button onClick={assignRole} disabled={actionLoading || !selectedRoleId}
            className="bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
            Assign
          </button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// ROLE LIST
// ──────────────────────────────────────────────────────────────

function RoleList() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchRoles() }, [])

  const fetchRoles = async () => {
    try {
      const { data } = await api.get('/admin/roles')
      setRoles(data.data?.roles || [])
    } catch (error) {
      console.error('Failed to fetch roles:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Roles</h1>
          <p className="text-gray-500">Manage roles and permissions</p>
        </div>
        <Link to="/admin/roles/new" className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
          New Role
        </Link>
      </div>

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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Permissions</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Users</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {roles.map((role) => (
                  <tr key={role.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-medium">{role.Name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{role.CompanyName || 'Global'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{role.PermissionCount}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{role.UserCount}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {role.IsSystemRole ? (
                        <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">System</span>
                      ) : (
                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">Custom</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Link to={`/admin/roles/${role.Id}`} className="text-primary-600 hover:text-primary-900 text-sm font-medium">View</Link>
                    </td>
                  </tr>
                ))}
                {roles.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No roles found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// ROLE FORM
// ──────────────────────────────────────────────────────────────

function RoleForm() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [form, setForm] = useState({ tenantId: '', name: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/admin/tenants').then(({ data }) => setTenants(data.data?.tenants || []))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/admin/roles', form)
      navigate('/admin/roles')
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create role')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/admin/roles" className="text-primary-600 hover:text-primary-700 text-sm font-medium">← Back to Roles</Link>
      <h1 className="text-2xl font-bold text-gray-800">New Role</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-xl">
        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
            <select value={form.tenantId} onChange={e => setForm({...form, tenantId: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500">
              <option value="">Global (all tenants)</option>
              {tenants.map(t => <option key={t.Id} value={t.Id}>{t.CompanyName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role Name *</label>
            <input type="text" required value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500" />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button type="submit" disabled={loading}
            className="bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
            {loading ? 'Creating...' : 'Create Role'}
          </button>
          <Link to="/admin/roles" className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition">Cancel</Link>
        </div>
      </form>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// ROLE DETAIL
// ──────────────────────────────────────────────────────────────

function RoleDetail() {
  const { id } = useParams<{ id: string }>()
  const [role, setRole] = useState<Role | null>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [allPermissions, setAllPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedPermId, setSelectedPermId] = useState('')

  useEffect(() => { fetchData() }, [id])

  const fetchData = async () => {
    try {
      const [roleRes, allPermsRes] = await Promise.all([
        api.get(`/admin/roles/${id}`),
        api.get('/admin/permissions')
      ])
      setRole(roleRes.data.data)
      setPermissions(roleRes.data.data?.permissions || [])
      setAllPermissions(allPermsRes.data.data?.permissions || [])
    } catch (error) {
      console.error('Failed to fetch role:', error)
    } finally {
      setLoading(false)
    }
  }

  const assignPermission = async () => {
    if (!selectedPermId) return
    setActionLoading(true)
    try {
      await api.post(`/admin/roles/${id}/permissions`, { permissionId: selectedPermId })
      setMessage('Permission assigned')
      setSelectedPermId('')
      fetchData()
    } catch (err: any) {
      setMessage(err.response?.data?.error?.message || 'Failed to assign permission')
    } finally {
      setActionLoading(false)
    }
  }

  const removePermission = async (permId: string) => {
    setActionLoading(true)
    try {
      await api.delete(`/admin/roles/${id}/permissions/${permId}`)
      setMessage('Permission removed')
      fetchData()
    } catch (err: any) {
      setMessage(err.response?.data?.error?.message || 'Failed to remove permission')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
  if (!role) return <div className="text-center text-gray-500 p-8">Role not found</div>

  return (
    <div className="space-y-6">
      <Link to="/admin/roles" className="text-primary-600 hover:text-primary-700 text-sm font-medium">← Back to Roles</Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-800">{role.Name}</h1>
        <p className="text-gray-500">{role.CompanyName || 'Global'}</p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.includes('success') || message.includes('assigned') || message.includes('removed') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Permissions ({permissions.length})</h2>
        <div className="space-y-2">
          {permissions.map(perm => (
            <div key={perm.Id} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
              <div>
                <span className="text-sm font-medium text-gray-700">{perm.Code}</span>
                {perm.Description && <span className="text-xs text-gray-500 ml-2">- {perm.Description}</span>}
              </div>
              <button onClick={() => removePermission(perm.Id)} disabled={actionLoading}
                className="text-red-600 hover:text-red-800 text-xs font-medium">Remove</button>
            </div>
          ))}
          {permissions.length === 0 && <p className="text-sm text-gray-500">No permissions assigned</p>}
        </div>

        <div className="mt-4 flex gap-2">
          <select value={selectedPermId} onChange={e => setSelectedPermId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1">
            <option value="">Select permission to assign</option>
            {allPermissions.filter(p => !permissions.some(rp => rp.Id === p.Id)).map(p => (
              <option key={p.Id} value={p.Id}>{p.Code} - {p.Description}</option>
            ))}
          </select>
          <button onClick={assignPermission} disabled={actionLoading || !selectedPermId}
            className="bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
            Assign
          </button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// CONTRIBUTION TABLES LIST
// ──────────────────────────────────────────────────────────────

function ContributionTableList() {
  const [tables, setTables] = useState<ContributionTable[]>([])
  const [loading, setLoading] = useState(true)
  const [yearFilter, setYearFilter] = useState<string>(new Date().getFullYear().toString())
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<ContributionTable | null>(null)
  const [message, setMessage] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [showCopyForm, setShowCopyForm] = useState(false)
  const [copySourceYear, setCopySourceYear] = useState(new Date().getFullYear() - 1)
  const [copyTargetYear, setCopyTargetYear] = useState(new Date().getFullYear())

  const [form, setForm] = useState({
    effectiveYear: new Date().getFullYear(),
    tableType: 'SSS',
    bracketMin: 0,
    bracketMax: 999999999,
    employeeShare: '',
    employerShare: '',
    fixedAmount: '',
    ratePercent: '',
    description: ''
  })

  useEffect(() => { fetchTables() }, [yearFilter, typeFilter])

  const fetchTables = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (yearFilter) params.append('year', yearFilter)
      if (typeFilter) params.append('tableType', typeFilter)
      const { data } = await api.get(`/admin/contribution-tables?${params.toString()}`)
      setTables(data.data?.tables || [])
    } catch (error) {
      console.error('Failed to fetch contribution tables:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionLoading(true)
    setMessage('')
    try {
      const payload = {
        ...form,
        employeeShare: form.employeeShare ? parseFloat(form.employeeShare as string) : null,
        employerShare: form.employerShare ? parseFloat(form.employerShare as string) : null,
        fixedAmount: form.fixedAmount ? parseFloat(form.fixedAmount as string) : null,
        ratePercent: form.ratePercent ? parseFloat(form.ratePercent as string) : null,
      }
      if (editingEntry) {
        await api.put(`/admin/contribution-tables/${editingEntry.Id}`, payload)
        setMessage('Entry updated successfully')
      } else {
        await api.post('/admin/contribution-tables', payload)
        setMessage('Entry created successfully')
      }
      setShowAddForm(false)
      setEditingEntry(null)
      resetForm()
      fetchTables()
    } catch (err: any) {
      setMessage(err.response?.data?.error?.message || 'Failed to save entry')
    } finally {
      setActionLoading(false)
    }
  }

  const handleEdit = (entry: ContributionTable) => {
    setForm({
      effectiveYear: entry.EffectiveYear,
      tableType: entry.TableType,
      bracketMin: entry.BracketMin,
      bracketMax: entry.BracketMax,
      employeeShare: entry.EmployeeShare?.toString() || '',
      employerShare: entry.EmployerShare?.toString() || '',
      fixedAmount: entry.FixedAmount?.toString() || '',
      ratePercent: entry.RatePercent?.toString() || '',
      description: entry.Description || ''
    })
    setEditingEntry(entry)
    setShowAddForm(true)
  }

  const handleDelete = async (id: number) => {
    setActionLoading(true)
    try {
      await api.delete(`/admin/contribution-tables/${id}`)
      setMessage('Entry deleted')
      fetchTables()
    } catch (err: any) {
      setMessage(err.response?.data?.error?.message || 'Failed to delete')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCopyYear = async () => {
    setShowCopyForm(false)
    setActionLoading(true)
    try {
      await api.post('/admin/contribution-tables/copy-year', {
        sourceYear: copySourceYear,
        targetYear: copyTargetYear
      })
      setMessage(`Copied from ${copySourceYear} to ${copyTargetYear}`)
      fetchTables()
    } catch (err: any) {
      setMessage(err.response?.data?.error?.message || 'Failed to copy')
    } finally {
      setActionLoading(false)
    }
  }

  const resetForm = () => {
    setForm({
      effectiveYear: new Date().getFullYear(),
      tableType: 'SSS',
      bracketMin: 0,
      bracketMax: 999999999,
      employeeShare: '',
      employerShare: '',
      fixedAmount: '',
      ratePercent: '',
      description: ''
    })
  }

  const TABLE_TYPES = ['SSS', 'PhilHealth', 'PagIbig', 'WithholdingTax', 'DeMinimis', 'GSIS', 'GSIS_EC']
  const years = [2026, 2025, 2024]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Contribution Tables</h1>
          <p className="text-gray-500">Manage government contribution rates (SSS/GSIS, PhilHealth, Pag-IBIG, BIR Tax)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowCopyForm(true); setCopySourceYear(new Date().getFullYear() - 1); setCopyTargetYear(new Date().getFullYear()) }}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition">
            Copy Year
          </button>
          <button onClick={() => { resetForm(); setEditingEntry(null); setShowAddForm(true) }}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
            Add Entry
          </button>
        </div>
      </div>

      {showCopyForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Copy Contribution Table Year</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Source Year</label>
              <select value={copySourceYear} onChange={e => setCopySourceYear(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {[2026, 2025, 2024, 2023].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Target Year</label>
              <select value={copyTargetYear} onChange={e => setCopyTargetYear(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {[2026, 2025, 2024, 2023].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={handleCopyYear} disabled={actionLoading}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition disabled:opacity-50">
                {actionLoading ? 'Copying...' : 'Copy'}
              </button>
              <button onClick={() => setShowCopyForm(false)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.includes('success') || message.includes('Copied') || message.includes('deleted') || message.includes('updated') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
            <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">All Years</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Table Type</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">All Types</option>
              {TABLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">{editingEntry ? 'Edit Entry' : 'Add Entry'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Year *</label>
                <input type="number" required value={form.effectiveYear} onChange={e => setForm({...form, effectiveYear: parseInt(e.target.value)})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Type *</label>
                <select value={form.tableType} onChange={e => setForm({...form, tableType: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {TABLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Bracket Min</label>
                <input type="number" step="0.01" value={form.bracketMin} onChange={e => setForm({...form, bracketMin: parseFloat(e.target.value) || 0})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Bracket Max</label>
                <input type="number" step="0.01" value={form.bracketMax} onChange={e => setForm({...form, bracketMax: parseFloat(e.target.value) || 999999999})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Employee Share</label>
                <input type="number" step="0.01" value={form.employeeShare} onChange={e => setForm({...form, employeeShare: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Leave blank if N/A" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Employer Share</label>
                <input type="number" step="0.01" value={form.employerShare} onChange={e => setForm({...form, employerShare: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Leave blank if N/A" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Fixed Amount</label>
                <input type="number" step="0.01" value={form.fixedAmount} onChange={e => setForm({...form, fixedAmount: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Leave blank if N/A" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Rate %</label>
                <input type="number" step="0.01" value={form.ratePercent} onChange={e => setForm({...form, ratePercent: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Leave blank if N/A" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <input type="text" value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={actionLoading}
                className="bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white px-4 py-2 rounded-lg font-medium text-sm transition">
                {actionLoading ? 'Saving...' : editingEntry ? 'Update Entry' : 'Add Entry'}
              </button>
              <button type="button" onClick={() => { setShowAddForm(false); setEditingEntry(null); resetForm() }}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bracket</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">EE Share</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ER Share</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fixed</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate %</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tables.map((entry) => (
                  <tr key={entry.Id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{entry.EffectiveYear}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        entry.TableType === 'SSS' ? 'bg-blue-100 text-blue-800' :
                        entry.TableType === 'PhilHealth' ? 'bg-green-100 text-green-800' :
                        entry.TableType === 'PagIbig' ? 'bg-purple-100 text-purple-800' :
                        entry.TableType === 'WithholdingTax' ? 'bg-red-100 text-red-800' :
                        entry.TableType === 'GSIS' ? 'bg-teal-100 text-teal-800' :
                        entry.TableType === 'GSIS_EC' ? 'bg-cyan-100 text-cyan-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {entry.TableType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {entry.BracketMin.toLocaleString()} - {entry.BracketMax.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{entry.EmployeeShare?.toLocaleString() || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{entry.EmployerShare?.toLocaleString() || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{entry.FixedAmount?.toLocaleString() || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{entry.RatePercent || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{entry.Description}</td>
                    <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                      <button onClick={() => handleEdit(entry)} className="text-primary-600 hover:text-primary-900 font-medium mr-3">Edit</button>
                      <button onClick={() => handleDelete(entry.Id)} disabled={actionLoading}
                        className="text-red-600 hover:text-red-900 font-medium">Delete</button>
                    </td>
                  </tr>
                ))}
                {tables.length === 0 && (
                  <tr><td colSpan={9} className="px-6 py-8 text-center text-gray-500">No entries found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// ADMIN PAGE (MAIN ROUTER)
// ──────────────────────────────────────────────────────────────

export default function Admin() {
  return (
    <Routes>
      <Route path="/" element={<TenantList />} />
      <Route path="/tenants" element={<TenantList />} />
      <Route path="/tenants/new" element={<TenantForm />} />
      <Route path="/tenants/:id" element={<TenantDetail />} />
      <Route path="/users" element={<UserList />} />
      <Route path="/users/new" element={<UserForm />} />
      <Route path="/users/:id" element={<UserDetail />} />
      <Route path="/roles" element={<RoleList />} />
      <Route path="/roles/new" element={<RoleForm />} />
      <Route path="/roles/:id" element={<RoleDetail />} />
      <Route path="/contribution-tables" element={<ContributionTableList />} />
    </Routes>
  )
}
