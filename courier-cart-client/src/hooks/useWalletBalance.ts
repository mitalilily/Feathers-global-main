import { useQuery } from '@tanstack/react-query'
import { fetchWalletBalance, fetchWalletTransactions } from '../api/wallet.api'
import {
  getWalletBalanceQueryKey,
  getWalletTransactionsQueryKey,
} from '../utils/authQueryKeys'

export const useWalletBalance = (enabled = true, authScope?: string) => {
  const query = useQuery({
    queryKey: getWalletBalanceQueryKey(authScope),
    queryFn: fetchWalletBalance,
    enabled,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5, // cache for 5 minutes
  })

  return query
}

interface UseWalletTransactionsOptions {
  limit?: number
  page?: number
  type?: 'credit' | 'debit'
  dateFrom?: string
  dateTo?: string
  enabled?: boolean
  authScope?: string
}

export const useWalletTransactions = ({
  limit = 50,
  page = 0,
  type,
  dateFrom,
  dateTo,
  enabled = true,
  authScope,
}: UseWalletTransactionsOptions = {}) => {
  return useQuery({
    queryKey: getWalletTransactionsQueryKey(page, limit, type, dateFrom, dateTo, authScope),
    queryFn: () =>
      fetchWalletTransactions({
        limit,
        page,
        type,
        dateFrom,
        dateTo,
      }),
    enabled,
  })
}
