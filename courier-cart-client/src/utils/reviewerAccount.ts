const SHOPIFY_REVIEW_ACCOUNT_EMAILS = new Set([
  'neeir18877@gmail.com',
  ...String(import.meta.env.VITE_SHOPIFY_REVIEW_ACCOUNT_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
])

export const isShopifyReviewerAccount = (...emails: Array<string | null | undefined>) =>
  emails.some((email) =>
    SHOPIFY_REVIEW_ACCOUNT_EMAILS.has(String(email || '').trim().toLowerCase()),
  )
