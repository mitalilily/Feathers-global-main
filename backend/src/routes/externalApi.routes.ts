import { Router } from 'express'
import {
  createApiKeyController,
  deleteApiKeyController,
  listApiKeysController,
  updateApiKeyController,
} from '../controllers/externalApi/apiKey.controller'
import { generateManifestController } from '../controllers/externalApi/manifest.controller'
import {
  cancelAmazonShipmentController,
  getAmazonAdditionalInputsController,
  getAmazonAccessPointsController,
  getAmazonShipmentDocumentsController,
  getAmazonShippingTrackingController,
  getAmazonShippingRatesController,
  oneClickAmazonShipmentController,
  purchaseAmazonShipmentController,
  submitAmazonNdrFeedbackController,
} from '../controllers/amazonShipping.controller'
import { ekartWebhookHandler } from '../controllers/webhooks/ekart.webhook'
import {
  getNdrEventsController,
  getNdrTimelineController,
  getDelhiveryUplStatusController,
} from '../controllers/externalApi/ndr.controller'
import {
  cancelOrderController,
  createOrderController,
  escalateOrderController,
  getOrderController,
  getOrderLabelController,
  getOrderPodController,
  getOrdersController,
  generateOrderQrController,
  retryFailedManifestController,
  trackOrderController,
  updateEkartDispatchDateController,
  updateEkartEwbnController,
  updateOrderProviderController,
} from '../controllers/externalApi/order.controller'
import {
  checkEkartPairServiceabilityController,
  getEkartBulkServiceabilityController,
  checkEkartPincodeServiceabilityController,
  downloadEkartLabelsController,
  generateEkartManifestController,
  getEkartRawTrackController,
  getEkartShippingRatesController,
  listEkartAddressesController,
  submitEkartNdrActionController,
  registerEkartAddressController,
} from '../controllers/externalApi/ekart.controller'
import {
  getDelhiveryLabelController,
  updateDelhiveryEwaybillController,
} from '../controllers/externalApi/delhivery.controller'
import {
  createPickupAddressController,
  getPickupAddressesController,
  updatePickupAddressController,
  requestPickupController,
} from '../controllers/externalApi/pickup.controller'
import {
  createReturnOrderController,
  getReturnQuoteController,
} from '../controllers/externalApi/returns.controller'
import { getRtoEventsController } from '../controllers/externalApi/rto.controller'
import { checkServiceabilityController } from '../controllers/externalApi/serviceability.controller'
import { getShippingRatesController } from '../controllers/externalApi/shipping.controller'
import {
  createWebhookController,
  deleteWebhookController,
  getWebhookController,
  listWebhooksController,
  regenerateWebhookSecretController,
  updateWebhookController,
} from '../controllers/externalApi/webhook.controller'
import { requireApiKey } from '../middlewares/requireApiKey'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()

// ============================================================================
// API KEY MANAGEMENT (Requires User Auth - Frontend Dashboard)
// ============================================================================
router.post('/api-keys', requireAuth, createApiKeyController)
router.get('/api-keys', requireAuth, listApiKeysController)
router.put('/api-keys/:id', requireAuth, updateApiKeyController)
router.delete('/api-keys/:id', requireAuth, deleteApiKeyController)

// ============================================================================
// WEBHOOK MANAGEMENT (Requires User Auth - Frontend Dashboard)
// ============================================================================
router.post('/webhooks', requireAuth, createWebhookController)
router.get('/webhooks', requireAuth, listWebhooksController)
router.get('/webhooks/:id', requireAuth, getWebhookController)
router.put('/webhooks/:id', requireAuth, updateWebhookController)
router.delete('/webhooks/:id', requireAuth, deleteWebhookController)
router.post('/webhooks/:id/regenerate-secret', requireAuth, regenerateWebhookSecretController)

// Provider webhook (Ekart) for partners who want to post directly
router.post('/webhook/ekart/track', ekartWebhookHandler)

// ============================================================================
// SHIPPING & SERVICEABILITY (Requires API Key)
// ============================================================================
// Check pincode serviceability and get available couriers
router.get('/serviceability', requireApiKey, checkServiceabilityController)
router.post('/serviceability', requireApiKey, checkServiceabilityController)
router.post('/ekart/pricing/estimate', requireApiKey, getEkartShippingRatesController)
router.post('/ekart/serviceability', requireApiKey, checkEkartPairServiceabilityController)
router.get('/ekart/serviceability/bulk/:type', requireApiKey, getEkartBulkServiceabilityController)
router.get('/ekart/serviceability/:pincode', requireApiKey, checkEkartPincodeServiceabilityController)
router.get('/ekart/track/:wbn', requireApiKey, getEkartRawTrackController)
router.post('/ekart/package/label', requireApiKey, downloadEkartLabelsController)
router.post('/ekart/package/manifest', requireApiKey, generateEkartManifestController)
router.post('/ekart/address', requireApiKey, registerEkartAddressController)
router.get('/ekart/addresses', requireApiKey, listEkartAddressesController)
router.post('/ekart/package/ndr', requireApiKey, submitEkartNdrActionController)
router.get('/delhivery/package/label', requireApiKey, getDelhiveryLabelController)
router.put('/delhivery/package/ewaybill/:waybill', requireApiKey, updateDelhiveryEwaybillController)

// Get shipping rates (pre-order calculation)
router.post('/shipping/rates', requireApiKey, getShippingRatesController)
router.post('/amazon-shipping/rates', requireApiKey, getAmazonShippingRatesController)
router.post('/amazon-shipping/shipments', requireApiKey, purchaseAmazonShipmentController)
router.post('/amazon-shipping/one-click-shipment', requireApiKey, oneClickAmazonShipmentController)
router.get('/amazon-shipping/tracking', requireApiKey, getAmazonShippingTrackingController)
router.get('/amazon-shipping/access-points', requireApiKey, getAmazonAccessPointsController)
router.post('/amazon-shipping/ndr-feedback', requireApiKey, submitAmazonNdrFeedbackController)
router.get(
  '/amazon-shipping/additional-inputs/schema',
  requireApiKey,
  getAmazonAdditionalInputsController,
)
router.get(
  '/amazon-shipping/shipments/:shipmentId/documents',
  requireApiKey,
  getAmazonShipmentDocumentsController,
)
router.put(
  '/amazon-shipping/shipments/:shipmentId/cancel',
  requireApiKey,
  cancelAmazonShipmentController,
)

// ============================================================================
// ORDER MANAGEMENT (Requires API Key)
// ============================================================================
// Create order
router.post('/orders', requireApiKey, createOrderController)

// List orders
router.get('/orders', requireApiKey, getOrdersController)

// Track order
router.get('/orders/track', requireApiKey, trackOrderController)

// Get order details
router.get('/orders/:orderId', requireApiKey, getOrderController)

// Cancel order
router.post('/orders/:orderId/cancel', requireApiKey, cancelOrderController)
router.post('/orders/:orderId/update', requireApiKey, updateOrderProviderController)
router.post('/orders/:orderId/ekart/dispatch-date', requireApiKey, updateEkartDispatchDateController)
router.post('/orders/:orderId/ekart/ewbn', requireApiKey, updateEkartEwbnController)
router.post('/orders/:orderId/escalate', requireApiKey, escalateOrderController)
router.post('/orders/:orderId/qr', requireApiKey, generateOrderQrController)
router.get('/orders/:orderId/pod', requireApiKey, getOrderPodController)

// Retry failed manifest
router.post('/orders/:orderId/retry-manifest', requireApiKey, retryFailedManifestController)

// Get shipping label
router.get('/orders/:orderId/label', requireApiKey, getOrderLabelController)

// ============================================================================
// MANIFEST MANAGEMENT (Requires API Key)
// ============================================================================
router.post('/manifest', requireApiKey, generateManifestController)

// ============================================================================
// PICKUP MANAGEMENT (Requires API Key)
// ============================================================================
router.post('/pickup-addresses', requireApiKey, createPickupAddressController)
router.get('/pickup-addresses', requireApiKey, getPickupAddressesController)
router.put('/pickup-addresses/:id', requireApiKey, updatePickupAddressController)
router.post('/pickup-addresses/request-pickup', requireApiKey, requestPickupController)

// ============================================================================
// NDR MANAGEMENT (Requires API Key)
// ============================================================================
router.get('/ndr', requireApiKey, getNdrEventsController)
router.get('/ndr/timeline', requireApiKey, getNdrTimelineController)
router.get('/ndr/delhivery/upl-status', requireApiKey, getDelhiveryUplStatusController)

// ============================================================================
// RTO MANAGEMENT (Requires API Key)
// ============================================================================
router.get('/rto', requireApiKey, getRtoEventsController)

// ============================================================================
// RETURN ORDERS (Requires API Key)
// ============================================================================
router.post('/returns', requireApiKey, createReturnOrderController)
router.get('/returns/quote', requireApiKey, getReturnQuoteController)

export default router
