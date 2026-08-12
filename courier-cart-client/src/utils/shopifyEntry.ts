import {
  getSessionStorageItem,
  setSessionStorageItem,
} from './safeSessionStorage'

const PUBLIC_SHOPIFY_ENTRY_KEY = 'fg_public_shopify_app'
let publicShopifyEntry = false

const persistPublicShopifyEntry = () => {
  setSessionStorageItem(PUBLIC_SHOPIFY_ENTRY_KEY, '1')
}

const readPersistedPublicShopifyEntry = () =>
  getSessionStorageItem(PUBLIC_SHOPIFY_ENTRY_KEY) === '1'

export const isPublicShopifyAppEntry = () => {
  const isDedicatedEntry =
    document.querySelector<HTMLMetaElement>('meta[name="feather-shopify-app"]')?.content === 'public'
  const isMarkedEntry = document.documentElement.dataset.shopifyApp === 'public'

  if (isDedicatedEntry || isMarkedEntry) {
    publicShopifyEntry = true
    persistPublicShopifyEntry()
    return true
  }

  return publicShopifyEntry || readPersistedPublicShopifyEntry()
}
