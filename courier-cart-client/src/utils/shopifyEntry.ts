export const isPublicShopifyAppEntry = () =>
  document.querySelector<HTMLMetaElement>('meta[name="feather-shopify-app"]')?.content === 'public'
