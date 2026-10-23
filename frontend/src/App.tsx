import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Employees from './pages/Employees'
import Attendance from './pages/Attendance'
import Leave from './pages/Leave'
import Payroll from './pages/Payroll'
import OrgStructure from './pages/OrgStructure'
import Onboarding from './pages/Onboarding'
import HrMatrix from './pages/HrMatrix'
import Admin from './pages/Admin'
import Layout from './components/Layout'
import RoleGate from './components/RoleGate'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }
  
  return user ? <>{children}</> : <Navigate to="/login" />
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <PrivateRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/employees/*" element={<Employees />} />
                    <Route path="/attendance/*" element={<Attendance />} />
                    <Route path="/leave/*" element={<Leave />} />
                    <Route path="/payroll/*" element={<Payroll />} />
                    <Route path="/org-structure/*" element={<OrgStructure />} />
                    <Route path="/onboarding/*" element={<Onboarding />} />
                    <Route path="/hr-matrix" element={<HrMatrix />} />
                    <Route path="/admin/*" element={<RoleGate roles={['Super Admin', 'Tenant Admin']}><Admin /></RoleGate>} />
                  </Routes>
                </Layout>
              </PrivateRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App
