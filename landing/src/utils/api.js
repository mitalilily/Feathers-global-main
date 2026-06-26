const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.shiplifi.com'

export function buildApiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}`
}
