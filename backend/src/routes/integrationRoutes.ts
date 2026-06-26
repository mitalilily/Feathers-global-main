import { Router } from "express";
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
import {
  integrateMagentoStore,
  integrateShopifyStore,
  integrateWixStore,
  integrateWooCommerceStore,
} from "../controllers/platformIntegration.controller";
import {
  connectConfiguredShopifyStoreController,
  shopifyOAuthCallbackController,
  shopifyOAuthInstallController,
  startShopifyOAuthController,
  syncShopifyOrdersController,
  testShopifyConnectionController,
  updateShopifySettingsController,
} from '../controllers/shopify.controller'
import { syncWooCommerceOrdersController } from '../controllers/woocommerce.controller'
import { requireAuth } from '../middlewares/requireAuth'
import { deleteStoreById } from "../models/services/PlatformIntegration.service";

const router = Router();

router.get('/shopify/oauth/callback', shopifyOAuthCallbackController)
router.get('/shopify/oauth/install', shopifyOAuthInstallController)

router.use(requireAuth)

router.post('/shopify/oauth/start', startShopifyOAuthController)
router.post("/shopify-auth", integrateShopifyStore);
router.get('/shopify/test-connection', testShopifyConnectionController)
router.post('/shopify/connect-env', connectConfiguredShopifyStoreController)
router.put('/shopify/settings', updateShopifySettingsController)
router.post('/shopify/settings', updateShopifySettingsController)
router.post('/shopify/sync-orders', syncShopifyOrdersController)
router.post('/amazon-shipping/rates', getAmazonShippingRatesController)
router.post('/amazon-shipping/shipments', purchaseAmazonShipmentController)
router.post('/amazon-shipping/one-click-shipment', oneClickAmazonShipmentController)
router.get('/amazon-shipping/tracking', getAmazonShippingTrackingController)
router.get('/amazon-shipping/access-points', getAmazonAccessPointsController)
router.post('/amazon-shipping/ndr-feedback', submitAmazonNdrFeedbackController)
router.get('/amazon-shipping/additional-inputs/schema', getAmazonAdditionalInputsController)
router.get('/amazon-shipping/shipments/:shipmentId/documents', getAmazonShipmentDocumentsController)
router.put('/amazon-shipping/shipments/:shipmentId/cancel', cancelAmazonShipmentController)
router.post("/woocommerce-auth", integrateWooCommerceStore);
router.post('/woocommerce/sync-orders', syncWooCommerceOrdersController)
router.post("/magento-auth", integrateMagentoStore);
router.post("/wix-auth", integrateWixStore);
router.delete("/stores/:storeId", deleteStoreById);

export default router;
