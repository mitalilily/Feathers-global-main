import axios from 'axios'
import { and, count, eq, ilike } from 'drizzle-orm'
import { db } from '../client'
import { locations } from '../schema/locations'

type PincodeDirectoryResponse = {
  district?: string
  state?: string
}

const INDIAN_PINCODE_REGEX = /^[1-9][0-9]{5}$/
const PINCODE_DIRECTORY_BASE_URL = 'https://aniket-thapa.github.io/india-pincode-api/pincodes'

const toDisplayName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase())

const lookupPincodeDirectory = async (pincode: string) => {
  try {
    const { data } = await axios.get<PincodeDirectoryResponse>(
      `${PINCODE_DIRECTORY_BASE_URL}/${pincode}.json`,
      { timeout: 6000 },
    )

    if (!data?.district || !data?.state) {
      return null
    }

    return {
      id: `directory-${pincode}`,
      pincode,
      city: toDisplayName(data.district),
      state: toDisplayName(data.state),
      country: 'India',
      tags: [],
      created_at: new Date(),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[locations] Pincode directory fallback failed', { pincode, message })
    return null
  }
}

export const LocationService = {
  create: async (data: { pincode: string; city: string; state: string; country?: string }) => {
    // Check if a location with the same pincode and city already exists
    const existing = await db
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.pincode, data.pincode),
          eq(locations.city, data.city),
          eq(locations.state, data.state),
          eq(locations.country, data?.country ?? 'India'),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      throw new Error(`Location with pincode ${data.pincode} and city ${data.city} already exists`)
    }

    // Insert new location
    const [location] = await db
      .insert(locations)
      .values({
        ...data,
        country: data.country || 'India',
      })
      .returning()

    return location
  },

  list: async (params: {
    page?: number
    limit?: number
    filters?: { pincode?: string; city?: string; state?: string }
    fallbackToPostalApi?: boolean
  }) => {
    const page = params.page ?? 1
    const limit = params.limit ?? 20
    const offset = (page - 1) * limit

    const conditions = []
    if (params.filters) {
      const { pincode, city, state } = params.filters
      const normalizedPincode = String(pincode || '').trim()
      if (normalizedPincode) {
        conditions.push(
          /^\d{6}$/.test(normalizedPincode)
            ? eq(locations.pincode, normalizedPincode)
            : ilike(locations.pincode, `%${normalizedPincode}%`),
        )
      }
      if (city) conditions.push(ilike(locations.city, `%${city}%`))
      if (state) conditions.push(ilike(locations.state, `%${state}%`))
    }

    const whereCondition = conditions.length ? and(...conditions) : undefined

    const data = await db
      .select()
      .from(locations)
      .where(whereCondition)
      .limit(limit)
      .offset(offset)

    const totalRes = await db.select({ count: count() }).from(locations).where(whereCondition)

    const total = Number(totalRes[0]?.count ?? 0)

    const exactPincode = String(params.filters?.pincode || '').trim()
    const shouldUseDirectoryFallback =
      params.fallbackToPostalApi !== false &&
      data.length === 0 &&
      page === 1 &&
      limit > 0 &&
      !params.filters?.city &&
      !params.filters?.state &&
      INDIAN_PINCODE_REGEX.test(exactPincode)

    if (shouldUseDirectoryFallback) {
      const directoryLocation = await lookupPincodeDirectory(exactPincode)

      if (directoryLocation) {
        return { data: [directoryLocation], total: 1, page, limit }
      }
    }

    return { data, total, page, limit }
  },

  getById: async (id: string) => {
    const [location] = await db.select().from(locations).where(eq(locations.id, id))
    return location
  },

  update: async (
    id: string,
    data: { pincode?: string; city?: string; state?: string; country?: string },
  ) => {
    const updated = await db.update(locations).set(data).where(eq(locations.id, id)).returning()
    return updated[0]
  },

  delete: async (id: string) => {
    const deleted = await db.delete(locations).where(eq(locations.id, id)).returning()
    return deleted[0]
  },
}
