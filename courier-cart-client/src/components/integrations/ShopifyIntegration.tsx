import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MdContentCopy } from 'react-icons/md'
import { SiShopify } from 'react-icons/si'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/auth/AuthContext'
import { useIntegrateShopifyCustomApp } from '../../hooks/useIntegrations'
import { toast } from '../UI/Toast'
import { buildShopifyInstallPath, isEmbeddedShopifyContext } from '../../utils/shopifyEmbedded'

const SHOPIFY_SCOPES = [
  'read_orders',
  'write_orders',
  'read_products',
  'read_customers',
  'read_fulfillments',
  'write_fulfillments',
  'read_merchant_managed_fulfillment_orders',
  'write_merchant_managed_fulfillment_orders',
  'read_third_party_fulfillment_orders',
  'write_third_party_fulfillment_orders',
]

const SHOPIFY_PCD_FIELDS = 'Customer name, email, phone number, and default/shipping address'
const SHOPIFY_APP_URL = 'https://client.fgship.in/shopify-app.html'
const SHOPIFY_REDIRECT_URLS = [
  'https://api.fgship.in/api/integrations/shopify/oauth/callback',
  'https://api.fgship.in/api/auth/shopify/callback',
]
const SHOPIFY_ORDER_WEBHOOK_URL = 'https://api.fgship.in/api/webhooks/shopify/order-created'

const SHOPIFY_REQUIRED_SCOPES = SHOPIFY_SCOPES.join(', ')
const SHOPIFY_REDIRECT_URLS_TEXT = SHOPIFY_REDIRECT_URLS.join('\n')
const SHOPIFY_DATA_USE_ANSWER =
  'Feathers Global uses Shopify order, customer, phone, and shipping address data to import orders, create shipping labels, book courier pickups, update fulfillment tracking, and support shipment/customer-service queries.'

const setupSections = [
  {
    title: 'Open The Store',
    steps: [
      'Login to Shopify Admin for the exact store you want to connect.',
      'Click Settings from the bottom-left sidebar.',
      'Open Apps and sales channels, then click Develop apps.',
      'Click Build apps in Dev Dashboard. If Shopify asks, allow custom app development.',
    ],
  },
  {
    title: 'Create The App',
    steps: [
      'In Dev Dashboard, open Apps and click Create app.',
      'Set App name to Feathers Global.',
      'Open the app, then go to Settings to confirm the app details.',
      'Use the same Shopify store when Shopify asks where this custom app will be installed.',
    ],
  },
  {
    title: 'Configure API Access',
    steps: [
      'Open Versions, then click Create version.',
      `In App URL, paste ${SHOPIFY_APP_URL}.`,
      'In Redirect URLs, paste both redirect URLs shown in the URLs box below.',
      'In Admin API access scopes, select every scope shown in the scopes box below, then save/release the version.',
    ],
  },
  {
    title: 'Distribution',
    steps: [
      'Open Distribution or App distribution.',
      'Choose Custom distribution.',
      'Enter the same store domain, for example your-store.myshopify.com.',
      'Generate the install link, open it, and approve Install app on the same store.',
    ],
  },
  {
    title: 'Customer Data Access',
    steps: [
      'If you see API access requests, open it and click Protected customer data access.',
      `Select Protected customer data, then select these fields: ${SHOPIFY_PCD_FIELDS}.`,
      'For each selected field, choose Store management as the reason and save.',
      'If Protected customer data is not shown for custom distribution, continue after installing the app; Shopify grants customer data availability for custom apps based on the selected scopes and distribution.',
    ],
  },
  {
    title: 'Copy Credentials',
    steps: [
      'Return to Dev Dashboard and open Apps > Feathers Global.',
      'Open Settings.',
      'In Credentials, copy Client ID and Client secret.',
      'Paste the myshopify.com store domain, Client ID, and Client secret into Feathers Global, then click Connect custom app.',
    ],
  },
]

interface IShopifyIntegrationProps {
  fullWidth?: boolean
  forOnboarding?: boolean
  fromChannelList?: boolean
}

export interface ShopifyForm {
  storeUrl: string
  apiKey?: string
  clientId?: string
  clientSecret?: string
  apiSecretKey?: string
  webhookSecret?: string
  name?: string
  adminApiAccessToken?: string
  hostName?: string
  domain?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any
  userId?: string
  status?: 'active' | 'inactive'
  settings?: {
    fulfillTrigger?: string
    customerNotifyOnFulfill?: string
    orderTagsToFetch?: string
    codTags?: string
    prepaidTags?: string
    autoUpdateShipmentStatus?: boolean
    autoCancelOrders?: boolean
    markCodPaidOnDelivery?: boolean
  }
}

export default function ShopifyIntegration({ fullWidth }: IShopifyIntegrationProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const isConnected = Boolean(user?.salesChannels?.shopify)
  const isEmbeddedShopify = isEmbeddedShopifyContext()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [shopifyDetails, setShopifyDetails] = useState<ShopifyForm>({
    storeUrl: '',
    clientId: '',
    clientSecret: '',
    adminApiAccessToken: '',
    apiSecretKey: '',
    userId: user?.userId ?? '',
    settings: {
      fulfillTrigger: 'order_booked',
      customerNotifyOnFulfill: 'do_not_notify',
      autoUpdateShipmentStatus: true,
      autoCancelOrders: false,
      markCodPaidOnDelivery: false,
    },
  })
  const [inputErrors, setInputErrors] = useState<Partial<ShopifyForm>>({})
  const { mutate: connectCustomApp, isPending: connectingCustomApp } = useIntegrateShopifyCustomApp()

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.open({ message: `${label} copied`, severity: 'success' })
    } catch {
      toast.open({ message: `Could not copy ${label}. Please copy it manually.`, severity: 'error' })
    }
  }

  const handleShopifyAction = () => {
    if (isConnected) {
      navigate('/channels/connected')
      return
    }

    if (isEmbeddedShopify) {
      navigate(buildShopifyInstallPath('/channels/connected'))
      return
    }

    setDialogOpen(true)
  }

  const validateManualConnection = () => {
    const errors: Partial<ShopifyForm> = {}
    const storeUrl = shopifyDetails.storeUrl.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
    if (!storeUrl) {
      errors.storeUrl = 'Shopify store URL is required'
    } else if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeUrl)) {
      errors.storeUrl = 'Use the myshopify.com domain, for example your-store.myshopify.com'
    }

    const clientId = shopifyDetails.clientId?.trim() || ''
    const clientSecret = shopifyDetails.clientSecret?.trim() || shopifyDetails.apiSecretKey?.trim() || ''
    if (!clientId) {
      errors.clientId = 'Client ID is required for Dev Dashboard apps'
    }

    if (!clientSecret) {
      errors.clientSecret = 'Client secret is required'
    }

    setInputErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleConnectCustomApp = () => {
    if (!validateManualConnection()) return

    connectCustomApp(
      {
        ...shopifyDetails,
        storeUrl: shopifyDetails.storeUrl.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, ''),
        apiKey: shopifyDetails.clientId?.trim() || shopifyDetails.apiKey,
        apiSecretKey: shopifyDetails.clientSecret?.trim() || shopifyDetails.apiSecretKey?.trim(),
        webhookSecret: shopifyDetails.clientSecret?.trim() || shopifyDetails.apiSecretKey?.trim(),
        userId: user?.userId,
      },
      {
        onSuccess: (data) => {
          const sync = data?.sync
          const syncText = sync
            ? ` Synced ${sync.created || 0} new and ${sync.updated || 0} updated orders.`
            : ''
          toast.open({
            message: `${data?.message || 'Shopify connected successfully.'}${syncText}${
              data?.warning ? ` ${data.warning}` : ''
            }`,
            severity: data?.warning ? 'warning' : 'success',
          })
          setDialogOpen(false)
          queryClient.invalidateQueries({ queryKey: ['userInfo'] })
          queryClient.invalidateQueries({ queryKey: ['stores'] })
          queryClient.invalidateQueries({ queryKey: ['orders'] })
          queryClient.invalidateQueries({ queryKey: ['b2cOrdersByUser'] })
          navigate('/channels/connected')
        },
        onError: (error: any) => {
          toast.open({
            message:
              error?.response?.data?.error ||
              error?.response?.data?.message ||
              'Error connecting Shopify custom app',
            severity: 'error',
          })
        },
      },
    )
  }

  return (
    <Card
      variant="outlined"
      sx={{
        bgcolor: 'transparent',
        borderColor: 'rgba(255,255,255,0.1)',
        color: 'inherit',
        height: '100%',
        width: fullWidth ? '100%' : 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CardContent sx={{ textAlign: 'center', flexGrow: 1 }}>
        <Box display="flex" justifyContent="center" mb={1}>
          <SiShopify size={28} />
        </Box>
        <Typography fontWeight={600}>Shopify</Typography>
      </CardContent>
      <CardActions sx={{ justifyContent: 'center', pb: 2 }}>
        <Button
          size="small"
          variant="contained"
          color={isConnected ? 'success' : 'inherit'}
          onClick={handleShopifyAction}
          fullWidth={isMobile}
        >
          {isConnected ? 'Manage' : isEmbeddedShopify ? 'Finish Shopify install' : 'Connect Shopify'}
        </Button>
      </CardActions>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Connect Shopify custom app</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <Alert severity="info">
              Build the Shopify custom app inside the merchant's own store, install it there, then
              connect that same store with its Client ID and Client secret.
            </Alert>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                gap: 1.5,
              }}
            >
              {setupSections.map((section, index) => (
                <Box
                  key={section.title}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    p: 1.75,
                    bgcolor: 'background.paper',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Chip label={index + 1} size="small" color="primary" />
                    <Typography fontWeight={700}>{section.title}</Typography>
                  </Stack>
                  <Box
                    component="ol"
                    sx={{
                      m: 0,
                      pl: 2.5,
                      color: 'text.secondary',
                      '& li': { mb: 0.75, fontSize: 14 },
                    }}
                  >
                    {section.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                gap: 1.5,
              }}
            >
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                  <Typography fontWeight={700}>Admin API scopes</Typography>
                  <Tooltip title="Copy scopes">
                    <IconButton
                      size="small"
                      onClick={() => copyToClipboard(SHOPIFY_REQUIRED_SCOPES, 'Admin API scopes')}
                    >
                      <MdContentCopy size={18} />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Typography
                  sx={{
                    mt: 1,
                    fontSize: 13,
                    color: 'text.secondary',
                    overflowWrap: 'anywhere',
                    lineHeight: 1.6,
                  }}
                >
                  {SHOPIFY_REQUIRED_SCOPES}
                </Typography>
              </Box>

              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                  <Typography fontWeight={700}>URLs to paste</Typography>
                  <Tooltip title="Copy URLs">
                    <IconButton
                      size="small"
                      onClick={() =>
                        copyToClipboard(
                          [
                            `App URL: ${SHOPIFY_APP_URL}`,
                            `Redirect URLs:\n${SHOPIFY_REDIRECT_URLS_TEXT}`,
                            `Order webhook: ${SHOPIFY_ORDER_WEBHOOK_URL}`,
                          ].join('\n\n'),
                          'Shopify URLs',
                        )
                      }
                    >
                      <MdContentCopy size={18} />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Stack spacing={0.75} sx={{ mt: 1 }}>
                  <Typography sx={{ fontSize: 13, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                    App URL: {SHOPIFY_APP_URL}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                    Redirect: {SHOPIFY_REDIRECT_URLS[0]}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                    Redirect: {SHOPIFY_REDIRECT_URLS[1]}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                    Order webhook: {SHOPIFY_ORDER_WEBHOOK_URL}
                  </Typography>
                </Stack>
              </Box>
            </Box>

            <Box sx={{ border: '1px solid', borderColor: 'success.light', borderRadius: 2, p: 1.5 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Typography fontWeight={700}>Customer data answer</Typography>
                <Tooltip title="Copy answer">
                  <IconButton
                    size="small"
                    onClick={() => copyToClipboard(SHOPIFY_DATA_USE_ANSWER, 'Customer data answer')}
                  >
                    <MdContentCopy size={18} />
                  </IconButton>
                </Tooltip>
              </Stack>
              <Typography sx={{ mt: 1, fontSize: 13, color: 'text.secondary', lineHeight: 1.6 }}>
                Reason: Store management
              </Typography>
              <Typography sx={{ mt: 0.75, fontSize: 13, color: 'text.secondary', lineHeight: 1.6 }}>
                {SHOPIFY_DATA_USE_ANSWER}
              </Typography>
            </Box>

            <Stack spacing={2}>
              <TextField
                label="Shopify store URL"
                placeholder="your-store.myshopify.com"
                value={shopifyDetails.storeUrl}
                onChange={(e) =>
                  setShopifyDetails((prev) => ({ ...prev, storeUrl: e.target.value }))
                }
                error={Boolean(inputErrors.storeUrl)}
                helperText={inputErrors.storeUrl || 'Use the permanent myshopify.com domain.'}
                fullWidth
              />
              <TextField
                label="Client ID"
                placeholder="Paste Client ID from Shopify Dev Dashboard"
                value={shopifyDetails.clientId}
                onChange={(e) =>
                  setShopifyDetails((prev) => ({ ...prev, clientId: e.target.value }))
                }
                error={Boolean(inputErrors.clientId)}
                helperText={inputErrors.clientId || 'Use this for new 2026 Dev Dashboard custom apps.'}
                fullWidth
              />
              <TextField
                label="Client secret"
                value={shopifyDetails.clientSecret}
                onChange={(e) =>
                  setShopifyDetails((prev) => ({ ...prev, clientSecret: e.target.value }))
                }
                error={Boolean(inputErrors.clientSecret)}
                helperText={inputErrors.clientSecret || 'Required for token exchange and webhook verification.'}
                type="password"
                fullWidth
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConnectCustomApp}
            variant="contained"
            disabled={connectingCustomApp}
          >
            {connectingCustomApp ? 'Connecting...' : 'Connect custom app'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}
