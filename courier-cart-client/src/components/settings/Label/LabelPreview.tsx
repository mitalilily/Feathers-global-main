/* eslint-disable @typescript-eslint/no-explicit-any */
import { Box, Paper, Typography } from '@mui/material'
import Barcode from 'react-barcode'
import type React from 'react'
import type { LabelPreferences } from '../../../api/labelPreference.api'

const normalize = (value: unknown) => {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value.trim() : `${value}`
}

const isEnabled = (value: unknown) => (value === undefined ? true : value === true)

const pickFirst = (...values: unknown[]) => values.map(normalize).find(Boolean) || ''

const clampText = (value: unknown, max = 25) => {
  const text = normalize(value)
  if (!text) return '-'
  return text.length > max ? `${text.slice(0, max)}...` : text
}

const toAmount = (value: unknown) => {
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const formatCurrency = (value: unknown) => `Rs. ${toAmount(value).toLocaleString('en-IN')}`

const compactAddress = (...parts: unknown[]) => parts.map(normalize).filter(Boolean)

const buildDimensions = (order: any) => {
  const dimension = pickFirst(order.dimension, order.dimensions)
  if (dimension) return dimension
  if (order.length && order.breadth && order.height) return `${order.length} x ${order.breadth} x ${order.height} cm`
  return ''
}

const buildWeight = (order: any) => {
  if (order.deadWeight) return normalize(order.deadWeight)
  if (order.weight) return `${order.weight} g`
  if (order.weightKg) return `${order.weightKg} kg`
  return ''
}

const Cell = ({ children, sx }: { children: React.ReactNode; sx?: any }) => (
  <Box sx={{ border: '1px solid #111', p: 0.55, minHeight: 34, ...sx }}>{children}</Box>
)

const TinyLabel = ({ label, value }: { label: string; value: string }) => (
  <Box>
    <Typography sx={{ fontSize: 9, fontWeight: 800, lineHeight: 1.1 }}>{label}</Typography>
    <Typography sx={{ fontSize: 9.5, fontWeight: 700, lineHeight: 1.15 }}>{value || '-'}</Typography>
  </Box>
)

type LabelPreviewProps = {
  values: any
  order: any
  preferences?: LabelPreferences
}

export function LabelPreview({ values, order, preferences }: LabelPreviewProps) {
  const charsLimit = Math.max(10, Number(values?.charLimit ?? 25))
  const maxItems = Math.max(1, Number(values?.maxItems ?? 3))
  const orderInfo = values?.orderInfo || {}
  const shipperInfo = values?.shipperInfo || {}
  const productInfo = values?.productInfo || {}

  const awbNumber = pickFirst(order.awb, order.awbNumber, order.awb_number)
  const orderId = pickFirst(order.orderId, order.order_number)
  const invoiceNumber = pickFirst(order.invoiceNumber, order.invoice_number)
  const paymentType = pickFirst(order.paymentType, order.payment_type, order.order_type).toLowerCase()
  const paymentMode = paymentType === 'cod' ? 'COD' : 'PREPAID'
  const courierName = pickFirst(order.courier, order.courier_partner, 'Courier').toUpperCase()
  const customerPhone = pickFirst(order.phone, order.buyer_phone, order.customerPhone)
  const declaredValue = pickFirst(order.declaredValue, order.orderValue, order.order_amount, order.totalAmount)
  const sortCode = pickFirst(order.sortCode, order.sort_code)
  const dimensionValue = buildDimensions(order)
  const weightValue = buildWeight(order)
  const products = Array.isArray(order.products) ? order.products.slice(0, maxItems) : []

  const showAwb = isEnabled(orderInfo.awb) && Boolean(awbNumber)
  const showOrderId = isEnabled(orderInfo.orderId) && Boolean(orderId)
  const showInvoiceNumber = isEnabled(orderInfo.invoiceNumber) && Boolean(invoiceNumber)
  const showOrderDate = isEnabled(orderInfo.orderDate) && Boolean(order.orderDate)
  const showInvoiceDate = isEnabled(orderInfo.invoiceDate) && Boolean(order.invoiceDate)
  const showOrderBarcode = isEnabled(orderInfo.orderBarcode) && Boolean(orderId)
  const showInvoiceBarcode = isEnabled(orderInfo.invoiceBarcode) && Boolean(invoiceNumber)
  const showCustomerPhone = isEnabled(orderInfo.customerPhone) && Boolean(customerPhone)
  const showRtoRoutingCode = isEnabled(orderInfo.rtoRoutingCode) && Boolean(sortCode)
  const showDeclaredValue = isEnabled(orderInfo.declaredValue) && Boolean(declaredValue)
  const showCod = isEnabled(orderInfo.cod)
  const showTerms = isEnabled(orderInfo.terms)

  const showSellerLogo = isEnabled(shipperInfo.brandLogo) && Boolean(order.shipper?.logoUrl)
  const showSellerName = isEnabled(shipperInfo.sellerBrandName) && Boolean(order.shipper?.name)
  const showShipperAddress = isEnabled(shipperInfo.shipperAddress) && Boolean(order.shipper?.address)
  const showShipperPhone = isEnabled(shipperInfo.shipperPhone) && Boolean(order.shipper?.phone)
  const showShipperGst = isEnabled(shipperInfo.gstin) && Boolean(order.shipper?.gst)
  const showReturnAddress = isEnabled(shipperInfo.rtoAddress) && Boolean(order.shipper?.rtoAddress)

  const showItemName = isEnabled(productInfo.itemName)
  const showProductCost = isEnabled(productInfo.productCost)
  const showProductQuantity = isEnabled(productInfo.productQuantity)
  const showSkuCode = isEnabled(productInfo.skuCode)
  const showDimensions = isEnabled(productInfo.dimension) && Boolean(dimensionValue)
  const showWeight = isEnabled(productInfo.deadWeight) && Boolean(weightValue)
  const showOtherCharges = isEnabled(productInfo.otherCharges) && Boolean(order.otherCharges)

  const shipToLines = compactAddress(
    order.name,
    order.address,
    showCustomerPhone ? `Phone: ${customerPhone}` : '',
  )

  const detailCells = [
    showOrderId && { label: 'ORDER ID', value: orderId },
    showInvoiceNumber && { label: 'INVOICE', value: invoiceNumber },
    showOrderDate && { label: 'ORDER DATE', value: normalize(order.orderDate) },
    showInvoiceDate && { label: 'INVOICE DATE', value: normalize(order.invoiceDate) },
    showRtoRoutingCode && { label: 'SORT CODE', value: sortCode },
    { label: 'COURIER', value: courierName },
    showCod && { label: 'PAYMENT MODE', value: paymentMode },
    { label: 'SERVICE TYPE', value: courierName },
    showWeight && { label: 'WEIGHT / PIECES', value: weightValue },
    showDimensions && { label: 'DIMENSIONS', value: dimensionValue },
    showDeclaredValue && { label: 'DECLARED VALUE', value: declaredValue },
  ].filter(Boolean) as Array<{ label: string; value: string }>

  const productColumns = [
    showItemName && { key: 'name', label: 'ITEM NAME', align: 'left' },
    showProductQuantity && { key: 'qty', label: 'QTY', align: 'center' },
    showProductCost && { key: 'price', label: 'PRICE', align: 'center' },
    showSkuCode && { key: 'sku', label: 'SKU', align: 'center' },
  ].filter(Boolean) as Array<{ key: string; label: string; align: string }>

  return (
    <Paper
      sx={{
        p: 0.75,
        border: '2px solid #111',
        borderRadius: 1,
        width: values?.printer === 'inkjet' ? '148mm' : '100mm',
        minHeight: values?.printer === 'inkjet' ? '210mm' : '150mm',
        bgcolor: '#fff',
        color: '#111',
        mx: 'auto',
        overflow: 'hidden',
      }}
      elevation={1}
    >
      <Box sx={{ border: '1px solid #111' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '58% 42%' }}>
          <Cell sx={{ minHeight: 48 }}>
            {showSellerLogo ? (
              <Box component="img" src={order.shipper.logoUrl} alt="Seller Logo" sx={{ width: 92, height: 38, objectFit: 'contain' }} />
            ) : showSellerName ? (
              <Typography sx={{ fontSize: 22, fontWeight: 900, lineHeight: 1.05 }}>{clampText(order.shipper.name, 26)}</Typography>
            ) : null}
          </Cell>
          <Cell sx={{ minHeight: 48, display: 'grid', placeItems: 'center' }}>
            <Typography sx={{ fontSize: 15, fontWeight: 900, textAlign: 'center' }}>{courierName}</Typography>
          </Cell>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '58% 42%' }}>
          <Cell sx={{ minHeight: 82 }}>
            <Typography sx={{ fontSize: 10, fontWeight: 900, mb: 0.5 }}>SHIP TO:</Typography>
            {shipToLines.map((line) => (
              <Typography key={line} sx={{ fontSize: 9, lineHeight: 1.25 }}>{clampText(line, 55)}</Typography>
            ))}
          </Cell>
          <Cell sx={{ minHeight: 82, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
            {showAwb ? (
              <Box>
                <Typography sx={{ fontSize: 22, fontWeight: 900 }}>AWB</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 900 }}>{awbNumber}</Typography>
              </Box>
            ) : (
              <Typography sx={{ fontSize: 14, fontWeight: 900 }}>{courierName}</Typography>
            )}
          </Cell>
        </Box>

        {detailCells.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {detailCells.map((item) => (
              <Cell key={`${item.label}-${item.value}`}>
                <TinyLabel label={item.label} value={clampText(item.value, 28)} />
              </Cell>
            ))}
          </Box>
        )}

        {(showAwb || (!showAwb && (showOrderBarcode || showInvoiceBarcode))) && (
          <Cell sx={{ textAlign: 'center', minHeight: 62 }}>
            {showAwb && (
              <>
                <Typography sx={{ fontSize: 14, fontWeight: 900, mb: 0.25 }}>{awbNumber}</Typography>
                <Barcode value={awbNumber} height={38} width={1.2} displayValue={false} margin={0} />
              </>
            )}
            {!showAwb && showOrderBarcode && (
              <>
                <Typography sx={{ fontSize: 12, fontWeight: 900 }}>ORDER ID: {orderId}</Typography>
                <Barcode value={orderId} height={30} width={1.1} displayValue={false} margin={0} />
              </>
            )}
            {!showAwb && showInvoiceBarcode && (
              <>
                <Typography sx={{ fontSize: 12, fontWeight: 900 }}>INVOICE: {invoiceNumber}</Typography>
                <Barcode value={invoiceNumber} height={30} width={1.1} displayValue={false} margin={0} />
              </>
            )}
          </Cell>
        )}

        {productColumns.length > 0 && (
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
            <Box component="thead">
              <Box component="tr">
                {productColumns.map((column) => (
                  <Box component="th" key={column.key} sx={{ border: '1px solid #111', p: 0.5, fontSize: 9 }}>
                    {column.label}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box component="tbody">
              {(products.length ? products : [{}]).map((product: any, index: number) => (
                <Box component="tr" key={`${product.name || 'item'}-${index}`}>
                  {productColumns.map((column) => (
                    <Box
                      component="td"
                      key={column.key}
                      sx={{ border: '1px solid #111', p: 0.5, fontSize: 9, textAlign: column.align }}
                    >
                      {column.key === 'name' && clampText(product.name || product.productName || '-', charsLimit)}
                      {column.key === 'qty' && normalize(product.qty ?? product.quantity ?? 1)}
                      {column.key === 'price' && normalize(product.price)}
                      {column.key === 'sku' && normalize(product.sku)}
                    </Box>
                  ))}
                </Box>
              ))}
              {showOtherCharges && (
                <Box component="tr">
                  <Box component="td" colSpan={Math.max(1, productColumns.length - 1)} sx={{ border: '1px solid #111', p: 0.5, fontSize: 9, fontWeight: 800 }}>
                    {productColumns.length === 1 ? `OTHER CHARGES: ${formatCurrency(order.otherCharges)}` : 'OTHER CHARGES'}
                  </Box>
                  {productColumns.length > 1 && (
                    <Box component="td" sx={{ border: '1px solid #111', p: 0.5, fontSize: 9, fontWeight: 800, textAlign: 'center' }}>
                      {formatCurrency(order.otherCharges)}
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </Box>
        )}

        <Cell sx={{ minHeight: 52 }}>
          {showSellerName && (
            <>
              <Typography sx={{ fontSize: 10, fontWeight: 900 }}>SELLER NAME:</Typography>
              <Typography sx={{ fontSize: 9, mb: 0.5 }}>{clampText(order.shipper?.name, 60)}</Typography>
            </>
          )}
          {showShipperAddress && (
            <>
              <Typography sx={{ fontSize: 10, fontWeight: 900 }}>SELLER ADDRESS:</Typography>
              <Typography sx={{ fontSize: 9, lineHeight: 1.25 }}>{clampText(order.shipper?.address, 70)}</Typography>
            </>
          )}
          {showShipperPhone && <Typography sx={{ fontSize: 9 }}>PHONE: {order.shipper?.phone}</Typography>}
          {showShipperGst && <Typography sx={{ fontSize: 9 }}>GSTIN: {order.shipper?.gst}</Typography>}
        </Cell>

        {showReturnAddress && (
          <Cell>
            <Typography sx={{ fontSize: 10, fontWeight: 900 }}>RETURN TO:</Typography>
            <Typography sx={{ fontSize: 9, lineHeight: 1.25 }}>{clampText(order.shipper?.rtoAddress, 70)}</Typography>
          </Cell>
        )}

        {showTerms && (
          <Typography sx={{ fontSize: 8, textAlign: 'center', p: 0.5 }}>
            *Terms & Conditions apply.
          </Typography>
        )}

        {preferences?.powered_by?.trim() && (
          <Typography sx={{ fontSize: 8, textAlign: 'center', p: 0.5, fontWeight: 700 }}>
            Powered by {preferences.powered_by}
          </Typography>
        )}
      </Box>
    </Paper>
  )
}
