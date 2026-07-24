import {
  Alert,
  Box,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  CUSTOMER_EMAIL_NOTIFICATION_EVENTS,
  SELLER_EMAIL_NOTIFICATION_EVENTS,
  type CustomerEmailNotificationEvent,
  type EmailNotificationPreferences,
  type SellerEmailNotificationEvent,
} from '../../../api/apiIntegration'
import { toast } from '../../../components/UI/Toast'
import {
  useEmailNotificationPreferences,
  useUpdateEmailNotificationPreferences,
} from '../../../hooks/useApiIntegration'

const customerLabels: Record<CustomerEmailNotificationEvent, string> = {
  pickup_done: 'Pickup done',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  undelivered: 'Undelivered',
  reverse_pickup: 'Reverse pickup',
}

const sellerLabels: Record<SellerEmailNotificationEvent, string> = {
  wallet_recharge: 'Wallet recharge related',
  ticket_created: 'Ticket create related',
  account_activated: 'Account activate',
  cod_remittance: 'COD remittance',
  tax_invoice: 'Tax invoice',
  weight_discrepancy: 'Weight discrepancies',
}

const buildOffMap = <T extends string>(events: readonly T[]) =>
  events.reduce(
    (acc, event) => {
      acc[event] = false
      return acc
    },
    {} as Record<T, boolean>,
  )

const defaultPreferences: EmailNotificationPreferences = {
  customer_enabled: false,
  customer_events: buildOffMap(CUSTOMER_EMAIL_NOTIFICATION_EVENTS),
  seller_events: buildOffMap(SELLER_EMAIL_NOTIFICATION_EVENTS),
}

const normalizePreferences = (
  preferences?: EmailNotificationPreferences,
): EmailNotificationPreferences => ({
  customer_enabled: preferences?.customer_enabled === true,
  customer_events: CUSTOMER_EMAIL_NOTIFICATION_EVENTS.reduce(
    (acc, event) => {
      acc[event] = preferences?.customer_events?.[event] === true
      return acc
    },
    { ...defaultPreferences.customer_events },
  ),
  seller_events: SELLER_EMAIL_NOTIFICATION_EVENTS.reduce(
    (acc, event) => {
      acc[event] = preferences?.seller_events?.[event] === true
      return acc
    },
    { ...defaultPreferences.seller_events },
  ),
})

const PreferenceRow = ({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) => (
  <Stack
    direction="row"
    alignItems="center"
    justifyContent="space-between"
    spacing={2}
    sx={{
      px: 2,
      py: 1.25,
      border: '1px solid #EEF1F4',
      borderRadius: 2,
      bgcolor: '#fff',
    }}
  >
    <Typography sx={{ fontSize: '0.9rem', fontWeight: 650, color: '#344054' }}>
      {label}
    </Typography>
    <Switch
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      color="primary"
    />
  </Stack>
)

const SectionCard = ({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) => (
  <Paper
    elevation={0}
    sx={{
      p: 2.5,
      borderRadius: 2,
      border: '1px solid #E5E7EB',
      bgcolor: '#FAFBFC',
    }}
  >
    <Stack spacing={2}>
      <Box>
        <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: '#111827' }}>
          {title}
        </Typography>
        <Typography sx={{ mt: 0.35, fontSize: '0.84rem', color: '#667085' }}>
          {description}
        </Typography>
      </Box>
      <Divider />
      {children}
    </Stack>
  </Paper>
)

const EmailNotificationsPanel = () => {
  const { data, isLoading } = useEmailNotificationPreferences(true)
  const updatePreferences = useUpdateEmailNotificationPreferences()
  const serverPreferences = useMemo(
    () => normalizePreferences(data?.data),
    [data?.data],
  )
  const [preferences, setPreferences] =
    useState<EmailNotificationPreferences>(serverPreferences)

  useEffect(() => {
    setPreferences(serverPreferences)
  }, [serverPreferences])

  const savePreferences = (nextPreferences: EmailNotificationPreferences) => {
    setPreferences(nextPreferences)
    updatePreferences.mutate(nextPreferences, {
      onSuccess: () => {
        toast.open({ message: 'Email notification settings updated', severity: 'success' })
      },
      onError: (error: unknown) => {
        setPreferences(serverPreferences)
        const errorMessage =
          (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Failed to update email notification settings'
        toast.open({ message: errorMessage, severity: 'error' })
      },
    })
  }

  const isSaving = updatePreferences.isPending

  if (isLoading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 260 }}>
        <CircularProgress size={28} />
      </Stack>
    )
  }

  return (
    <Stack spacing={2.5}>
      <Alert severity="info" sx={{ alignItems: 'center' }}>
        All email notification toggles are off by default. Customer tracking emails are sent only
        after the shipment reaches the matching normalized tracking stage.
      </Alert>

      <SectionCard
        title="Customer Email Notifications"
        description="Control shipment tracking emails sent to the buyer email saved on each shipment."
      >
        <Stack spacing={1.4}>
          <PreferenceRow
            label="Send customer tracking emails"
            checked={preferences.customer_enabled}
            disabled={isSaving}
            onChange={(checked) =>
              savePreferences({
                ...preferences,
                customer_enabled: checked,
              })
            }
          />

          <Stack spacing={1}>
            {CUSTOMER_EMAIL_NOTIFICATION_EVENTS.map((event) => (
              <PreferenceRow
                key={event}
                label={customerLabels[event]}
                checked={preferences.customer_events[event]}
                disabled={isSaving}
                onChange={(checked) =>
                  savePreferences({
                    ...preferences,
                    customer_events: {
                      ...preferences.customer_events,
                      [event]: checked,
                    },
                  })
                }
              />
            ))}
          </Stack>
        </Stack>
      </SectionCard>

      <SectionCard
        title="Seller Email Notifications"
        description="Control operational emails sent to the seller account email."
      >
        <Stack spacing={1}>
          {SELLER_EMAIL_NOTIFICATION_EVENTS.map((event) => (
            <PreferenceRow
              key={event}
              label={sellerLabels[event]}
              checked={preferences.seller_events[event]}
              disabled={isSaving}
              onChange={(checked) =>
                savePreferences({
                  ...preferences,
                  seller_events: {
                    ...preferences.seller_events,
                    [event]: checked,
                  },
                })
              }
            />
          ))}
        </Stack>
      </SectionCard>
    </Stack>
  )
}

export default EmailNotificationsPanel
