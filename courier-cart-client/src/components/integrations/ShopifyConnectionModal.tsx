import {
  Box,
  Card,
  Grid,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { type Dispatch, type SetStateAction } from 'react'
import { BiLink } from 'react-icons/bi'
import { FaConnectdevelop } from 'react-icons/fa6'
import { FcInfo } from 'react-icons/fc'
import { RiDeleteBin2Fill } from 'react-icons/ri'
import CustomIconLoadingButton from '../UI/button/CustomLoadingButton'
import CustomInput from '../UI/inputs/CustomInput'
import CustomSelect from '../UI/inputs/CustomSelect'
import CustomSwitch from '../UI/inputs/CustomSwitch'
import CustomDialog from '../UI/modal/CustomModal'
import type { ShopifyForm } from './ShopifyIntegration'

interface IShopifyConnectionModalProps {
  forOnboarding?: boolean
  openModal: boolean
  onSetOpen: () => void
  handleConnect?: () => void
  integrating?: boolean
  shopifyDetails: ShopifyForm
  isEditing?: boolean
  setShopifyDetails: Dispatch<SetStateAction<ShopifyForm>>
  inputErrors?: ShopifyForm
  handleDelete?: () => void
  deleting?: boolean
}

const ShopifyConnectionModal = ({
  forOnboarding,
  openModal,
  onSetOpen,
  handleConnect,
  integrating = false,
  shopifyDetails,
  inputErrors,
  setShopifyDetails,
  isEditing = false,
  handleDelete,
  deleting = false,
}: IShopifyConnectionModalProps) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <CustomDialog
      fullScreen={!forOnboarding && isEditing}
      width="100%"
      maxWidth={forOnboarding ? 'lg' : 'xl'}
      open={openModal}
      onClose={() => onSetOpen()}
      title={
        <Stack direction="row" alignItems="center" gap={2}>
          <FaConnectdevelop /> Connect your Shopify store
        </Stack>
      }
      footer={
        <Stack direction={'row'} spacing={1}>
          {isEditing && !forOnboarding ? (
            <CustomIconLoadingButton
              size={isMobile ? 'large' : 'medium'}
              onClick={() => handleDelete?.()}
              disabled={integrating}
              icon={<RiDeleteBin2Fill />}
              text={'Remove'}
              loading={deleting}
              loadingText={'Removing..'}
            />
          ) : null}
          <CustomIconLoadingButton
            size={isMobile ? 'large' : 'medium'}
            onClick={() => handleConnect?.()}
            disabled={integrating}
            text={isEditing && !forOnboarding ? 'Save Settings' : 'Continue to Shopify'}
            loading={integrating}
            loadingText={isEditing && !forOnboarding ? 'Saving...' : 'Opening Shopify...'}
          />
        </Stack>
      }
    >
      <Grid container spacing={4}>
        {/* Instructions Section */}
        <Grid size={{ md: 5, xs: 12 }} sx={{ order: isMobile ? 2 : 1 }}>
          <Box
            sx={{
              p: 2,
              bgcolor: 'background.paper',
              borderRadius: 2,
              boxShadow: 1,
              overflowY: 'auto',
            }}
          >
            <Typography variant="h6" gutterBottom>
              <FcInfo style={{ marginRight: 8 }} />
              How Shopify connection works
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Connect with Shopify OAuth. Shiplifi sends you to Shopify, Shopify asks for permission,
              and then returns you here after the store is connected.
            </Typography>

            <List dense>
              {[
                {
                  primary: '1. Enter your myshopify.com store domain',
                  secondary: 'Use the permanent domain, for example mystore.myshopify.com.',
                },
                {
                  primary: '2. Continue to Shopify',
                  secondary:
                    'Shopify will show the exact permissions requested by Shiplifi before you approve.',
                },
                {
                  primary: '3. Approve protected customer data access if prompted',
                  secondary:
                    'Order names, phone numbers, emails, and addresses are needed for shipping labels.',
                },
                {
                  primary: '4. Return to Shiplifi',
                  secondary:
                    'After approval, orders and webhooks are connected automatically.',
                },
              ].map((step, index) => (
                <ListItem key={index}>
                  <ListItemText primary={step.primary} secondary={step.secondary} />
                </ListItem>
              ))}
            </List>
          </Box>
        </Grid>

        {/* Input Section */}
        <Grid size={{ md: 7, xs: 12 }} sx={{ order: isMobile ? 1 : 2 }}>
          <Card
            variant="outlined"
            sx={{
              p: 3,
              borderRadius: 2,
              backgroundColor: 'rgba(255,255,255,0.02)',
            }}
          >
            <Typography variant="subtitle1" fontWeight={600} mb={2}>
              {isEditing && !forOnboarding ? 'Connected Shopify Store' : 'Connect with Shopify'}
            </Typography>
            <Stack spacing={2}>
              <CustomInput
                required={!isEditing || forOnboarding}
                prefix={<BiLink />}
                label="Shopify Store URL"
                placeholder="shiplifi-test.myshopify.com"
                value={shopifyDetails.storeUrl ?? shopifyDetails?.domain}
                disabled={isEditing && !forOnboarding}
                onChange={(e) =>
                  setShopifyDetails((prev) => ({
                    ...prev,
                    storeUrl: e.target.value,
                  }))
                }
                error={!!inputErrors?.storeUrl}
                helperText={inputErrors?.storeUrl}
              />
              <Typography variant="body2" color="text.secondary">
                {isEditing && !forOnboarding
                  ? 'Authentication is managed by Shopify OAuth. No access token or webhook secret is shown or required.'
                  : 'You will approve permissions on Shopify. Shiplifi never asks you to copy an Admin API token.'}
              </Typography>
            </Stack>
          </Card>
          {isEditing && !forOnboarding ? (
            <Card
              variant="outlined"
              sx={{
                mt: 4,
                p: 3,
                borderRadius: 2,
                backgroundColor: 'rgba(255,255,255,0.02)',
              }}
            >
              <Typography variant="subtitle1" fontWeight={600} mb={2}>
                Shopify Fulfillment & Sync Settings
              </Typography>

              <Stack spacing={2}>
                {/* Fulfillment trigger */}
                <CustomSelect
                  helperText="Select when to auto-fulfill the order in Shopify"
                  label="Fulfill Orders When?"
                  value={shopifyDetails?.settings?.fulfillTrigger}
                  onSelect={(value) =>
                    setShopifyDetails((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        fulfillTrigger: value as string,
                      },
                    }))
                  }
                  width={'70%'}
                  items={[
                    { label: 'Do not Fulfill', key: 'do_not_fulfill' },
                    { label: 'Order is Booked', key: 'order_booked' },
                    {
                      label: 'Order is in Transit',
                      key: 'order_in_transit',
                    },
                    {
                      label: 'Order is out for Delivery',
                      key: 'order_out_for_delivery',
                    },
                    {
                      label: 'Order is Delivered',
                      key: 'order_delivered',
                    },
                  ]}
                />

                <CustomSelect
                  helperText="Choose whether to notify customer when Shopify fulfillment is created"
                  label="Notify Customer on Fulfill?"
                  value={shopifyDetails?.settings?.customerNotifyOnFulfill ?? 'do_not_notify'}
                  onSelect={(value) =>
                    setShopifyDetails((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        customerNotifyOnFulfill: String(value),
                      },
                    }))
                  }
                  width={'70%'}
                  items={[
                    { label: 'Do Not Notify', key: 'do_not_notify' },
                    { label: 'Notify Customer', key: 'notify_customer' },
                  ]}
                />

                {/* Pull by Order Tags */}
                <CustomInput
                  label="Pull Orders via Order Tags"
                  placeholder="Leave blank to fetch all orders"
                  value={shopifyDetails?.settings?.orderTagsToFetch ?? ''}
                  onChange={(e) =>
                    setShopifyDetails((prev) => ({
                      ...prev,
                      settings: {
                        ...prev?.settings,
                        orderTagsToFetch: e.target.value,
                      },
                    }))
                  }
                  helpText="Only orders with these tags will be pulled"
                />

                {/* COD Tags */}
                <CustomInput
                  label="COD Tag(s)"
                  placeholder="COD, COD Confirmed"
                  value={shopifyDetails?.settings?.codTags ?? ''}
                  onChange={(e) =>
                    setShopifyDetails((prev) => ({
                      ...prev,
                      settings: { ...prev?.settings, codTags: e.target.value },
                    }))
                  }
                  helpText="Comma separated tags for identifying COD orders"
                />

                {/* Prepaid Tags */}
                <CustomInput
                  label="Prepaid Tag(s)"
                  placeholder="Prepaid, Urgent Order"
                  value={shopifyDetails?.settings?.prepaidTags ?? ''}
                  onChange={(e) =>
                    setShopifyDetails((prev) => ({
                      ...prev,
                      settings: {
                        ...prev?.settings,
                        prepaidTags: e.target.value,
                      },
                    }))
                  }
                  helpText="Comma separated tags for identifying prepaid orders"
                />

                {/* Auto update shipment status */}
                <CustomSwitch
                  label="Auto Update Shipment Status in Shopify"
                  checked={!!shopifyDetails?.settings?.autoUpdateShipmentStatus}
                  onChange={(e) =>
                    setShopifyDetails((prev) => ({
                      ...prev,
                      settings: {
                        ...prev?.settings,
                        autoUpdateShipmentStatus: e.target.checked,
                      },
                    }))
                  }
                  helperText="Automatically update order statuses in Shopify when they change in Shiplifi."
                />

                {/* Auto cancel orders */}
                <CustomSwitch
                  label="Auto Cancel Shopify Order"
                  checked={!!shopifyDetails?.settings?.autoCancelOrders}
                  onChange={(e) =>
                    setShopifyDetails((prev) => ({
                      ...prev,
                      settings: {
                        ...prev?.settings,
                        autoCancelOrders: e.target.checked,
                      },
                    }))
                  }
                  helperText="Automatically cancel the order in Shopify when it’s marked as cancelled in Shiplifi."
                />

                {/* Mark COD Orders Paid */}
                <CustomSwitch
                  label="Mark COD Orders Paid on Delivery"
                  checked={!!shopifyDetails?.settings?.markCodPaidOnDelivery}
                  onChange={(e) =>
                    setShopifyDetails((prev) => ({
                      ...prev,
                      settings: {
                        ...prev?.settings,
                        markCodPaidOnDelivery: e.target.checked,
                      },
                    }))
                  }
                  helperText="Automatically mark Cash on Delivery orders as 'Paid' in Shopify once they are successfully delivered."
                />
              </Stack>
            </Card>
          ) : null}
        </Grid>
      </Grid>
    </CustomDialog>
  )
}

export default ShopifyConnectionModal
