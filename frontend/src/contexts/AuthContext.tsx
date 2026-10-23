import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import api from '../lib/api'

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  roles: string[]
  permissions: string[]
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string, tenantCode?: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is authenticated by calling /auth/me (cookie-based)
    api.get('/auth/me')
      .then(({ data: responseData }) => setUser(responseData.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string, tenantCode: string = 'SYSTEM') => {
    const { data: responseData } = await api.post('/auth/login', { email, password, tenantCode })
    // Tokens are now in httpOnly cookies - just store user data
    setUser(responseData.data.user)
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout', {})
    } finally {
      // Cookies are cleared by the server
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
