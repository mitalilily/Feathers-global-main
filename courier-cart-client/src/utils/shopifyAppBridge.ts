const SHOPIFY_CLIENT_IDS = new Set([
  'a64a918b0ecfc48d7f2402def3b8c92a',
  '2d51ab15c8b649b6cfe0cafc9592ee69',
])

declare global {
  interface Window {
    shopify?: {
      idToken: () => Promise<string>
    }
  }
}

const waitForAppBridge = async () => {
  const deadline = Date.now() + 10000
  while (!window.shopify?.idToken && Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, 50))
  }
  if (!window.shopify?.idToken) throw new Error('Shopify App Bridge did not initialize')
  return window.shopify
}

const removeLegacyIdTokenFromUrl = () => {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('id_token')) return

  url.searchParams.delete('id_token')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

export const getShopifyIdToken = async () => {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="shopify-api-key"]')
  if (!meta?.content || !SHOPIFY_CLIENT_IDS.has(meta.content)) {
    throw new Error('Shopify App Bridge is configured for the wrong app')
  }

  removeLegacyIdTokenFromUrl()
  const shopify = await waitForAppBridge()
  return shopify.idToken()
}
