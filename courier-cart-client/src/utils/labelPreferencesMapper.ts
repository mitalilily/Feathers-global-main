// utils/labelPreferencesMapper.ts

import type { LabelPreferences } from '../api/labelPreference.api'
import type { LabelSettingsForm } from '../components/settings/Label/LabelSettings'

const defaultOrderInfo: Record<string, boolean> = {
  orderId: true,
  invoiceNumber: true,
  orderDate: false,
  invoiceDate: false,
  orderBarcode: true,
  invoiceBarcode: true,
  customerPhone: true,
  rtoRoutingCode: true,
  declaredValue: true,
  cod: true,
  awb: true,
  terms: true,
}

const defaultShipperInfo: Record<string, boolean> = {
  shipperPhone: true,
  gstin: true,
  shipperAddress: true,
  rtoAddress: false,
  sellerBrandName: true,
  brandLogo: true,
}

const defaultProductInfo: Record<string, boolean> = {
  itemName: true,
  productCost: true,
  productQuantity: true,
  skuCode: false,
  dimension: false,
  deadWeight: false,
  otherCharges: true,
}

export function mapApiToForm(prefs: LabelPreferences): LabelSettingsForm {
  return {
    orderInfo: { ...defaultOrderInfo, ...(prefs.order_info || {}) },
    shipperInfo: { ...defaultShipperInfo, ...(prefs.shipper_info || {}) },
    productInfo: { ...defaultProductInfo, ...(prefs.product_info || {}) },
    charLimit: prefs.char_limit,
    maxItems: prefs.max_items,
    printer: prefs.printer_type,
  }
}

export function mapFormToApi(form: LabelSettingsForm): Partial<LabelPreferences> {
  return {
    order_info: form.orderInfo,
    shipper_info: form.shipperInfo,
    product_info: form.productInfo,
    char_limit: form.charLimit,
    max_items: form.maxItems,
    printer_type: form.printer,
  }
}
