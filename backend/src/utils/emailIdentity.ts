const normalize = (value?: unknown) => String(value ?? '').trim()

export const DEFAULT_EMAIL_FROM_NAME = 'FGShip'
export const DEFAULT_EMAIL_FROM_ADDRESS = 'no-reply@fgship.in'

export const getEmailFromAddress = () => normalize(process.env.EMAIL_FROM) || DEFAULT_EMAIL_FROM_ADDRESS

export const getEmailFromName = () => normalize(process.env.EMAIL_FROM_NAME) || DEFAULT_EMAIL_FROM_NAME

export const getEmailAuthUser = () =>
  normalize(process.env.SMTP_USER) ||
  normalize(process.env.EMAIL_SMTP_USER) ||
  normalize(process.env.MAIL_USER) ||
  normalize(process.env.GOOGLE_SMTP_USER) ||
  getEmailFromAddress()

export const getEmailAuthPassword = () =>
  normalize(process.env.SMTP_PASSWORD) ||
  normalize(process.env.SMTP_PASS) ||
  normalize(process.env.EMAIL_SMTP_PASSWORD) ||
  normalize(process.env.EMAIL_SMTP_PASS) ||
  normalize(process.env.MAIL_PASSWORD) ||
  normalize(process.env.MAIL_PASS) ||
  normalize(process.env.GOOGLE_SMTP_PASSWORD)

export const formatEmailFromHeader = () => `"${getEmailFromName()}" <${getEmailFromAddress()}>`

export const getEmailEnvelopeFromAddress = () => getEmailAuthUser()
