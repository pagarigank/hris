import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'

interface RoleGateProps {
  /** Allowed role names. If empty, checks permissions instead. */
  roles?: string[]
  /** Required permission codes (any match). If empty, only roles are checked. */
  permissions?: string[]
  /** If true, user must have ALL permissions. Default: any match. */
  requireAll?: boolean
  children: React.ReactNode
}

/**
 * Gate component that restricts page access based on user roles and/or permissions.
 * Renders children if access is granted, otherwise redirects to dashboard.
 *
 * Role hierarchy (from spec §9):
 * - Super Admin: Cross-tenant, platform-level
 * - Tenant Admin: Full access within own tenant
 * - HR Admin: Employee master, payroll, leave, attendance — full within tenant
 * - Payroll Officer: Payroll module only
 * - Department Manager: Own department's attendance/leave approvals, read-only HR matrix
 * - Employee (ESS): Self-service — own DTR, own leave filing, own payslip view, own profile
 */
export default function RoleGate({ roles, permissions, requireAll = false, children }: RoleGateProps) {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />

  let granted = true

  if (roles && roles.length > 0) {
    const hasRole = roles.some(r => user.roles?.includes(r))
    if (!hasRole) granted = false
  }

  if (permissions && permissions.length > 0) {
    if (requireAll) {
      const hasAll = permissions.every(p => user.permissions?.includes(p))
      if (!hasAll) granted = false
    } else {
      const hasAny = permissions.some(p => user.permissions?.includes(p))
      if (!hasAny) granted = false
    }
  }

  if (!granted) return <Navigate to="/" replace />

  return <>{children}</>
}
