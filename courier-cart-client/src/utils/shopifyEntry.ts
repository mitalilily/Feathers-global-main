const PUBLIC_SHOPIFY_ENTRY_KEY = 'fg_public_shopify_app'

export const isPublicShopifyAppEntry = () => {
  const isDedicatedEntry =
    document.querySelector<HTMLMetaElement>('meta[name="feather-shopify-app"]')?.content === 'public'
  const isMarkedEntry = document.documentElement.dataset.shopifyApp === 'public'

  if (isDedicatedEntry || isMarkedEntry) {
    window.sessionStorage.setItem(PUBLIC_SHOPIFY_ENTRY_KEY, '1')
    return true
  }

  return window.sessionStorage.getItem(PUBLIC_SHOPIFY_ENTRY_KEY) === '1'
}
