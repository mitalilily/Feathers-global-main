// src/hooks/useCouriers.ts
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  fetchAllCouriers,
  fetchAvailableCouriers,
  fetchCouriersWithDetails,
  fetchShippingRates,
  getCouriers,
  type CourierListResponse,
} from '../../api/courier'

interface UseCouriersParams {
  page?: number
  limit?: number
  filters?: Record<string, string | boolean | number>
}

export const useCouriers = ({ page, limit, filters = {} }: UseCouriersParams = {}) => {
  return useQuery<CourierListResponse>({
    queryKey: ['couriers', page, limit, filters],
    queryFn: () => getCouriers({ page, limit, filters }),
  })
}

export interface UseAvailableCouriersParams {
  pickupPincode: string
  pickupName?: string
  pickupId?: string
  pickupAddress?: string
  pickupCity?: string
  pickupState?: string
  deliveryName?: string
  deliveryPhone?: string
  deliveryAddress?: string
  deliveryCity?: string
  deliveryState?: string
  deliveryPincode: string
  pickupAddressKey?: string
  deliveryAddressKey?: string
  weight?: number
  cod?: number
  orderAmount?: number
  length?: number
  breadth?: number
  height?: number
  numberOfBoxes?: number
  enabled?: boolean
  shipmentType?: 'b2b' | 'b2c'
  payment_type: 'cod' | 'prepaid'
  context?: string
  isCalculator?: boolean
  shadowfax_forward_mode?: 'marketplace' | 'warehouse'
  shadowfax_service_mode?: 'regular' | 'surface'
}

export const useAvailableCouriers = (params: UseAvailableCouriersParams) => {
  const {
    pickupPincode,
    deliveryPincode,
    pickupId,
    pickupAddressKey,
    deliveryAddressKey,
    weight,
    cod,
    orderAmount,
    length,
    breadth,
    height,
    enabled = true,
    shipmentType,
    payment_type,
  } = params

  const normalizedOrderAmount =
    typeof orderAmount === 'number' && orderAmount > 0 ? orderAmount : undefined
  const isShipmentCourierSelection = params.context === 'shipment_courier_selection'
  const hasPositiveWeight = Number(weight) > 0
  const hasB2CPackageDimensions =
    shipmentType !== 'b2c' ||
    (Number(length) > 0 && Number(breadth) > 0 && Number(height) > 0)
  const hasRequiredB2COrderAmount =
    shipmentType !== 'b2c' || typeof normalizedOrderAmount === 'number'
  const canFetchAvailableCouriers =
    enabled &&
    !!pickupPincode &&
    !!deliveryPincode &&
    hasPositiveWeight &&
    hasB2CPackageDimensions &&
    hasRequiredB2COrderAmount

  return useQuery({
    queryKey: [
      'availableCouriers',
      pickupPincode,
      deliveryPincode,
      pickupId,
      pickupAddressKey,
      deliveryAddressKey,
      weight,
      cod,
      payment_type,
      orderAmount,
      length,
      breadth,
      height,
      params?.numberOfBoxes,
      shipmentType,
      params?.pickupName,
      params?.pickupAddress,
      params?.pickupCity,
      params?.pickupState,
      params?.deliveryName,
      params?.deliveryPhone,
      params?.deliveryAddress,
      params?.deliveryCity,
      params?.deliveryState,
      params?.context,
      params?.isCalculator,
      params?.shadowfax_forward_mode,
      params?.shadowfax_service_mode,
    ],
    queryFn: () =>
      fetchAvailableCouriers({
        origin: pickupPincode,
        destination: deliveryPincode,
        pickupId,
        pickupName: params.pickupName,
        pickupAddress: params.pickupAddress,
        pickupCity: params.pickupCity,
        pickupState: params.pickupState,
        deliveryName: params.deliveryName,
        deliveryPhone: params.deliveryPhone,
        deliveryAddress: params.deliveryAddress,
        deliveryCity: params.deliveryCity,
        deliveryState: params.deliveryState,
        payment_type: payment_type,
        order_amount: normalizedOrderAmount,
        cod,
        weight,
        length,
        number_of_boxes: params.numberOfBoxes,
        ...(shipmentType && { shipment_type: shipmentType }),
        context: params.context,
        isCalculator: params.isCalculator === true || params.context === 'rate_calculator',
        shadowfax_forward_mode: params.shadowfax_forward_mode,
        shadowfax_service_mode: params.shadowfax_service_mode,
        breadth,
        height,
      }),
    enabled: canFetchAvailableCouriers,
    staleTime: isShipmentCourierSelection ? 1000 * 30 : 1000 * 60 * 5,
    refetchOnMount: isShipmentCourierSelection ? 'always' : true,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
    retry: isShipmentCourierSelection ? 0 : 1,
  })
}

export const useAvailableCouriersMutation = () => {
  return useMutation({
    mutationFn: (params: UseAvailableCouriersParams) => {
      const normalizedOrderAmount =
        typeof params.orderAmount === 'number' && params.orderAmount > 0
          ? params.orderAmount
          : undefined

      return fetchAvailableCouriers({
        origin: params.pickupPincode,
        destination: params.deliveryPincode,
        pickupId: params.pickupId,
        pickupName: params.pickupName,
        pickupAddress: params.pickupAddress,
        pickupCity: params.pickupCity,
        pickupState: params.pickupState,
        deliveryName: params.deliveryName,
        deliveryPhone: params.deliveryPhone,
        deliveryAddress: params.deliveryAddress,
        deliveryCity: params.deliveryCity,
        deliveryState: params.deliveryState,
        payment_type: params.payment_type,
        order_amount: normalizedOrderAmount,
        cod: params.cod,
        weight: params.weight,
        length: params.length,
        breadth: params.breadth,
        height: params.height,
        number_of_boxes: params.numberOfBoxes,
        shipment_type: params?.shipmentType,
        context: params.context,
        isCalculator: params.isCalculator === true || params.context === 'rate_calculator',
        shadowfax_forward_mode: params.shadowfax_forward_mode,
        shadowfax_service_mode: params.shadowfax_service_mode,
      })
    },
    retry: 1,
  })
}

export const useShippingRates = (filters = {}) => {
  return useQuery({
    queryKey: ['getShippingRates', filters],
    queryFn: () => fetchShippingRates(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export const useAllCouriers = () => {
  return useQuery<any[]>({
    queryKey: ['allCouriers'],
    queryFn: () => fetchAllCouriers(),
  })
}

export const useAllCouriersWithDetails = () => {
  return useQuery<any[]>({
    queryKey: ['allCouriers'],
    queryFn: () => fetchCouriersWithDetails(),
  })
}
