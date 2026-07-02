import { eq } from 'drizzle-orm'
import * as XLSX from 'xlsx'
import {
  AttachmentInput,
  escapeHtml,
  renderDataTable,
  renderEmailButton,
  renderEmailFrame,
  sendEmail,
} from '../../utils/emailSender'
import { db } from '../client'
import { b2b_orders } from '../schema/b2bOrders'
import { b2c_orders } from '../schema/b2cOrders'
import { users } from '../schema/users'
import { userProfiles } from '../schema/userProfile'
import { presignDownload } from './upload.service'

const formatCurrency = (value: unknown) => `Rs. ${Number(value || 0).toFixed(2)}`

const formatDateTime = (value: unknown) => {
  if (!value) return 'N/A'
  const date = new Date(value as any)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const compactText = (value: unknown, fallback = 'N/A') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

const toStatusLabel = (status: string) =>
  status
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const resolveDashboardUrl = () =>
  process.env.FRONTEND_URL || process.env.CLIENT_URL || process.env.APP_URL || 'https://fgship.in'

const getMerchantContext = async (userId: string) => {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1)
  const companyInfo = (profile?.companyInfo as any) || {}
  const merchantName =
    companyInfo.businessName ||
    companyInfo.brandName ||
    companyInfo.companyName ||
    (user?.email ? String(user.email).split('@')[0] : '') ||
    'Merchant'
  const merchantEmail =
    compactText(user?.email, '') ||
    compactText(companyInfo.contactEmail, '') ||
    compactText(companyInfo.companyEmail, '')

  return {
    user,
    profile,
    merchantName,
    merchantEmail,
  }
}

const sendOperationalEmail = async ({
  to,
  subject,
  eyebrow,
  title,
  intro,
  rows,
  extraHtml,
  outro,
  attachments,
}: {
  to: string
  subject: string
  eyebrow: string
  title: string
  intro?: string
  rows: Array<{ label: string; value: string }>
  extraHtml?: string
  outro?: string
  attachments?: AttachmentInput[]
}) => {
  const html = renderEmailFrame({
    eyebrow,
    title,
    intro,
    body: `
      ${renderDataTable(rows)}
      ${extraHtml || ''}
    `,
    outro,
  })

  await sendEmail(to, subject, html, attachments)
}

export const sendWalletRechargeEventEmail = async (params: {
  userId: string
  amount: number
  currency?: string | null
  gatewayOrderId: string
  status: 'success' | 'failed'
  gatewayPaymentId?: string | null
  reason?: string | null
}) => {
  const merchant = await getMerchantContext(params.userId)
  if (!merchant.merchantEmail) return

  const statusTitle = params.status === 'success' ? 'Wallet recharge successful' : 'Wallet recharge failed'
  await sendOperationalEmail({
    to: merchant.merchantEmail,
    subject: `${statusTitle} - ${formatCurrency(params.amount)}`,
    eyebrow: 'Wallet',
    title: statusTitle,
    intro: `Hello ${escapeHtml(merchant.merchantName)}, your wallet recharge event has been recorded on FGShip.`,
    rows: [
      { label: 'Amount', value: formatCurrency(params.amount) },
      { label: 'Currency', value: compactText(params.currency || 'INR') },
      { label: 'Status', value: params.status === 'success' ? 'Successful' : 'Failed' },
      { label: 'Gateway order ID', value: escapeHtml(params.gatewayOrderId) },
      { label: 'Payment ID', value: escapeHtml(compactText(params.gatewayPaymentId)) },
      { label: 'Reason', value: escapeHtml(compactText(params.reason)) },
      { label: 'Updated at', value: formatDateTime(new Date()) },
    ],
    outro:
      params.status === 'success'
        ? 'The credited amount is now available in your wallet balance for future bookings.'
        : 'Please retry the payment from your dashboard if the wallet balance was not updated.',
  })
}

export const sendSupportTicketCreatedEmail = async (params: {
  userId: string
  ticket: {
    id: string
    subject: string
    category: string
    subcategory: string
    awbNumber?: string | null
    description: string
    status?: string | null
    attachments?: string[] | null
    createdAt?: Date | string | null
  }
}) => {
  const merchant = await getMerchantContext(params.userId)
  if (!merchant.merchantEmail) return

  await sendOperationalEmail({
    to: merchant.merchantEmail,
    subject: `Support ticket created - ${params.ticket.subject}`,
    eyebrow: 'Support',
    title: 'Support ticket created',
    intro: `Hello ${escapeHtml(merchant.merchantName)}, your support ticket has been created successfully.`,
    rows: [
      { label: 'Ticket ID', value: escapeHtml(params.ticket.id) },
      { label: 'Subject', value: escapeHtml(params.ticket.subject) },
      { label: 'Category', value: escapeHtml(params.ticket.category) },
      { label: 'Subcategory', value: escapeHtml(params.ticket.subcategory) },
      { label: 'AWB number', value: escapeHtml(compactText(params.ticket.awbNumber)) },
      { label: 'Status', value: escapeHtml(compactText(params.ticket.status || 'open')) },
      {
        label: 'Attachments',
        value: String(Array.isArray(params.ticket.attachments) ? params.ticket.attachments.length : 0),
      },
      { label: 'Created at', value: formatDateTime(params.ticket.createdAt || new Date()) },
      { label: 'Description', value: escapeHtml(params.ticket.description) },
    ],
    extraHtml: `<div style="margin-top:18px;">${renderEmailButton(
      'Open dashboard',
      resolveDashboardUrl(),
    )}</div>`,
  })
}

export const sendAccountActivatedEmail = async (params: {
  userId?: string
  email?: string | null
}) => {
  let to = compactText(params.email, '')
  let merchantName = 'Merchant'

  if (params.userId) {
    const merchant = await getMerchantContext(params.userId)
    to = to || merchant.merchantEmail
    merchantName = merchant.merchantName
  }

  if (!to) return

  await sendOperationalEmail({
    to,
    subject: 'Your FGShip account is active',
    eyebrow: 'Account Activation',
    title: 'Account activated',
    intro: `Hello ${escapeHtml(merchantName)}, your FGShip account is now active and ready to use.`,
    rows: [
      { label: 'Account email', value: escapeHtml(to) },
      { label: 'Activated at', value: formatDateTime(new Date()) },
      { label: 'Dashboard', value: escapeHtml(resolveDashboardUrl()) },
    ],
    extraHtml: `<div style="margin-top:18px;">${renderEmailButton(
      'Go to dashboard',
      resolveDashboardUrl(),
    )}</div>`,
    outro: 'You can now sign in, create shipments, manage billing, and track order activity from the dashboard.',
  })
}

const ORDER_STATUS_META: Record<
  string,
  { title: string; eyebrow: string; subjectPrefix: string }
> = {
  pickup_initiated: {
    title: 'Pickup done',
    eyebrow: 'Order Update',
    subjectPrefix: 'Pickup done',
  },
  in_transit: {
    title: 'Shipment in transit',
    eyebrow: 'Order Update',
    subjectPrefix: 'In transit',
  },
  out_for_delivery: {
    title: 'Shipment out for delivery',
    eyebrow: 'Order Update',
    subjectPrefix: 'Out for delivery',
  },
  delivered: {
    title: 'Shipment delivered',
    eyebrow: 'Order Update',
    subjectPrefix: 'Delivered',
  },
  ndr: {
    title: 'Shipment undelivered',
    eyebrow: 'Order Update',
    subjectPrefix: 'Undelivered',
  },
  undelivered: {
    title: 'Shipment undelivered',
    eyebrow: 'Order Update',
    subjectPrefix: 'Undelivered',
  },
  rto: {
    title: 'Reverse pickup update',
    eyebrow: 'Reverse Pickup',
    subjectPrefix: 'Reverse pickup',
  },
  rto_in_transit: {
    title: 'Reverse pickup in transit',
    eyebrow: 'Reverse Pickup',
    subjectPrefix: 'Reverse pickup',
  },
  rto_delivered: {
    title: 'Reverse pickup completed',
    eyebrow: 'Reverse Pickup',
    subjectPrefix: 'Reverse pickup',
  },
}

export const sendOrderStatusUpdateEmail = async (params: {
  order: any
  nextStatus: string
  previousStatus?: string | null
  rawStatus?: string | null
  location?: string | null
  remarks?: string | null
  source?: string | null
}) => {
  const nextStatus = compactText(params.nextStatus, '').toLowerCase()
  const meta = ORDER_STATUS_META[nextStatus]
  const userId = compactText(params.order?.user_id || params.order?.userId, '')
  if (!meta || !userId) return

  const merchant = await getMerchantContext(userId)
  if (!merchant.merchantEmail) return

  const addressParts = [
    params.order?.address,
    params.order?.city,
    params.order?.state,
    params.order?.pincode,
  ]
    .map((value) => compactText(value, ''))
    .filter(Boolean)
    .join(', ')

  await sendOperationalEmail({
    to: merchant.merchantEmail,
    subject: `${meta.subjectPrefix} - ${compactText(params.order?.order_number, 'Order update')}`,
    eyebrow: meta.eyebrow,
    title: meta.title,
    intro: `Hello ${escapeHtml(merchant.merchantName)}, order ${escapeHtml(
      compactText(params.order?.order_number),
    )} has a new shipment update.`,
    rows: [
      { label: 'Order number', value: escapeHtml(compactText(params.order?.order_number)) },
      { label: 'AWB number', value: escapeHtml(compactText(params.order?.awb_number)) },
      {
        label: 'Courier partner',
        value: escapeHtml(
          compactText(params.order?.courier_partner || params.order?.integration_type || 'Courier'),
        ),
      },
      { label: 'Previous status', value: escapeHtml(toStatusLabel(compactText(params.previousStatus, 'N/A'))) },
      { label: 'Current status', value: escapeHtml(toStatusLabel(nextStatus)) },
      { label: 'Raw courier status', value: escapeHtml(compactText(params.rawStatus)) },
      { label: 'Location', value: escapeHtml(compactText(params.location)) },
      { label: 'Remarks', value: escapeHtml(compactText(params.remarks || params.order?.delivery_message)) },
      {
        label: 'Order type',
        value: escapeHtml(compactText(params.order?.order_type || params.order?.source_type || 'N/A')),
      },
      { label: 'Order value', value: formatCurrency(params.order?.order_amount || 0) },
      {
        label: 'Freight charges',
        value: formatCurrency(
          params.order?.freight_charges ?? params.order?.shipping_charges ?? 0,
        ),
      },
      { label: 'Buyer name', value: escapeHtml(compactText(params.order?.buyer_name)) },
      { label: 'Buyer phone', value: escapeHtml(compactText(params.order?.buyer_phone)) },
      { label: 'Buyer email', value: escapeHtml(compactText(params.order?.buyer_email)) },
      { label: 'Delivery address', value: escapeHtml(compactText(addressParts)) },
      { label: 'Source', value: escapeHtml(compactText(params.source)) },
      { label: 'Updated at', value: formatDateTime(new Date()) },
    ],
  })
}

const getOrderForRemittance = async (orderType: string, orderId: string) => {
  if (orderType === 'b2b') {
    const [order] = await db.select().from(b2b_orders).where(eq(b2b_orders.id, orderId)).limit(1)
    return order || null
  }
  const [order] = await db.select().from(b2c_orders).where(eq(b2c_orders.id, orderId)).limit(1)
  return order || null
}

const buildCodRemittanceWorkbook = (remittance: any, order: any, merchantEmail: string, merchantName: string) => {
  const row = {
    order_number: compactText(remittance.orderNumber),
    awb_number: compactText(remittance.awbNumber),
    order_type: compactText(remittance.orderType),
    courier_partner: compactText(remittance.courierPartner),
    cod_amount: Number(remittance.codAmount || 0),
    cod_charges: Number(remittance.codCharges || 0),
    freight_charges: Number(remittance.shippingCharges || 0),
    total_deductions: Number(remittance.deductions || 0),
    remittable_amount: Number(remittance.remittableAmount || 0),
    status: compactText(remittance.status),
    collected_at: formatDateTime(remittance.collectedAt),
    credited_at: formatDateTime(remittance.creditedAt),
    notes: compactText(remittance.notes),
    merchant_name: merchantName,
    merchant_email: merchantEmail,
    buyer_name: compactText(order?.buyer_name),
    buyer_phone: compactText(order?.buyer_phone),
    buyer_email: compactText(order?.buyer_email),
    delivery_address: compactText(order?.address),
    delivery_city: compactText(order?.city),
    delivery_state: compactText(order?.state),
    delivery_pincode: compactText(order?.pincode),
    order_amount: Number(order?.order_amount || 0),
    payment_type: compactText(order?.order_type),
  }

  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet([row])
  XLSX.utils.book_append_sheet(workbook, worksheet, 'COD Remittance')
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer
}

export const sendCodRemittanceEventEmail = async (params: {
  remittance: any
  event: 'created' | 'settled'
}) => {
  const merchant = await getMerchantContext(params.remittance.userId)
  if (!merchant.merchantEmail) return

  const order = await getOrderForRemittance(params.remittance.orderType, params.remittance.orderId)
  const workbookBuffer = buildCodRemittanceWorkbook(
    params.remittance,
    order,
    merchant.merchantEmail,
    merchant.merchantName,
  )
  const attachments: AttachmentInput[] = [
    {
      buffer: workbookBuffer,
      filename: `cod-remittance-${compactText(params.remittance.orderNumber, 'order')}.xlsx`,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  ]

  const title =
    params.event === 'created' ? 'COD remittance recorded' : 'COD remittance settled'
  await sendOperationalEmail({
    to: merchant.merchantEmail,
    subject: `${title} - ${compactText(params.remittance.orderNumber)}`,
    eyebrow: 'COD Remittance',
    title,
    intro: `Hello ${escapeHtml(merchant.merchantName)}, the COD remittance event below has been recorded on your account.`,
    rows: [
      { label: 'Order number', value: escapeHtml(compactText(params.remittance.orderNumber)) },
      { label: 'AWB number', value: escapeHtml(compactText(params.remittance.awbNumber)) },
      {
        label: 'Courier partner',
        value: escapeHtml(compactText(params.remittance.courierPartner)),
      },
      { label: 'Status', value: escapeHtml(compactText(params.remittance.status)) },
      { label: 'COD amount', value: formatCurrency(params.remittance.codAmount) },
      { label: 'COD charges', value: formatCurrency(params.remittance.codCharges) },
      { label: 'Freight charges', value: formatCurrency(params.remittance.shippingCharges) },
      { label: 'Total deductions', value: formatCurrency(params.remittance.deductions) },
      { label: 'Net remittable amount', value: formatCurrency(params.remittance.remittableAmount) },
      { label: 'Collected at', value: formatDateTime(params.remittance.collectedAt) },
      { label: 'Credited at', value: formatDateTime(params.remittance.creditedAt) },
      { label: 'Notes', value: escapeHtml(compactText(params.remittance.notes)) },
    ],
    extraHtml:
      '<p style="margin-top:18px;">An Excel attachment with full order and remittance details is included with this email.</p>',
    attachments,
  })
}

export const sendTaxInvoiceGeneratedEmail = async (params: {
  order: any
  invoiceNumber: string
  invoiceDate: string
  invoiceAmount: number
  invoiceKey: string
}) => {
  const merchant = await getMerchantContext(params.order.user_id)
  if (!merchant.merchantEmail || !params.invoiceKey) return

  let pdfUrl: string | undefined
  try {
    const signed = await presignDownload(params.invoiceKey)
    pdfUrl = Array.isArray(signed) ? signed[0] || undefined : signed || undefined
  } catch (error: any) {
    console.error('Failed to presign order invoice for email:', error?.message || error)
  }

  await sendOperationalEmail({
    to: merchant.merchantEmail,
    subject: `Tax invoice ready - ${params.invoiceNumber}`,
    eyebrow: 'Tax Invoice',
    title: 'Tax invoice ready',
    intro: `Hello ${escapeHtml(merchant.merchantName)}, your order tax invoice is ready.`,
    rows: [
      { label: 'Invoice number', value: escapeHtml(params.invoiceNumber) },
      { label: 'Invoice date', value: escapeHtml(params.invoiceDate) },
      { label: 'Invoice amount', value: formatCurrency(params.invoiceAmount) },
      { label: 'Order number', value: escapeHtml(compactText(params.order.order_number)) },
      { label: 'AWB number', value: escapeHtml(compactText(params.order.awb_number)) },
      {
        label: 'Courier partner',
        value: escapeHtml(compactText(params.order.courier_partner || params.order.integration_type)),
      },
      { label: 'Buyer name', value: escapeHtml(compactText(params.order.buyer_name)) },
      { label: 'Buyer email', value: escapeHtml(compactText(params.order.buyer_email)) },
    ],
    extraHtml: pdfUrl
      ? `<div style="margin-top:18px;">${renderEmailButton('Download tax invoice', pdfUrl)}</div>`
      : '',
    outro: 'Use this invoice for shipment records and tax documentation.',
  })
}

export const sendReversePickupCreatedEmail = async (params: {
  order: any
  originalOrderId: string
  reverseCharge: number
}) => {
  const userId = compactText(params.order?.user_id || params.order?.userId, '')
  if (!userId) return

  const merchant = await getMerchantContext(userId)
  if (!merchant.merchantEmail) return

  await sendOperationalEmail({
    to: merchant.merchantEmail,
    subject: `Reverse pickup created - ${compactText(params.order?.order_number)}`,
    eyebrow: 'Reverse Pickup',
    title: 'Reverse pickup created',
    intro: `Hello ${escapeHtml(merchant.merchantName)}, a reverse pickup has been created successfully.`,
    rows: [
      { label: 'Reverse order number', value: escapeHtml(compactText(params.order?.order_number)) },
      { label: 'AWB number', value: escapeHtml(compactText(params.order?.awb_number)) },
      { label: 'Original order ID', value: escapeHtml(compactText(params.originalOrderId)) },
      {
        label: 'Courier partner',
        value: escapeHtml(compactText(params.order?.courier_partner || params.order?.integration_type)),
      },
      { label: 'Reverse charge', value: formatCurrency(params.reverseCharge) },
      { label: 'Status', value: escapeHtml(toStatusLabel(compactText(params.order?.order_status || 'booked'))) },
      { label: 'Created at', value: formatDateTime(new Date()) },
    ],
  })
}
