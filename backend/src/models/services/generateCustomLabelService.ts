// services/generateCustomLabelService.ts
import axios from 'axios'
import bwipjs from 'bwip-js'
import { eq } from 'drizzle-orm'
import fileType from 'file-type'
import PdfPrinter from 'pdfmake'
import { db } from '../client'
import { labelPreferences } from '../schema/labelPreferences'
import { userProfiles } from '../schema/userProfile'
import { presignDownload, uploadBufferToStorage } from './upload.service'

const LABEL_ASSET_TIMEOUT_MS = 10000

function isValidDataUrl(str: string | null): boolean {
  return typeof str === 'string' && str.startsWith('data:image/')
}

// Helper function to convert buffer to data URL with proper MIME type detection
async function bufferToDataUrl(buffer: Buffer): Promise<string | null> {
  try {
    if (!buffer || buffer.length === 0) {
      console.warn('⚠️ Empty buffer provided to bufferToDataUrl')
      return null
    }
    const type = await fileType.fromBuffer(buffer)
    if (!type) {
      console.warn('⚠️ Could not detect image type, defaulting to PNG')
      return `data:image/png;base64,${buffer.toString('base64')}`
    }
    // Only allow image types
    if (!type.mime.startsWith('image/')) {
      console.warn(`⚠️ Invalid image type: ${type.mime}, defaulting to PNG`)
      return `data:image/png;base64,${buffer.toString('base64')}`
    }
    const dataUrl = `data:${type.mime};base64,${buffer.toString('base64')}`
    // Validate the data URL format
    if (!dataUrl.startsWith('data:image/')) {
      console.warn('⚠️ Invalid data URL format generated')
      return null
    }
    return dataUrl
  } catch (err) {
    console.warn('⚠️ Error detecting image type, defaulting to PNG:', err)
    try {
      return `data:image/png;base64,${buffer.toString('base64')}`
    } catch (bufferErr) {
      console.error('⚠️ Failed to convert buffer to base64:', bufferErr)
      return null
    }
  }
}

async function generateBarcodeBase64(text: string): Promise<string | null> {
  if (!text) return null
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text,
      scale: 4,
      height: 22,
      includetext: false,
      paddingwidth: 0,
      paddingheight: 0,
    })
    return `data:image/png;base64,${png.toString('base64')}`
  } catch (err) {
    console.warn('⚠️ Barcode generation failed:', err)
    return null
  }
}

const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
}

const DEFAULT_LABEL_SETTINGS = {
  printer_type: 'thermal',
  char_limit: 25,
  max_items: 3,
  order_info: {
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
  },
  shipper_info: {
    shipperPhone: true,
    gstin: true,
    shipperAddress: true,
    rtoAddress: false,
    sellerBrandName: true,
    brandLogo: true,
  },
  product_info: {
    itemName: true,
    productCost: true,
    productQuantity: true,
    skuCode: true,
    dimension: false,
    deadWeight: false,
    otherCharges: true,
  },
  powered_by: 'Shiplifi',
}

function safeParseObject(value: unknown, fallback: Record<string, any> = {}) {
  if (!value) return fallback
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback
    } catch (err) {
      console.warn('⚠️ Failed to parse label object JSON, using fallback:', err)
      return fallback
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : fallback
}

function safeParseArray(value: unknown, fallback: any[] = []) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : fallback
    } catch (err) {
      console.warn('⚠️ Failed to parse label array JSON, using fallback:', err)
      return fallback
    }
  }
  return fallback
}

function mergeSettings(prefs: any) {
  if (!prefs) return DEFAULT_LABEL_SETTINGS
  return {
    printer_type: prefs.printer_type ?? DEFAULT_LABEL_SETTINGS.printer_type,
    char_limit: prefs.char_limit ?? DEFAULT_LABEL_SETTINGS.char_limit,
    max_items: prefs.max_items ?? DEFAULT_LABEL_SETTINGS.max_items,
    order_info: { ...(DEFAULT_LABEL_SETTINGS.order_info as any), ...(prefs.order_info || {}) },
    shipper_info: {
      ...(DEFAULT_LABEL_SETTINGS.shipper_info as any),
      ...(prefs.shipper_info || {}),
    },
    product_info: {
      ...(DEFAULT_LABEL_SETTINGS.product_info as any),
      ...(prefs.product_info || {}),
    },
    powered_by: prefs.powered_by ?? DEFAULT_LABEL_SETTINGS.powered_by,
  }
}

export function generateLabelForOrder(
  order: any,
  userId: string,
  tx?: any,
): Promise<string>
export function generateLabelForOrder(
  order: any,
  userId: string,
  tx: any,
  options: { returnBuffer: true },
): Promise<Buffer>
export async function generateLabelForOrder(
  order: any,
  userId: string,
  tx: any = db,
  options?: { returnBuffer?: boolean },
): Promise<string | Buffer> {
  console.log('ORDER', order)

  // Load preferences
  const [prefsRow] = await tx
    .select()
    .from(labelPreferences)
    .where(eq(labelPreferences.user_id, userId))
  const prefs = prefsRow ?? undefined
  const settings: any = mergeSettings(prefs)

  // Load user profile (logo)
  const [profileOfUser] = await tx
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
  let logoBase64: string | null = null
  if (settings.shipper_info?.brandLogo && profileOfUser?.companyInfo?.companyLogoUrl) {
    try {
      const logoUrl = await presignDownload(profileOfUser.companyInfo.companyLogoUrl)
      const finalUrl = Array.isArray(logoUrl) ? (logoUrl.length > 0 ? logoUrl[0] : null) : logoUrl
      if (finalUrl) {
        const logoResp = await axios.get(finalUrl, {
          responseType: 'arraybuffer',
          timeout: LABEL_ASSET_TIMEOUT_MS,
        })
        const buffer = Buffer.from(logoResp.data)
        const dataUrl = await bufferToDataUrl(buffer)
        if (dataUrl && isValidDataUrl(dataUrl)) {
          logoBase64 = dataUrl
        }
      }
    } catch (err) {
      console.warn('⚠️ Failed to fetch company logo:', err)
    }
  }


  // Normalize fields
  const consignee = {
    name: order.buyer_name ?? order.consignee_name ?? '',
    address: order.address ?? '',
    city: order.city ?? '',
    state: order.state ?? '',
    pincode: order.pincode ?? '',
    phone: order.buyer_phone ?? order.phone ?? '',
    country: order.country ?? 'India',
  }

  const pickup = safeParseObject(order.pickup_details)

  const products = safeParseArray(order.products)
  const paymentType = (order.payment_type ?? order.order_type ?? order.type ?? '')
    .toString()
    .toLowerCase()

  const pages: any[] = []
  const darkTextColor = '#111111'
  const strongBorderColor = '#111111'
  const isEnabled = (value: unknown) => (value === undefined ? true : value === true)
  const awbEnabled = isEnabled(settings.order_info?.awb)
  const showBrandLogo = isEnabled(settings.shipper_info?.brandLogo)
  const showSellerName = isEnabled(settings.shipper_info?.sellerBrandName)
  const showShipperAddress = isEnabled(settings.shipper_info?.shipperAddress)
  const showShipperPhone = isEnabled(settings.shipper_info?.shipperPhone)
  const showShipperGst = isEnabled(settings.shipper_info?.gstin)
  const showRtoAddress = isEnabled(settings.shipper_info?.rtoAddress)
  const showCustomerPhone = isEnabled(settings.order_info?.customerPhone)
  const showOrderId = isEnabled(settings.order_info?.orderId)
  const showInvoiceNumber = isEnabled(settings.order_info?.invoiceNumber)
  const showOrderDate = isEnabled(settings.order_info?.orderDate)
  const showInvoiceDate = isEnabled(settings.order_info?.invoiceDate)
  const showOrderBarcode = isEnabled(settings.order_info?.orderBarcode)
  const showInvoiceBarcode = isEnabled(settings.order_info?.invoiceBarcode)
  const showRtoRoutingCode = isEnabled(settings.order_info?.rtoRoutingCode)
  const showDeclaredValue = isEnabled(settings.order_info?.declaredValue)
  const showCod = isEnabled(settings.order_info?.cod)
  const showTerms = isEnabled(settings.order_info?.terms)
  const showItemName = isEnabled(settings.product_info?.itemName)
  const showProductCost = isEnabled(settings.product_info?.productCost)
  const showProductQuantity = isEnabled(settings.product_info?.productQuantity)
  const showSkuCode = isEnabled(settings.product_info?.skuCode)
  const showDimensions = isEnabled(settings.product_info?.dimension)
  const showDeadWeight = isEnabled(settings.product_info?.deadWeight)
  const showOtherCharges = isEnabled(settings.product_info?.otherCharges)
  const charLimit = Math.max(10, Number(settings.char_limit ?? 25))
  const maxItems = Math.max(1, Number(settings.max_items ?? 3))
  const companyInfo = safeParseObject(profileOfUser?.companyInfo)

  const toAmount = (value: unknown) => {
    const n = Number(value ?? 0)
    return Number.isFinite(n) ? n : 0
  }
  const formatCurrency = (value: number | string | null | undefined) =>
    `₹${toAmount(value).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

  const trimText = (value: any, max = charLimit) => {
    const text = String(value ?? '').trim()
    if (!text) return '-'
    return text.length > max ? `${text.slice(0, max)}...` : text
  }

  const safeLine = (value: unknown, max = 90) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (!text) return ''
    return max > 0 && text.length > max ? `${text.slice(0, max)}...` : text
  }

  const formatLabelDateTime = (value: unknown) => {
    const raw = String(value ?? '').trim()
    if (!raw) return '-'
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    }
    return raw
  }

  const formatWeightKg = (value: unknown) => {
    const amount = Number(value ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) return '-'
    const weightKg = amount > 20 ? amount / 1000 : amount
    return `${weightKg.toFixed(3)} kg`
  }

  const compactAddressLines = (...parts: Array<unknown>) =>
    parts
      .map((part) => String(part ?? '').trim())
      .filter(Boolean)

  const sectionLayout = {
    hLineWidth: () => 1,
    vLineWidth: () => 1,
    hLineColor: () => strongBorderColor,
    vLineColor: () => strongBorderColor,
    paddingLeft: () => 4,
    paddingRight: () => 4,
    paddingTop: () => 4,
    paddingBottom: () => 4,
  }

  const detailLabel = (text: string) => ({
    text,
    bold: true,
    fontSize: 6.5,
    color: darkTextColor,
    margin: [0, 0, 0, 2],
  })

  const detailValue = (text: string) => ({
    text: safeLine(text || '-', 40),
    fontSize: 6.5,
    color: darkTextColor,
    margin: [0, 0, 0, 4],
  })

  const compactDetailCell = (label: string, value: string, valueMaxLength = 34) => ({
    stack: [
      {
        text: label,
        bold: true,
        fontSize: 6,
        color: darkTextColor,
        margin: [0, 0, 0, 1],
      },
      {
        text: safeLine(value || '-', valueMaxLength),
        fontSize: 6.1,
        bold: true,
        color: darkTextColor,
      },
    ],
  })

  // Prefer a locally generated AWB barcode so labels do not repeat the AWB text below the bars.
  // Courier barcode images are still used as a fallback when an AWB number is unavailable.
  let awbBarcode: string | null = null
  const providerKey = (order.integration_type || order.courier_partner || '')
    .toString()
    .toLowerCase()

  // Check for barcode from courier APIs - can be URL or data URL
  const barcodeSource =
    order.barcode_img || order.barcode_url || order.barcode_image || order.barcode || null
  let orderBarcode: string | null = null
  let invoiceBarcode: string | null = null

  if (awbEnabled && order.awb_number) {
    awbBarcode = await generateBarcodeBase64(order.awb_number)
    console.log('✅ Generated AWB barcode locally')
  }

  if (showOrderBarcode && order.order_number) {
    orderBarcode = await generateBarcodeBase64(String(order.order_number))
  }

  if (showInvoiceBarcode && order.invoice_number) {
    invoiceBarcode = await generateBarcodeBase64(String(order.invoice_number))
  }

  if (!awbBarcode && awbEnabled && providerKey.includes('delhivery') && barcodeSource) {
    try {
      // Check if it's already a data URL
      if (isValidDataUrl(barcodeSource)) {
        awbBarcode = barcodeSource
        console.log('✅ Using barcode from courier API (data URL format)')
      } else if (typeof barcodeSource === 'string' && barcodeSource.startsWith('http')) {
        // It's a URL - download and convert to data URL
        console.log(`📥 Downloading barcode from courier API: ${barcodeSource}`)
        try {
          const barcodeResponse = await axios.get(barcodeSource, {
            responseType: 'arraybuffer',
            timeout: 10000,
          })
          const barcodeBuffer = Buffer.from(barcodeResponse.data)
          const dataUrl = await bufferToDataUrl(barcodeBuffer)
          if (dataUrl && isValidDataUrl(dataUrl)) {
            awbBarcode = dataUrl
            console.log('✅ Barcode downloaded and converted to data URL')
          } else {
            console.warn('⚠️ Failed to convert downloaded barcode to data URL')
          }
        } catch (downloadErr: any) {
          console.warn(
            `⚠️ Failed to download barcode from URL: ${barcodeSource}`,
            downloadErr?.message || downloadErr,
          )
        }
      } else {
        console.warn(`⚠️ Barcode from courier API is in unexpected format: ${typeof barcodeSource}`)
      }
    } catch (err: any) {
      console.warn(`⚠️ Error processing barcode from courier API:`, err?.message || err)
    }
  }

  // Register images in pdfmake's images dictionary FIRST
  // Only add images that are valid data URLs
  const images: Record<string, string> = {}
  if (showBrandLogo && logoBase64 && isValidDataUrl(logoBase64)) {
    images.logo = logoBase64
  }
  if (awbEnabled && awbBarcode && isValidDataUrl(awbBarcode)) {
    images.awbBarcode = awbBarcode
  }
  if (showOrderBarcode && orderBarcode && isValidDataUrl(orderBarcode)) {
    images.orderBarcode = orderBarcode
  }
  if (showInvoiceBarcode && invoiceBarcode && isValidDataUrl(invoiceBarcode)) {
    images.invoiceBarcode = invoiceBarcode
  }

  const chunk = products.slice(0, maxItems)
  const pageContent: any[] = []

  const rawProductSubtotal = products.reduce((sum: number, p: any) => {
    const qty = Math.max(1, toAmount(p?.qty ?? p?.quantity ?? 1))
    const unitPrice = toAmount(p?.original_price ?? p?.price)
    return sum + unitPrice * qty
  }, 0)
  const netOrderSubtotal = toAmount(order.order_amount)
  const netProductSubtotal = Math.max(
    0,
    netOrderSubtotal -
      toAmount(order.shipping_charges) -
      toAmount(order.other_charges) -
      toAmount(order.gift_wrap) -
      toAmount(order.transaction_fee),
  )
  const subtotalScaleFactor =
    rawProductSubtotal > 0 &&
    netProductSubtotal > 0 &&
    Math.abs(rawProductSubtotal - netProductSubtotal) > 0.01
      ? netProductSubtotal / rawProductSubtotal
      : 1

  const getDisplayedUnitPrice = (product: any) => {
    const qty = Math.max(1, toAmount(product?.qty ?? product?.quantity ?? 1))
    const storedNetUnitPrice = toAmount(
      product?.net_price ?? product?.discounted_price ?? product?.display_price,
    )
    const originalUnitPrice = toAmount(product?.original_price ?? product?.price)
    const lineDiscount = toAmount(product?.discount)
    if (storedNetUnitPrice > 0) {
      return storedNetUnitPrice
    }
    if (subtotalScaleFactor !== 1) {
      return originalUnitPrice * subtotalScaleFactor
    }
    if (lineDiscount > 0) {
      return Math.max(0, (originalUnitPrice * qty - lineDiscount) / qty)
    }
    return originalUnitPrice
  }

  const sellerName =
    companyInfo.brandName ||
    companyInfo.businessName ||
    companyInfo.companyName ||
    pickup.warehouse_name ||
    profileOfUser?.companyInfo?.displayName ||
    ''
  const sellerAddressLines = compactAddressLines(
    pickup.address || companyInfo.companyAddress,
    [pickup.city || companyInfo.city, pickup.state || companyInfo.state]
      .filter(Boolean)
      .join(', '),
    pickup.pincode || companyInfo.pincode,
    order.country || 'India',
  )
  const sellerPhone = String(pickup.phone || companyInfo.phone || profileOfUser?.phone || '').trim()
  const sellerGstin = String(pickup.gst_number || companyInfo.companyGst || companyInfo.gstin || '').trim()
  const rtoDetails = safeParseObject(order.rto_details)
  const rtoAddressLines = compactAddressLines(
    rtoDetails.address || pickup.rto_address || pickup.address || companyInfo.companyAddress,
    [rtoDetails.city || pickup.city || companyInfo.city, rtoDetails.state || pickup.state || companyInfo.state]
      .filter(Boolean)
      .join(', '),
    rtoDetails.pincode || pickup.pincode || companyInfo.pincode,
    order.country || 'India',
  )
  const courierName = String(order.courier_partner || order.integration_type || '-').trim() || '-'
  const serviceType =
    String(
      order.service_type ||
        order.provider_service ||
        order.shipping_mode ||
        order.integration_type ||
        order.courier_partner ||
        '-',
    )
      .replace(/_/g, ' ')
      .toUpperCase() || '-'
  const chargeableWeight = formatWeightKg(
    order.charged_weight ?? order.actual_weight ?? order.weight ?? 0,
  )
  const dimensionText =
    toAmount(order.length) > 0 && toAmount(order.breadth) > 0 && toAmount(order.height) > 0
      ? `${toAmount(order.length)} x ${toAmount(order.breadth)} x ${toAmount(order.height)} cm`
      : ''
  const declaredValue = formatCurrency(
    order.declared_value ?? order.invoice_amount ?? order.order_amount ?? 0,
  )
  const packageCount = Math.max(
    1,
    Number(
      order.piece_count ??
        order.pieces ??
        order.package_count ??
        order.packet_count ??
        safeParseArray(order.packages).length ??
        1,
    ) || 1,
  )
  const paymentModeLabel = paymentType === 'cod' ? 'COD' : 'PREPAID'
  const shipToLines = compactAddressLines(
    consignee.name,
    consignee.address,
    [consignee.city, consignee.state]
      .filter(Boolean)
      .join(', '),
    consignee.pincode,
    consignee.country || order.country || 'India',
    showCustomerPhone && consignee.phone ? `Phone: ${consignee.phone}` : '',
  )
  const productColumns = [
    showItemName && { key: 'itemName', label: 'ITEM NAME', width: '*', alignment: 'left' as const },
    showProductQuantity && { key: 'quantity', label: 'QTY', width: 42, alignment: 'center' as const },
    showProductCost && { key: 'price', label: 'PRICE', width: 68, alignment: 'center' as const },
    showSkuCode && { key: 'sku', label: 'SKU', width: 68, alignment: 'center' as const },
  ].filter(Boolean) as Array<{
    key: 'itemName' | 'quantity' | 'price' | 'sku'
    label: string
    width: string | number
    alignment: 'left' | 'center'
  }>

  const productRows = (chunk.length ? chunk : [{}]).map((product: any) => {
    const itemName = product.name ?? product.productName ?? product.box_name ?? '-'
    const qty = Math.max(1, Number(product.qty ?? product.quantity ?? 1) || 1)
    const price = getDisplayedUnitPrice(product)
    const sku = product.sku ?? product.skuCode ?? '-'

    return productColumns.map((column) => {
      const textByColumn = {
        itemName: String(itemName || '-').trim() || '-',
        quantity: String(qty),
        price: formatCurrency(price),
        sku: String(sku || '-').trim() || '-',
      }

      return {
        text: column.key === 'itemName' ? trimText(textByColumn[column.key]) : textByColumn[column.key],
        fontSize: column.key === 'price' ? 7 : 6.75,
        bold: column.key !== 'price',
        alignment: column.alignment,
      }
    })
  })

  pageContent.push({
    table: {
      widths: ['58%', '42%'],
      body: [
        [
          {
            stack: images.logo
              ? [{ image: 'logo', fit: [92, 38], alignment: 'left', margin: [0, 2, 0, 2] }]
              : showSellerName
                ? [{ text: trimText(sellerName, 26), fontSize: 16, bold: true, margin: [0, 8, 0, 0] }]
                : [{ text: '', fontSize: 16, margin: [0, 8, 0, 0] }],
            minHeight: 48,
          },
          {
            stack: [
              {
                text: courierName.toUpperCase(),
                fontSize: 11,
                bold: true,
                alignment: 'center',
                margin: [0, 12, 0, 0],
              },
            ],
            minHeight: 48,
          },
        ],
      ],
    },
    layout: sectionLayout,
    margin: [0, 0, 0, 0],
  })

  pageContent.push({
    table: {
      widths: ['58%', '42%'],
      body: [
        [
          {
            stack: [
              { text: 'SHIP TO:', bold: true, fontSize: 7.5, margin: [0, 0, 0, 4] },
              ...shipToLines.map((line) => ({
                text: safeLine(line, 55),
                fontSize: 6.25,
                margin: [0, 0, 0, 2],
              })),
            ],
            minHeight: 82,
          },
          {
            stack: [
              ...(awbEnabled
                ? [
                    { text: 'AWB', fontSize: 16, bold: true, alignment: 'center', margin: [0, 14, 0, 6] },
                    {
                      text: safeLine(order.awb_number || '-', 28),
                      fontSize: 11.5,
                      bold: true,
                      alignment: 'center',
                    },
                  ]
                : [
                    {
                      text: serviceType,
                      fontSize: 11,
                      bold: true,
                      alignment: 'center',
                      margin: [0, 26, 0, 0],
                    },
                  ]),
            ],
            minHeight: 82,
          },
        ],
      ],
    },
    layout: sectionLayout,
    margin: [0, 0, 0, 0],
  })

  const detailCells: any[] = [
    showOrderId && compactDetailCell('ORDER ID', String(order.order_number || '-'), 24),
    showInvoiceNumber && compactDetailCell('INVOICE', String(order.invoice_number || '-'), 24),
    showOrderDate && compactDetailCell('ORDER DATE', formatLabelDateTime(order.order_date || order.created_at), 24),
    showInvoiceDate && compactDetailCell('INVOICE DATE', formatLabelDateTime(order.invoice_date), 24),
    showRtoRoutingCode && compactDetailCell('SORT CODE', String(order.sort_code || '-'), 24),
    compactDetailCell('COURIER', courierName.toUpperCase(), 24),
    showCod && compactDetailCell('PAYMENT MODE', paymentModeLabel, 18),
    compactDetailCell('SERVICE TYPE', serviceType, 20),
    showDeadWeight && compactDetailCell('WEIGHT / PIECES', `${chargeableWeight} | ${packageCount} / ${packageCount}`, 26),
    showDimensions && compactDetailCell('DIMENSIONS', dimensionText || '-', 28),
    showDeclaredValue && compactDetailCell('DECLARED VALUE', declaredValue, 20),
  ].filter(Boolean)

  const detailRows =
    detailCells.length > 0
      ? Array.from({ length: Math.ceil(detailCells.length / 3) }, (_, rowIndex) => {
          const row = detailCells.slice(rowIndex * 3, rowIndex * 3 + 3)
          while (row.length < 3) row.push({ text: '', fontSize: 6 })
          return row
        })
      : [[{ text: '', fontSize: 6 }, { text: '', fontSize: 6 }, { text: '', fontSize: 6 }]]

  pageContent.push({
    table: {
      widths: ['33%', '33%', '34%'],
      body: detailRows,
    },
    layout: sectionLayout,
    margin: [0, 0, 0, 0],
  })

  const barcodeStack: any[] = []
  if (awbEnabled) {
    barcodeStack.push(
      {
        text: safeLine(order.awb_number || '-', 28),
        alignment: 'center',
        fontSize: 11,
        bold: true,
        margin: [0, 0, 0, 3],
      },
      images.awbBarcode
        ? {
            image: 'awbBarcode',
            width: 250,
            height: 42,
            alignment: 'center',
            margin: [0, 0, 0, 0],
          }
        : {
            text: 'AWB barcode unavailable',
            alignment: 'center',
            fontSize: 7,
            margin: [0, 0, 0, 0],
          },
    )
  }
  if (showOrderBarcode && order.order_number && !awbEnabled) {
    barcodeStack.push(
      {
        text: `ORDER ID: ${safeLine(order.order_number, 28)}`,
        alignment: 'center',
        fontSize: 11,
        bold: true,
        margin: [0, 4, 0, 3],
      },
      images.orderBarcode
        ? { image: 'orderBarcode', fit: [180, 32], alignment: 'center', margin: [0, 0, 0, 4] }
        : { text: '', fontSize: 1 },
    )
  }
  if (showInvoiceBarcode && order.invoice_number && !awbEnabled) {
    barcodeStack.push(
      {
        text: `INVOICE: ${safeLine(order.invoice_number, 28)}`,
        alignment: 'center',
        fontSize: 11,
        bold: true,
        margin: [0, 4, 0, 3],
      },
      images.invoiceBarcode
        ? { image: 'invoiceBarcode', fit: [180, 32], alignment: 'center', margin: [0, 0, 0, 4] }
        : { text: '', fontSize: 1 },
    )
  }

  if (barcodeStack.length > 0) {
    pageContent.push({
      table: {
        widths: ['*'],
        body: [[{ stack: barcodeStack }]],
      },
      layout: sectionLayout,
      margin: [0, 0, 0, 0],
    })
  }

  if (productColumns.length > 0) {
    pageContent.push({
      table: {
        headerRows: 1,
        widths: productColumns.map((column) => column.width),
        body: [
          productColumns.map((column) => ({
            text: column.label,
            bold: true,
            fontSize: 6.25,
            alignment: 'center',
          })),
          ...productRows,
          ...(showOtherCharges
            ? [
                productColumns.length === 1
                  ? [
                      {
                        text: `OTHER CHARGES: ${formatCurrency(order.other_charges ?? 0)}`,
                        bold: true,
                        fontSize: 6.25,
                      },
                    ]
                  : [
                      {
                        text: 'OTHER CHARGES',
                        bold: true,
                        fontSize: 6.25,
                        colSpan: productColumns.length - 1,
                      },
                      ...Array.from({ length: Math.max(0, productColumns.length - 2) }, () => ({ text: '' })),
                      {
                        text: formatCurrency(order.other_charges ?? 0),
                        fontSize: 6.75,
                        bold: true,
                        alignment: 'center',
                      },
                    ],
              ]
            : []),
        ],
      },
      layout: sectionLayout,
      margin: [0, 0, 0, 0],
    })
  }

  pageContent.push({
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              ...(showSellerName
                ? [
                    { text: 'SELLER NAME:', bold: true, fontSize: 7.5, margin: [0, 0, 0, 4] },
                    { text: safeLine(sellerName || '-', 60), fontSize: 6.25, margin: [0, 0, 0, 6] },
                  ]
                : []),
              ...(showShipperAddress
                ? [
                    { text: 'SELLER ADDRESS:', bold: true, fontSize: 7.5, margin: [0, 0, 0, 4] },
                    ...sellerAddressLines.map((line) => ({
                      text: safeLine(line, 70),
                      fontSize: 6.25,
                      margin: [0, 0, 0, 2],
                    })),
                  ]
                : []),
              ...(showShipperPhone && sellerPhone
                ? [{ text: `PHONE: ${safeLine(sellerPhone, 28)}`, fontSize: 6.25, margin: [0, 2, 0, 0] }]
                : []),
              ...(showShipperGst && sellerGstin
                ? [{ text: `GSTIN: ${safeLine(sellerGstin, 24)}`, fontSize: 6.25, margin: [0, 2, 0, 0] }]
                : []),
            ],
            minHeight: 52,
          },
        ],
      ],
    },
    layout: sectionLayout,
    margin: [0, 0, 0, 0],
  })

  if (showRtoAddress && rtoAddressLines.length > 0) {
    pageContent.push({
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                { text: 'RETURN TO:', bold: true, fontSize: 7.5, margin: [0, 0, 0, 4] },
                ...rtoAddressLines.map((line) => ({
                  text: safeLine(line, 70),
                  fontSize: 6.25,
                  margin: [0, 0, 0, 2],
                })),
              ],
            },
          ],
        ],
      },
      layout: sectionLayout,
      margin: [0, 0, 0, 0],
    })
  }

  if (showTerms) {
    pageContent.push({
      text: '*Terms & Conditions apply.',
      fontSize: 5.5,
      color: darkTextColor,
      margin: [4, 3, 4, 0],
      alignment: 'center',
    })
  }

  // Push pageContent to pages array - CRITICAL: Without this, label will be empty!
  if (pageContent.length === 0) {
    console.warn('⚠️ pageContent is empty - label may be blank')
  }
  pages.push({ stack: pageContent })

  const docDefinition: any = {
    defaultStyle: { font: 'Helvetica', color: darkTextColor },
    pageSize: settings.printer_type === 'thermal' ? { width: 288, height: 432 } : 'A4',
    content: pages,
    pageMargins: [6, 6, 6, 6],
    background: (_currentPage: number, pageSize: { width: number; height: number }) => ({
      canvas: [
        {
          type: 'rect',
          x: 3,
          y: 3,
          w: pageSize.width - 6,
          h: pageSize.height - 6,
          lineWidth: 1.1,
          lineColor: strongBorderColor,
        },
      ],
    }),
    ...(Object.keys(images).length > 0 && { images }),
  }

  try {
    const printer = new PdfPrinter(fonts)
    const pdfDoc = printer.createPdfKitDocument(docDefinition)
    const chunks: Buffer[] = []
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      pdfDoc.on('data', (chunk) => chunks.push(chunk))
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)))
      pdfDoc.on('error', (err) => reject(err))
      pdfDoc.end()
    })

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF buffer is empty or invalid')
    }

    console.log(
      `📄 PDF generated successfully (${pdfBuffer.length} bytes) for order ${order?.order_number}`,
    )

    if (options?.returnBuffer) {
      return pdfBuffer
    }

    const labelIdentifier = String(order?.order_number ?? order?.id ?? 'order')
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 46) || 'order'

    // Upload directly via SDK to avoid presigned PUT timeouts from the backend.
    const uploadTarget = await uploadBufferToStorage({
      buffer: pdfBuffer,
      filename: `label-${labelIdentifier}.pdf`,
      contentType: 'application/pdf',
      userId,
      folderKey: 'labels',
    })

    if (!uploadTarget?.key) {
      throw new Error('Label key is missing after upload')
    }

    const finalKey = uploadTarget.key

    // Validate key is not empty and is a string
    if (!finalKey || typeof finalKey !== 'string' || finalKey.trim().length === 0) {
      throw new Error('Label key is invalid or empty after upload')
    }

    const trimmedKey = finalKey.trim()
    console.log(`✅ Label uploaded successfully: ${trimmedKey}`)
    return trimmedKey
  } catch (err: any) {
    console.error(
      `❌ Failed to generate/upload label for order ${order?.order_number}:`,
      err?.message || err,
      err?.stack,
    )
    throw new Error(`Label generation/upload failed: ${err?.message || err}`)
  }
}
