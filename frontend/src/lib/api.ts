import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true, // send cookies with every request
  headers: {
    'Content-Type': 'application/json',
  },
})

// Shared refresh lock — prevents multiple concurrent refresh attempts
let refreshPromise: Promise<void> | null = null
const SKIP_REFRESH_PATHS = ['/auth/login', '/auth/refresh']

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !SKIP_REFRESH_PATHS.some(p => originalRequest.url?.includes(p))
    ) {
      originalRequest._retry = true
      
      try {
        if (!refreshPromise) {
          refreshPromise = axios.post('/api/v1/auth/refresh', {}, { withCredentials: true }).then(() => {})
        }
        await refreshPromise
        return api(originalRequest)
      } catch (refreshError) {
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        refreshPromise = null
      }
    }
    
    return Promise.reject(error)
  }
)

export default api
