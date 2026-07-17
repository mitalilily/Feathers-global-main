import { Box, Button, Grid, Paper, Stack, TextField, Typography, alpha } from '@mui/material'
import { useEffect } from 'react'
import { Controller, FormProvider, useFieldArray, useForm } from 'react-hook-form'
import { BiRupee } from 'react-icons/bi'
import { FaBox, FaTruck, FaUser } from 'react-icons/fa'
import { useLocation, useNavigate } from 'react-router-dom'
import { fetchLocations } from '../../../api/locations'
import type { CreateShipmentParams } from '../../../api/order.service'
import { useCreateB2COrderDraft } from '../../../hooks/Orders/useOrders'
import { usePaymentOptions } from '../../../hooks/usePaymentOptions'
import DeliveryDetailsForm from '../DeliveryDetailsForm'
import OrderDetailsForm from '../OrderDetailsForm'
import PickupLocationForm from '../PickupLocationForm'
import PackageDetailsForm from './PackageDetailsForm'
import PackageDimensionsForm from './PackageDimensionsForm'

const ACCENT = '#047b85'
const TEXT_PRIMARY = '#17171A'
const TEXT_MUTED = '#496189'

export type Product = {
  productName: string
  price: number
  quantity: number
  discount?: number
  taxRate?: number
  hsnCode?: string
  sku?: string
}

export type B2CFormData = {
  buyerName: string
  buyerPhone: string
  buyerEmail: string
  address: string
  pincode: string
  city: string
  state: string
  country: string
  products: Product[]
  weight: number
  length: number
  breadth: number
  height: number
  orderId: string
  orderDate: string
  orderType: 'prepaid' | 'cod'
  courierPartner: string
  shippingCharges?: number
  transactionFee?: number
  isRtoSame?: boolean
  giftWrap?: number
  discount?: number
  prepaidAmount?: number
  courierCod?: number
  otherCharges?: number
  forwardCharges?: number
  courierCost?: number | null // Estimated courier cost from serviceability (what platform pays courier)

  rtoLocationPincode?: string
  rtoLocationName?: string
  pickupCity?: string
  pickupState?: string
  rtoCity?: string
  rtoState?: string
  rtoLocationPOCName?: string
  rtoLocationPOCPhone?: string
  rtoAddress?: string
  pickupLocationPOCPhone?: string
  pickupLocationId?: string
  pickupLocationPincode?: string
  pickupLocationName?: string
  integrationType?: 'delhivery' | 'ekart' | 'shadowfax' | 'xpressbees' | 'amazon' | 'icarry'
  pickupAddress?: string
  pickupLocationPOCName?: string
  courierPartnerId: string
  courierOptionKey?: string
  amazonRequestToken?: string | null
  amazonRateId?: string | null
  amazonServiceId?: string | null
  amazonCarrierId?: string | null
  shadowfaxForwardMode?: 'marketplace' | 'warehouse'
  shadowfaxServiceMode?: 'regular' | 'surface'
  selectedMaxSlabWeight?: number | null
  orderAmount: number
  pickupDate: string
  pickupTime: string
  chargeableWeight?: number | null
  volumetricWeight?: number | null
  slabs?: number | null
  zone?: string
  zoneId?: string
}

export default function B2COrderFormSteps({ onClose }: { onClose?: () => void }) {
  const createDraftMutation = useCreateB2COrderDraft(onClose)
  const createShipmentMutation = createDraftMutation
  const navigate = useNavigate()
  const location = useLocation()
  const currentStep = 0
  const steps = ['Order Draft']
  const { data: paymentOptions } = usePaymentOptions()

  const defaultPickupDate = new Date().toISOString().split('T')[0]

  // Determine default order type based on enabled payment options
  const getDefaultOrderType = (): 'prepaid' | 'cod' => {
    if (!paymentOptions) return 'prepaid' // Default fallback
    if (paymentOptions.codEnabled) return 'cod'
    if (paymentOptions.prepaidEnabled) return 'prepaid'
    return 'prepaid' // Final fallback
  }

  const methods = useForm<B2CFormData>({
    defaultValues: {
      products: [{ productName: '', price: 0, quantity: 1 }],
      weight: 0,
      length: 0,
      breadth: 0,
      height: 0,
      courierPartnerId: '',
      amazonRequestToken: null,
      amazonRateId: null,
      amazonServiceId: null,
      amazonCarrierId: null,
      pickupDate: defaultPickupDate,
      pickupTime: '',
      orderType: getDefaultOrderType(),
      selectedMaxSlabWeight: null,
    },
  })

  const {
    control,
    watch,
    setValue,
    handleSubmit,
    trigger,
    register,
  } = methods
  const { fields, append, remove } = useFieldArray({ control, name: 'products' })

  const shippingCharges = Number(watch('shippingCharges') || 0)
  const transactionFee = Number(watch('transactionFee') || 0)
  const giftWrap = Number(watch('giftWrap') || 0)
  const discount = Number(watch('discount') || 0)
  const prepaidAmount = Number(watch('prepaidAmount') || 0)
  const orderType = watch('orderType') || getDefaultOrderType()

  // Ensure orderType is valid based on payment options
  useEffect(() => {
    if (paymentOptions && orderType) {
      const isCurrentTypeEnabled =
        (orderType === 'cod' && paymentOptions.codEnabled) ||
        (orderType === 'prepaid' && paymentOptions.prepaidEnabled)

      if (!isCurrentTypeEnabled) {
        const newOrderType = paymentOptions.codEnabled
          ? 'cod'
          : paymentOptions.prepaidEnabled
            ? 'prepaid'
            : 'prepaid'
        setValue('orderType', newOrderType)
      }
    }
  }, [paymentOptions, orderType, setValue])

  const subtotal = fields.reduce(
    (sum, _, idx) =>
      sum +
      (watch(`products.${idx}.price`) || 0) * (watch(`products.${idx}.quantity`) || 0) -
      (watch(`products.${idx}.discount`) || 0),
    0,
  )

  // Calculate total order value (customer-facing)
  // Includes: subtotal + shipping + transaction_fee + gift_wrap - discount
  const totalOrderValue = subtotal + shippingCharges + transactionFee + giftWrap - discount
  const totalCollectable = totalOrderValue - prepaidAmount

  const onSubmit = async (data: B2CFormData) => {
    try {
      const normalizedOrderId = data.orderId.trim()

      if (!normalizedOrderId) {
        methods.setError('orderId', {
          type: 'manual',
          message: 'Order ID is required',
        })
        return
      }

      const payload: CreateShipmentParams = {
        order_number: normalizedOrderId,
        payment_type: data.orderType,
        order_amount: subtotal,
        order_date: data?.orderDate,
        package_weight: data.weight,
        package_length: data.length,
        cod_charges: data?.courierCod,
        package_breadth: data.breadth,
        package_height: data.height,
        shipping_charges: Number(data?.shippingCharges ?? 0), // What seller charges customer
        freight_charges: Number(data?.forwardCharges ?? 0), // What platform charges seller (based on rate card)
        courier_cost: data?.courierCost ? Number(data.courierCost) : undefined, // Estimated courier cost from serviceability (what platform pays courier)
        prepaid_amount: data?.prepaidAmount,
        is_rto_different: data?.isRtoSame ? 'no' : 'yes',
        discount: data.discount ?? 0,
        transaction_fee: data?.transactionFee,
        gift_wrap: data?.giftWrap,
        consignee: {
          name: data.buyerName,
          address: data.address,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          email: data?.buyerEmail,
          phone: data.buyerPhone,
        },
        pickup_location_id: data.pickupLocationId,
        pickup: {
          warehouse_name: data?.pickupLocationName ?? '',
          address: data?.pickupAddress ?? '',
          name: data?.pickupLocationPOCName ?? '',
          phone: data?.pickupLocationPOCPhone ?? '',
          city: data?.pickupCity ?? '',
          state: data?.pickupState ?? '',
          pincode: data.pickupLocationPincode ?? data.pincode,
          pickup_date: data.pickupDate,
          pickup_time: data.pickupTime,
        },

        ...(!data?.isRtoSame && {
          rto: {
            warehouse_name: data?.rtoLocationName ?? '',
            address: data?.rtoAddress ?? '',
            name: data?.rtoLocationPOCName ?? '',
            phone: data?.rtoLocationPOCPhone ?? '',
            city: data?.rtoCity ?? '',
            state: data?.rtoState ?? '',
            pincode: data?.rtoLocationPincode ?? '',
          },
        }),
        order_items: data.products.map((p) => ({
          name: p.productName,
          sku: p.sku ?? 'NA',
          qty: p.quantity,
          price: p.price,
          hsn: p.hsnCode ?? '',
          discount: p.discount ?? 0,
          tax_rate: p.taxRate ?? 0,
        })),
        pickup_date: data.pickupDate,
        pickup_time: data.pickupTime,
        delivery_location: data.zone,
        zone_id: data.zoneId,
        chargedWeight: data.chargeableWeight ?? undefined,
        volumetricWeight: data.volumetricWeight ?? undefined,
      }
      createDraftMutation.mutate(payload, {
        onSuccess: () => {
          if (location.pathname === '/orders/create') {
            navigate('/orders/list?status=draft')
          }
        },
      })
    } catch (error) {
      console.error('Error submitting B2C order:', error)
    }
  }

  const validateStep = async () => {
    if (currentStep === 0) {
      const productFields = fields.flatMap((_, idx) =>
        ['productName', 'price', 'quantity'].map(
          (key) => `products.${idx}.${key}` as keyof B2CFormData,
        ),
      )

      const step1Fields: (keyof B2CFormData)[] = [
        'buyerName',
        'buyerPhone',
        'address',
        'pincode',
        'orderType',
        'city',
        'state',
        'country',
        ...productFields,
        'weight',
        'length',
        'breadth',
        'height',
        'pickupLocationId',
        'pickupLocationPincode',
      ]

      const baseValid = await trigger(step1Fields)
      if (!baseValid) return false

      const pincode = watch('pincode')

      try {
        const resp = await fetchLocations({ pincode })
        const serviceable = Array.isArray(resp?.data) ? resp.data.length > 0 : !!resp?.data

        if (!serviceable) {
          methods.setError('pincode', {
            type: 'manual',
            message: 'Destination pincode not serviceable by any courier',
          })
          return false
        }
      } catch (error) {
        console.log('error', error)
      }

      return true
    }

    return true
  }

  const nextStep = async () => {
    const valid = await validateStep()
    if (valid) void handleSubmit(onSubmit)()
  }
  const prevStep = () => undefined

  useEffect(() => {
    setValue('orderAmount', totalCollectable, { shouldValidate: true })
  }, [totalCollectable])

  useEffect(() => {
    register('amazonRequestToken')
    register('amazonRateId')
    register('amazonServiceId')
    register('amazonCarrierId')
  }, [register])

  const compactChargeFieldSx = {
    '& .MuiInputBase-root': {
      minHeight: 34,
      fontSize: '0.82rem',
    },
    '& .MuiInputBase-input': {
      py: 0.55,
    },
    '& .MuiInputLabel-root': {
      fontSize: '0.78rem',
    },
  }

  return (
    <FormProvider {...methods}>
      <Stack
        gap={0.75}
        sx={{
          height: '100%',
          position: 'relative',
          p: { xs: 0.45, sm: 0.55, md: 0.65 },
          borderRadius: 2,
          border: `1px solid ${alpha(ACCENT, 0.14)}`,
          background: '#ffffff',
          boxShadow: `0 12px 30px ${alpha(ACCENT, 0.08)}`,
        }}
      >
        <Stack direction="row" sx={{ flex: 1, minHeight: 0, gap: 0 }}>
          {/* Main Form Content */}
          <Box
            component="form"
            onSubmit={(e) => e.preventDefault()}
            sx={{
              flex: 1,
              overflowY: 'auto',
              p: { xs: 0.1, sm: 0.2, md: 0.3 },
              pr: { xs: 0.4, sm: 0.65, md: 0.8 },
              minHeight: 0,
              '&::-webkit-scrollbar': {
                width: '8px',
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: alpha(ACCENT, 0.35),
                borderRadius: '999px',
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: alpha(ACCENT, 0.08),
                borderRadius: '999px',
              },
            }}
          >
            {/* Step content */}
            {currentStep === 0 && (
              <Stack gap={0.75} mb={0.75}>
                {/* Order Information */}
                <Box>
                  <Stack direction="row" alignItems="center" gap={0.6} sx={{ mb: 0.4 }}>
                    <FaBox size={14} color={ACCENT} />
                    <Typography
                      variant="h6"
                      fontWeight={800}
                      sx={{ color: TEXT_PRIMARY, fontSize: '0.86rem' }}
                    >
                      Order Information
                    </Typography>
                  </Stack>
                  <Box
                    sx={{
                      px: { xs: 0.75, md: 0.9 },
                      py: 0.65,
                      borderRadius: 2,
                      border: `1px solid ${alpha(ACCENT, 0.1)}`,
                      background: '#f9f9f9',
                    }}
                  >
                    <OrderDetailsForm />
                  </Box>
                </Box>

                {/* Main Content - 2 Column Grid Layout */}
                <Grid container spacing={0.75}>
                  {/* Left Column (8 cols) - Form Fields */}
                  <Grid size={{ xs: 12, xl: 8 }}>
                    <Stack gap={0.75}>
                      {/* Recipient Details */}
                      <Box>
                        <Stack direction="row" alignItems="center" gap={0.6} sx={{ mb: 0.4 }}>
                          <FaUser size={14} color={ACCENT} />
                          <Typography
                            variant="subtitle1"
                            fontWeight={700}
                            sx={{ color: TEXT_PRIMARY, fontSize: '0.84rem' }}
                          >
                            Recipient Details
                          </Typography>
                        </Stack>
                        <Box
                          sx={{
                            px: { xs: 0.75, md: 0.9 },
                            py: 0.65,
                            borderRadius: 2,
                            border: `1px solid ${alpha(ACCENT, 0.1)}`,
                            background: '#f9f9f9',
                          }}
                        >
                          <DeliveryDetailsForm />
                        </Box>
                      </Box>

                      {/* Shipment Details */}
                      <Box>
                        <Stack direction="row" alignItems="center" gap={0.6} sx={{ mb: 0.4 }}>
                          <FaBox size={14} color={ACCENT} />
                          <Typography
                            variant="subtitle1"
                            fontWeight={700}
                            sx={{ color: TEXT_PRIMARY, fontSize: '0.84rem' }}
                          >
                            Shipment Details
                          </Typography>
                        </Stack>
                        <Box
                          sx={{
                            px: { xs: 0.75, md: 0.9 },
                            py: 0.65,
                            borderRadius: 2,
                            border: `1px solid ${alpha(ACCENT, 0.1)}`,
                            background: '#f9f9f9',
                          }}
                        >
                          <Stack spacing={0.7}>
                            <Box>
                              <Typography
                                variant="body2"
                                fontWeight={700}
                                sx={{
                                  color: TEXT_MUTED,
                                  mb: 0.45,
                                  display: 'block',
                                  fontSize: '0.74rem',
                                }}
                              >
                                Products
                              </Typography>
                              <PackageDetailsForm
                                append={append}
                                control={control}
                                fields={fields}
                                remove={remove}
                              />
                            </Box>
                            <Box>
                              <Typography
                                variant="body2"
                                fontWeight={700}
                                sx={{
                                  color: TEXT_MUTED,
                                  mb: 0.45,
                                  display: 'block',
                                  fontSize: '0.74rem',
                                }}
                              >
                                Package Details
                              </Typography>
                              <PackageDimensionsForm />
                            </Box>
                          </Stack>
                        </Box>
                      </Box>
                    </Stack>
                  </Grid>

                  {/* Right Column (4 cols) - Order Summary */}
                  <Grid size={{ xs: 12, xl: 4 }}>
                    <Stack gap={0.75} sx={{ position: { xl: 'sticky' }, top: 4 }}>
                      <Box>
                        <Stack direction="row" alignItems="center" gap={0.6} sx={{ mb: 0.4 }}>
                          <BiRupee size={14} color={ACCENT} />
                          <Typography
                            variant="subtitle1"
                            fontWeight={700}
                            sx={{ color: TEXT_PRIMARY, fontSize: '0.84rem' }}
                          >
                            Order Summary
                          </Typography>
                        </Stack>

                        {/* Charges Section */}
                        <Paper
                          sx={{
                            p: 1,
                            borderRadius: 2,
                            border: `1px solid ${alpha(ACCENT, 0.1)}`,
                            background: '#ffffff',
                            mb: 0.75,
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              color: TEXT_MUTED,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              fontSize: '0.68rem',
                              display: 'block',
                              mb: 0.7,
                            }}
                          >
                            Additional Charges
                          </Typography>
                          <Grid container spacing={0.65}>
                            <Grid size={{ xs: 12, sm: 6 }}>
                              <Controller
                                name="shippingCharges"
                                control={control}
                                render={({ field }) => (
                                  <TextField
                                    {...field}
                                    fullWidth
                                    type="number"
                                    label="Shipping Charge"
                                    size="small"
                                    variant="outlined"
                                    InputProps={{
                                      startAdornment: (
                                        <BiRupee
                                          size={14}
                                          color={ACCENT}
                                          style={{ marginRight: 8 }}
                                        />
                                      ),
                                    }}
                                    sx={compactChargeFieldSx}
                                  />
                                )}
                              />
                            </Grid>

                            <Grid size={{ xs: 12, sm: 6 }}>
                              <Controller
                                name="transactionFee"
                                control={control}
                                render={({ field }) => (
                                  <TextField
                                    {...field}
                                    fullWidth
                                    type="number"
                                    label="Transaction Fee"
                                    size="small"
                                    variant="outlined"
                                    InputProps={{
                                      startAdornment: (
                                        <BiRupee
                                          size={14}
                                          color={ACCENT}
                                          style={{ marginRight: 8 }}
                                        />
                                      ),
                                    }}
                                    sx={compactChargeFieldSx}
                                  />
                                )}
                              />
                            </Grid>

                            <Grid size={{ xs: 12, sm: 6 }}>
                              <Controller
                                name="discount"
                              control={control}
                              render={({ field }) => (
                                <TextField
                                  {...field}
                                  fullWidth
                                  type="number"
                                  label="Discount"
                                  size="small"
                                  variant="outlined"
                                  InputProps={{
                                    startAdornment: (
                                      <Typography sx={{ color: ACCENT, fontSize: '0.9rem', mr: 1 }}>
                                        -₹
                                      </Typography>
                                    ),
                                  }}
                                  sx={compactChargeFieldSx}
                                />
                              )}
                              />
                            </Grid>

                            <Grid size={{ xs: 12, sm: 6 }}>
                              <Controller
                                name="prepaidAmount"
                              control={control}
                              render={({ field }) => (
                                <TextField
                                  {...field}
                                  fullWidth
                                  type="number"
                                  label="Prepaid Amount"
                                  size="small"
                                  variant="outlined"
                                  InputProps={{
                                    startAdornment: (
                                      <Typography sx={{ color: ACCENT, fontSize: '0.9rem', mr: 1 }}>
                                        -₹
                                      </Typography>
                                    ),
                                  }}
                                  sx={compactChargeFieldSx}
                                />
                              )}
                              />
                            </Grid>
                          </Grid>
                        </Paper>

                        {/* Summary Section */}
                        <Paper
                          sx={{
                            p: 1,
                            borderRadius: 2,
                            border: `2px solid ${ACCENT}`,
                            background: alpha(ACCENT, 0.04),
                            overflow: 'hidden',
                          }}
                        >
                          <Stack gap={0.65}>
                            <Box sx={{ pb: 0.65, borderBottom: `1px solid ${alpha(ACCENT, 0.2)}` }}>
                              <Stack
                                direction="row"
                                justifyContent="space-between"
                                alignItems="center"
                              >
                                <Typography
                                  variant="body2"
                                  sx={{ color: TEXT_MUTED, fontSize: '0.76rem' }}
                                >
                                  Subtotal
                                </Typography>
                                <Typography
                                  variant="body2"
                                  sx={{ color: TEXT_PRIMARY, fontWeight: 600, fontSize: '0.8rem' }}
                                >
                                  ₹{' '}
                                  {subtotal.toLocaleString('en-IN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </Typography>
                              </Stack>
                            </Box>

                            <Box>
                              <Stack
                                direction="row"
                                justifyContent="space-between"
                                alignItems="center"
                              >
                                <Typography
                                  variant="body2"
                                  sx={{ color: TEXT_MUTED, fontSize: '0.76rem' }}
                                >
                                  Total Order Value
                                </Typography>
                                <Typography
                                  variant="body2"
                                  sx={{ color: TEXT_PRIMARY, fontWeight: 600, fontSize: '0.8rem' }}
                                >
                                  ₹{' '}
                                  {totalOrderValue.toLocaleString('en-IN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </Typography>
                              </Stack>
                            </Box>

                            <Box
                              sx={{
                                pt: 0.75,
                                mt: 0.25,
                                borderTop: `2px solid ${ACCENT}`,
                                background: alpha(ACCENT, 0.08),
                                px: 1.5,
                                py: 0.75,
                                borderRadius: 1.5,
                                my: -0.5,
                                mx: -0.5,
                              }}
                            >
                              <Stack
                                direction="row"
                                justifyContent="space-between"
                                alignItems="center"
                              >
                                <Typography
                                  variant="body2"
                                  sx={{ color: ACCENT, fontWeight: 800, fontSize: '0.8rem' }}
                                >
                                  Amount Collectable
                                </Typography>
                                <Typography
                                  sx={{ color: ACCENT, fontWeight: 800, fontSize: '0.9rem' }}
                                >
                                  ₹{' '}
                                  {totalCollectable.toLocaleString('en-IN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </Typography>
                              </Stack>
                            </Box>
                          </Stack>
                        </Paper>

                        <Box sx={{ mt: 0.7 }}>
                          <Stack direction="row" alignItems="center" gap={0.6} sx={{ mb: 0.4 }}>
                            <FaTruck size={14} color={ACCENT} />
                            <Typography
                              variant="subtitle1"
                              fontWeight={700}
                              sx={{ color: TEXT_PRIMARY, fontSize: '0.84rem' }}
                            >
                              Pickup Information
                            </Typography>
                          </Stack>
                          <Box
                            sx={{
                              px: { xs: 0.75, md: 0.9 },
                              py: 0.65,
                              borderRadius: 2,
                              border: `1px solid ${alpha(ACCENT, 0.1)}`,
                              background: '#f9f9f9',
                            }}
                          >
                            <PickupLocationForm compact />
                          </Box>
                        </Box>
                      </Box>
                    </Stack>
                  </Grid>
                </Grid>
              </Stack>
            )}

            {/* Sticky footer inside scroll */}
            <Box
              sx={{
                py: 0.45,
                px: { xs: 0.75, sm: 1 },
                background: '#ffffff',
                border: `1px solid ${alpha(ACCENT, 0.16)}`,
                borderRadius: '14px',
                position: 'sticky',
                bottom: 0,
                zIndex: 10,
                mt: 0.65,
                boxShadow: `0 10px 20px ${alpha(ACCENT, 0.08)}`,
              }}
            >
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'stretch', sm: 'center' }}
                gap={1}
              >
                <Typography variant="body2" sx={{ color: TEXT_MUTED, fontWeight: 600 }}>
                  {steps[currentStep]}
                </Typography>
                {false && (
                  <Button
                    type="button" // ✅ no accidental submit
                    loading={createShipmentMutation?.isPending}
                    variant="outlined"
                    onClick={prevStep}
                    fullWidth={false}
                    size="small"
                    sx={{
                      minWidth: { xs: '100%', sm: 120 },
                      borderColor: alpha(ACCENT, 0.35),
                      color: ACCENT,
                      '&:hover': { borderColor: ACCENT, backgroundColor: alpha(ACCENT, 0.07) },
                    }}
                  >
                    Back
                  </Button>
                )}
                {currentStep < 1 ? (
                  <Button
                    type="button" // ✅ no accidental submit
                    variant="contained"
                    onClick={nextStep}
                    size="small"
                    sx={{
                      minWidth: { xs: '100%', sm: 130 },
                      fontWeight: 700,
                      background: ACCENT,
                    }}
                  >
                    Save Draft
                  </Button>
                ) : (
                  <Button
                    type="button" // ✅ prevent browser reload
                    variant="contained"
                    color="primary"
                    onClick={handleSubmit(onSubmit)} // ✅ react-hook-form submit
                    loading={createShipmentMutation?.isPending}
                    size="small"
                    sx={{
                      minWidth: { xs: '100%', sm: 210 },
                      fontWeight: 800,
                      background: ACCENT,
                    }}
                  >
                    Save Draft
                  </Button>
                )}
              </Stack>
            </Box>
          </Box>
        </Stack>
      </Stack>
    </FormProvider>
  )
}
