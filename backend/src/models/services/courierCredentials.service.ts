import { eq } from 'drizzle-orm'
import { db } from '../client'
import { courierCredentials } from '../schema/courierCredentials'

export type BusinessType = 'b2b' | 'b2c'
export type ServiceProviderId = 'delhivery' | 'shipway' | 'xpressbees' | 'ekart' | 'shadowfax'

export type DelhiveryConfig = {
  apiKey?: string
  clientName?: string
  ltlToken?: string
  ltlUsername?: string
  ltlEmail?: string
  ltlPassword?: string
}

export type XpressbeesConfig = {
  apiBase?: string
  apiToken?: string
  authBearer?: string
  email?: string
  password?: string
  secretKey?: string
  xbKey?: string
  xbAccessKey?: string
  businessUnit?: string
  businessFlow?: string
  businessService?: string
  businessServices?: string
  businessAccountName?: string
  pickupVendorCode?: string
  manifestServiceType?: string
  manifestPickupType?: string
  pincodeBusinessUnit?: string
  pincodeBusinessFlow?: string
  pickupBusinessService?: string
  deliveryBusinessService?: string
  serviceabilityVersion?: string
  trackingVersion?: string
}

export type EkartConfig = {
  clientId?: string
  username?: string
  password?: string
  baseApi?: string
  baseAuth?: string
}

export type SmartshipConfig = {
  username?: string
  password?: string
  clientId?: string
  clientSecret?: string
}

export type NimbuspostConfig = {
  email?: string
  password?: string
}

export type ShipwayConfig = {
  username?: string
  password?: string
}

export type ShadowfaxConfig = {
  apiBase?: string
  apiToken?: string
  clientName?: string
  webhookSecret?: string
}

export type CourierConfig =
  | DelhiveryConfig
  | SmartshipConfig
  | NimbuspostConfig
  | ShipwayConfig
  | XpressbeesConfig
  | EkartConfig
  | ShadowfaxConfig

export interface CourierCredentialsUpsertPayload {
  serviceProvider: ServiceProviderId
  b2c?: {
    config?: CourierConfig | null
    sameAsB2b?: boolean
  }
  b2b?: {
    config?: CourierConfig | null
    sameAsB2c?: boolean
  }
}

export interface CourierCredentialsMeta {
  serviceProvider: ServiceProviderId
  b2c: {
    configured: boolean
    sameAsB2b: boolean
    usingEnvFallback: boolean
  }
  b2b: {
    configured: boolean
    sameAsB2c: boolean
    usingEnvFallback: boolean
  }
}

const KNOWN_PROVIDERS: ServiceProviderId[] = [
  'delhivery',
  'shipway',
  'xpressbees',
  'ekart',
  'shadowfax',
]

const hasEnvForProviderAndType = (provider: ServiceProviderId, _type: BusinessType): boolean => {
  if (provider === 'delhivery') {
    return !!(process.env.DELHIVERY_API_KEY || process.env.DELHIVERY_CLIENT_NAME)
  }
  if (provider === 'shipway') {
    return !!(process.env.SHIPWAY_USERNAME || process.env.SHIPWAY_PASSWORD)
  }
  if (provider === 'xpressbees') {
    return !!(
      process.env.XPRESSBEES_API_TOKEN ||
      process.env.XPRESSBEES_XB_KEY ||
      (process.env.XPRESSBEES_USERNAME && process.env.XPRESSBEES_PASSWORD)
    )
  }
  if (provider === 'ekart') {
    return !!(
      process.env.EKART_CLIENT_ID ||
      process.env.EKART_USERNAME ||
      process.env.EKART_PASSWORD ||
      process.env.EKART_BASE_API ||
      process.env.EKART_BASE_AUTH
    )
  }
  if (provider === 'shadowfax') {
    return !!(
      process.env.SHADOWFAX_API_TOKEN ||
      process.env.SHADOWFAX_API_KEY ||
      process.env.SHADOWFAX_API_BASE
    )
  }
  return false
}

const normalize = (val?: string | null) => String(val || '').trim()

export const hasUsableXpressbeesCredentials = (config?: XpressbeesConfig | null): boolean => {
  if (!config) {
    return hasEnvForProviderAndType('xpressbees', 'b2c')
  }

  const hasBearerToken =
    Boolean(normalize(config.apiToken)) || Boolean(normalize(config.authBearer))
  const hasLoginCredentials =
    Boolean(normalize(config.email)) && Boolean(normalize(config.password))
  const hasAwbCredentials =
    Boolean(normalize(config.xbKey)) || Boolean(normalize(config.xbAccessKey))

  return hasBearerToken || hasLoginCredentials || hasAwbCredentials
}

const buildConfigFromRow = (provider: ServiceProviderId, row: typeof courierCredentials.$inferSelect) => {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}

  if (provider === 'ekart') {
    const cfg: EkartConfig = {
      clientId: normalize(row.clientId),
      username: normalize(row.username),
      password: normalize(row.password),
      baseApi: normalize(row.apiBase),
    }
    return cfg
  }

  if (provider === 'delhivery') {
    const cfg: DelhiveryConfig = {
      apiKey: normalize(row.apiKey),
      clientName: normalize(row.clientName),
    }
    return cfg
  }

  if (provider === 'shipway') {
    const cfg: ShipwayConfig = {
      username: normalize(row.username),
      password: normalize(row.password),
    }
    return cfg
  }

  if (provider === 'shadowfax') {
    const cfg: ShadowfaxConfig = {
      apiBase: normalize(row.apiBase),
      apiToken: normalize(row.apiKey),
      clientName: normalize(row.clientName),
      webhookSecret: normalize(row.webhookSecret),
    }
    return cfg
  }

  const cfg: XpressbeesConfig = {
    apiBase: normalize(row.apiBase),
    apiToken: normalize(row.apiKey),
    authBearer: normalize(
      (metadata.authBearer as string) ||
        (metadata.auth_bearer as string) ||
        (metadata.authorizationBearer as string) ||
        '',
    ),
    email: normalize(row.username),
    password: normalize(row.password),
    secretKey: normalize(
      (metadata.secretKey as string) ||
        (metadata.secret_key as string) ||
        (metadata.xpressbeesSecretKey as string) ||
        '',
    ),
    xbKey: normalize(
      (metadata.xbKey as string) ||
        (metadata.xb_key as string) ||
        (metadata.xpressbeesXbKey as string) ||
        '',
    ),
    xbAccessKey: normalize(
      (metadata.xbAccessKey as string) ||
        (metadata.xb_access_key as string) ||
        (metadata.xpressbeesXbAccessKey as string) ||
        '',
    ),
    businessUnit: normalize((metadata.businessUnit as string) || ''),
    businessFlow: normalize((metadata.businessFlow as string) || ''),
    businessService: normalize((metadata.businessService as string) || ''),
    businessServices: normalize((metadata.businessServices as string) || ''),
    businessAccountName: normalize(
      (metadata.businessAccountName as string) ||
        (metadata.business_account_name as string) ||
        (metadata.xpressbeesBusinessAccountName as string) ||
        '',
    ),
    pickupVendorCode: normalize(
      (metadata.pickupVendorCode as string) ||
        (metadata.pickup_vendor_code as string) ||
        (metadata.xpressbeesPickupVendorCode as string) ||
        '',
    ),
    manifestServiceType: normalize((metadata.manifestServiceType as string) || ''),
    manifestPickupType: normalize((metadata.manifestPickupType as string) || ''),
    pincodeBusinessUnit: normalize((metadata.pincodeBusinessUnit as string) || ''),
    pincodeBusinessFlow: normalize((metadata.pincodeBusinessFlow as string) || ''),
    pickupBusinessService: normalize((metadata.pickupBusinessService as string) || ''),
    deliveryBusinessService: normalize((metadata.deliveryBusinessService as string) || ''),
    serviceabilityVersion: normalize((metadata.serviceabilityVersion as string) || ''),
    trackingVersion: normalize((metadata.trackingVersion as string) || ''),
  }
  return cfg
}

export const getEffectiveCourierConfig = async <T extends CourierConfig>(
  provider: ServiceProviderId,
  _type: BusinessType,
): Promise<T | null> => {
  let row
  try {
    ;[row] = await db.select().from(courierCredentials).where(eq(courierCredentials.provider, provider))
  } catch (err: any) {
    if (err?.message?.includes('does not exist') || err?.message?.includes('relation') || err?.code === '42P01') {
      console.warn('[getEffectiveCourierConfig] courier_credentials table does not exist, using env fallback', provider)
      return null
    }
    throw err
  }

  if (!row) return null
  return buildConfigFromRow(provider, row) as T
}

export const upsertCourierCredentials = async (
  payload: CourierCredentialsUpsertPayload,
): Promise<void> => {
  const { serviceProvider, b2c, b2b } = payload
  const mergedConfig = (b2c?.config ?? b2b?.config ?? null) as Record<string, any> | null

  const values: Partial<typeof courierCredentials.$inferInsert> = {
    provider: serviceProvider,
    apiBase: normalize((mergedConfig?.baseApi as string) || (mergedConfig?.apiBase as string) || ''),
    clientName: normalize((mergedConfig?.clientName as string) || ''),
    apiKey: normalize((mergedConfig?.apiKey as string) || (mergedConfig?.apiToken as string) || ''),
    clientId: normalize((mergedConfig?.clientId as string) || ''),
    username: normalize((mergedConfig?.username as string) || (mergedConfig?.email as string) || ''),
    password: normalize((mergedConfig?.password as string) || ''),
    webhookSecret: normalize((mergedConfig?.webhookSecret as string) || ''),
    updatedAt: new Date(),
  }

  await db
    .insert(courierCredentials)
    .values(values as any)
    .onConflictDoUpdate({
      target: courierCredentials.provider,
      set: {
        ...values,
        updatedAt: new Date(),
      } as any,
    })
}

export const listCourierCredentialsMeta = async (): Promise<CourierCredentialsMeta[]> => {
  let rows: (typeof courierCredentials.$inferSelect)[] = []
  try {
    rows = await db.select().from(courierCredentials)
  } catch (err: any) {
    if (err?.message?.includes('does not exist') || err?.message?.includes('relation') || err?.code === '42P01') {
      return KNOWN_PROVIDERS.map((provider) => ({
        serviceProvider: provider,
        b2c: { configured: false, sameAsB2b: false, usingEnvFallback: hasEnvForProviderAndType(provider, 'b2c') },
        b2b: { configured: false, sameAsB2c: false, usingEnvFallback: hasEnvForProviderAndType(provider, 'b2b') },
      }))
    }
    throw err
  }

  const byProvider = new Map<string, (typeof rows)[number]>()
  for (const row of rows) byProvider.set(row.provider, row)

  return KNOWN_PROVIDERS.map((provider) => {
    const row = byProvider.get(provider)
    const configured = !!row && [row.apiBase, row.clientName, row.apiKey, row.clientId, row.username, row.password].some((v) => normalize(v).length > 0)

    return {
      serviceProvider: provider,
      b2c: {
        configured,
        sameAsB2b: false,
        usingEnvFallback: !configured && hasEnvForProviderAndType(provider, 'b2c'),
      },
      b2b: {
        configured,
        sameAsB2c: false,
        usingEnvFallback: !configured && hasEnvForProviderAndType(provider, 'b2b'),
      },
    }
  })
}
