import api from './axios'

export async function getAdminOpsAnalytics(params = {}) {
  const { data } = await api.get('/admin/ops/analytics', { params })
  return data
}
