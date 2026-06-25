const DEFAULT_BOOTSTRAP_ADMIN_EMAIL = 'admin@feathergsglobal.com'
const DEFAULT_BOOTSTRAP_ADMIN_ALIASES = [
  DEFAULT_BOOTSTRAP_ADMIN_EMAIL,
  'admin@feathersglobal.com',
  'admin@shiplifi.com',
  'admin@shiplifi.local',
]
const DEFAULT_BOOTSTRAP_ADMIN_PHONE = '+916283315911'
const DEFAULT_BOOTSTRAP_ADMIN_PASSWORD = 'Admin@12345!'

const splitEnvList = (value?: string) =>
  (value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

export const getBootstrapAdminEmail = () =>
  (process.env.BOOTSTRAP_ADMIN_EMAIL || process.env.ADMIN_EMAIL || DEFAULT_BOOTSTRAP_ADMIN_EMAIL)
    .trim()
    .toLowerCase()

export const getBootstrapAdminEmails = () =>
  Array.from(
    new Set([
      getBootstrapAdminEmail(),
      ...splitEnvList(process.env.BOOTSTRAP_ADMIN_EMAIL_ALIASES),
      ...DEFAULT_BOOTSTRAP_ADMIN_ALIASES,
    ]),
  )

export const getBootstrapAdminPhone = () =>
  (process.env.BOOTSTRAP_ADMIN_PHONE || DEFAULT_BOOTSTRAP_ADMIN_PHONE).trim()

export const getBootstrapAdminPassword = () =>
  process.env.BOOTSTRAP_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || DEFAULT_BOOTSTRAP_ADMIN_PASSWORD

