import { useQuery } from '@tanstack/react-query'
import {
  getMerchantOpsAnalytics,
  type MerchantOpsAnalyticsData,
  type MerchantOpsAnalyticsFilters,
} from '../api/dashboard.api'

export const useMerchantOpsAnalytics = (filters: MerchantOpsAnalyticsFilters) => {
  return useQuery<MerchantOpsAnalyticsData, Error>({
    queryKey: [
      'merchantOpsAnalytics',
      filters.fromDate || '',
      filters.toDate || '',
      filters.courier || '',
      filters.zone || '',
      filters.search || '',
      filters.accountId || '',
    ],
    queryFn: () => getMerchantOpsAnalytics(filters),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  })
}
