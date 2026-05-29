import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchDeveloperLiveLogs,
  fetchDeveloperErrorLogs,
  retryDeveloperManifest,
  triggerShadowfaxWebhookTest,
  updateDeveloperIssue,
} from 'services/developer.service'

export const useDeveloperLogs = (page, limit, filters) => {
  return useQuery({
    queryKey: ['developerLogs', page, limit, filters],
    queryFn: () => fetchDeveloperErrorLogs(page, limit, filters),
    keepPreviousData: true,
  })
}

export const useDeveloperLiveLogs = (enabled, limit = 1000) => {
  return useQuery({
    queryKey: ['developerLiveLogs', limit],
    queryFn: () => fetchDeveloperLiveLogs(limit),
    enabled,
    refetchInterval: enabled ? 3000 : false,
    refetchIntervalInBackground: true,
  })
}

export const useUpdateDeveloperIssue = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ issueKey, payload }) => updateDeveloperIssue(issueKey, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['developerLogs'] })
    },
  })
}

export const useRetryDeveloperManifest = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ orderId, issueKey }) => retryDeveloperManifest({ orderId, issueKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['developerLogs'] })
    },
  })
}

export const useTriggerShadowfaxWebhookTest = () => {
  return useMutation({
    mutationFn: (payload) => triggerShadowfaxWebhookTest(payload),
  })
}
