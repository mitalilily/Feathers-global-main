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

export async function generateLabelForOrder(order: any, userId: string, tx: any = db) {
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
  const showCustomerPhone = isEnabled(settings.order_info?.customerPhone)
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
    paddingLeft: () => 7,
    paddingRight: () => 7,
    paddingTop: () => 7,
    paddingBottom: () => 7,
  }

  const detailLabel = (text: string) => ({
    text,
    bold: true,
    fontSize: 7,
    color: darkTextColor,
    margin: [0, 0, 0, 3],
  })

  const detailValue = (text: string) => ({
    text: safeLine(text || '-', 40),
    fontSize: 7,
    color: darkTextColor,
    margin: [0, 0, 0, 8],
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

  if (awbEnabled && order.awb_number) {
    awbBarcode = await generateBarcodeBase64(order.awb_number)
    console.log('✅ Generated AWB barcode locally')
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
  const sellerWebsite = safeLine(companyInfo.website, 40)
  const bottomMessage = sellerWebsite
    ? ['THANK YOU FOR SHIPPING WITH US!', sellerWebsite]
    : ['THANK YOU FOR SHIPPING WITH US!']
  const productRows = (chunk.length ? chunk : [{}]).map((product: any) => {
    const itemName = product.name ?? product.productName ?? product.box_name ?? '-'
    const qty = Math.max(1, Number(product.qty ?? product.quantity ?? 1) || 1)
    const price = getDisplayedUnitPrice(product)
    const sku = product.sku ?? product.skuCode ?? '-'

    return [
      { text: trimText(itemName, 28), fontSize: 7, alignment: 'left' },
      { text: String(qty), fontSize: 7, alignment: 'center' },
      { text: formatCurrency(price), fontSize: 7, alignment: 'center' },
      { text: trimText(sku, 18), fontSize: 7, alignment: 'center' },
    ]
  })

  pageContent.push({
    table: {
      widths: ['58%', '42%'],
      body: [
        [
          {
            stack: images.logo
              ? [{ image: 'logo', fit: [120, 52], alignment: 'left', margin: [0, 8, 0, 6] }]
              : [{ text: trimText(sellerName, 26), fontSize: 20, bold: true, margin: [0, 12, 0, 0] }],
            minHeight: 72,
          },
          {
            stack: [
              {
                text: courierName.toUpperCase(),
                fontSize: 15,
                bold: true,
                alignment: 'center',
                margin: [0, 16, 0, 0],
              },
            ],
            minHeight: 72,
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
              { text: 'SHIP TO:', bold: true, fontSize: 9, margin: [0, 0, 0, 6] },
              ...shipToLines.map((line) => ({
                text: safeLine(line, 55),
                fontSize: 7,
                margin: [0, 0, 0, 4],
              })),
            ],
            minHeight: 120,
          },
          {
            stack: [
              { text: 'AWB', fontSize: 20, bold: true, alignment: 'center', margin: [0, 22, 0, 10] },
              {
                text: safeLine(order.awb_number || '-', 28),
                fontSize: 15,
                bold: true,
                alignment: 'center',
              },
            ],
            minHeight: 120,
          },
        ],
      ],
    },
    layout: sectionLayout,
    margin: [0, 0, 0, 0],
  })

  pageContent.push({
    table: {
      widths: ['50%', '50%'],
      body: [
        [
          {
            stack: [
              detailLabel('ORDER ID:'),
              detailValue(String(order.order_number || '-')),
              detailLabel('DATE & TIME:'),
              detailValue(formatLabelDateTime(order.order_date || order.created_at)),
              detailLabel('PAYMENT MODE:'),
              detailValue(paymentModeLabel),
            ],
            minHeight: 118,
          },
          {
            stack: [
              detailLabel('COURIER:'),
              detailValue(courierName.toUpperCase()),
              detailLabel('AWB NO.:'),
              detailValue(String(order.awb_number || '-')),
              detailLabel('SERVICE TYPE:'),
              detailValue(serviceType),
              detailLabel('WEIGHT:'),
              detailValue(chargeableWeight),
              detailLabel('PIECES:'),
              { text: `${packageCount} / ${packageCount}`, fontSize: 7, color: darkTextColor },
            ],
            minHeight: 118,
          },
        ],
      ],
    },
    layout: sectionLayout,
    margin: [0, 0, 0, 0],
  })

  pageContent.push({
    table: {
      widths: ['*'],
      body: [
        [
          awbEnabled && images.awbBarcode
            ? {
                image: 'awbBarcode',
                fit: [235, 62],
                alignment: 'center',
                margin: [0, 8, 0, 6],
              }
            : {
                text: safeLine(order.awb_number || '-', 28),
                alignment: 'center',
                fontSize: 18,
                bold: true,
                margin: [0, 24, 0, 24],
              },
        ],
      ],
    },
    layout: sectionLayout,
    margin: [0, 0, 0, 0],
  })

  pageContent.push({
    table: {
      headerRows: 1,
      widths: ['*', 42, 68, 68],
      body: [
        [
          { text: 'ITEM NAME', bold: true, fontSize: 7, alignment: 'center' },
          { text: 'QTY', bold: true, fontSize: 7, alignment: 'center' },
          { text: 'PRICE', bold: true, fontSize: 7, alignment: 'center' },
          { text: 'SKU', bold: true, fontSize: 7, alignment: 'center' },
        ],
        ...productRows,
      ],
    },
    layout: sectionLayout,
    margin: [0, 0, 0, 0],
  })

  pageContent.push({
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: 'SELLER NAME:', bold: true, fontSize: 9, margin: [0, 0, 0, 6] },
              { text: safeLine(sellerName || '-', 60), fontSize: 7, margin: [0, 0, 0, 12] },
              { text: 'SELLER ADDRESS:', bold: true, fontSize: 9, margin: [0, 0, 0, 6] },
              ...sellerAddressLines.map((line) => ({
                text: safeLine(line, 70),
                fontSize: 7,
                margin: [0, 0, 0, 4],
              })),
            ],
            minHeight: 78,
          },
        ],
      ],
    },
    layout: sectionLayout,
    margin: [0, 0, 0, 0],
  })

  pageContent.push({
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: bottomMessage.map((line, index) => ({
              text: line,
              alignment: 'right',
              fontSize: index === 0 ? 8 : 7,
              bold: index === 0,
              margin: [0, 0, 0, index === 0 ? 3 : 0],
            })),
            minHeight: 26,
          },
        ],
      ],
    },
    layout: sectionLayout,
    margin: [0, 0, 0, 0],
  })

  // Push pageContent to pages array - CRITICAL: Without this, label will be empty!
  if (pageContent.length === 0) {
    console.warn('⚠️ pageContent is empty - label may be blank')
  }
  pages.push({ stack: pageContent })

  const docDefinition: any = {
    defaultStyle: { font: 'Helvetica', color: darkTextColor },
    pageSize: settings.printer_type === 'thermal' ? { width: 288, height: 432 } : 'A4',
    content: pages,
    pageMargins: [10, 10, 10, 10], // Reduced margins for more space
    background: (_currentPage: number, pageSize: { width: number; height: number }) => ({
      canvas: [
        {
          type: 'rect',
          x: 5,
          y: 5,
          w: pageSize.width - 10,
          h: pageSize.height - 10,
          lineWidth: 1.4,
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
