import { useQuery } from '@tanstack/react-query'
import { getAdminOpsAnalytics } from 'services/opsAnalytics.service'

export const useOpsAnalytics = (filters = {}) => {
  return useQuery({
    queryKey: [
      'admin-ops-analytics',
      filters.fromDate || '',
      filters.toDate || '',
      filters.search || '',
      filters.courier || '',
      filters.zone || '',
      filters.accountId || '',
    ],
    queryFn: () =>
      getAdminOpsAnalytics({
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
        search: filters.search || undefined,
        courier: filters.courier || undefined,
        zone: filters.zone || undefined,
        accountId: filters.accountId || undefined,
        userId: filters.accountId || undefined,
      }),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 2 * 60 * 1000,
  })
}
