import { and, asc, eq } from 'drizzle-orm'
import { db } from '../client'
import { courierPriorityProfiles } from '../schema/courierPriority'

export const CourierPriorityModel = {
  create: (data: typeof courierPriorityProfiles.$inferInsert) =>
    db.insert(courierPriorityProfiles).values(data).returning(),

  findByUser: (userId: string) =>
    db
      .select()
      .from(courierPriorityProfiles)
      .where(eq(courierPriorityProfiles.user_id, userId))
      .orderBy(asc(courierPriorityProfiles.sort_order), asc(courierPriorityProfiles.created_at)),

  findById: (id: string) =>
    db.select().from(courierPriorityProfiles).where(eq(courierPriorityProfiles.id, id)),

  update: (id: string, data: Partial<typeof courierPriorityProfiles.$inferInsert>) =>
    db
      .update(courierPriorityProfiles)
      .set(data)
      .where(eq(courierPriorityProfiles.id, id))
      .returning(),

  delete: (id: string) =>
    db.delete(courierPriorityProfiles).where(eq(courierPriorityProfiles.id, id)).returning(),
}

export const CourierPriorityService = {
  createCourierPriorityProfile: async (
    userId: string,
    name: string,
    personalisedOrder?: any,
    options: {
      rule_type?: string
      conditions?: any
      is_active?: boolean
      sort_order?: number
    } = {},
  ) => {
    return db.transaction(async (tx) => {
      const ruleType = String(options.rule_type || 'profile').trim() || 'profile'

      if (ruleType === 'profile') {
        const existing = await tx
          .select()
          .from(courierPriorityProfiles)
          .where(
            and(
              eq(courierPriorityProfiles.user_id, userId),
              eq(courierPriorityProfiles.rule_type, 'profile'),
            ),
          )

        if (existing?.length) {
          return tx
            .update(courierPriorityProfiles)
            .set({
              name,
              personalised_order: personalisedOrder ?? null,
              updated_at: new Date(),
            })
            .where(eq(courierPriorityProfiles.id, existing[0].id))
            .returning()
        }
      }

      return tx
        .insert(courierPriorityProfiles)
        .values({
          user_id: userId,
          name,
          personalised_order: personalisedOrder ?? null,
          rule_type: ruleType,
          conditions: Array.isArray(options.conditions) ? options.conditions : [],
          is_active: options.is_active !== false,
          sort_order: Number(options.sort_order ?? 0),
        })
        .returning()
    })
  },

  getCourierPriorityProfilesByUser: async (userId: string) => {
    return CourierPriorityModel.findByUser(userId)
  },

  getCourierPriorityProfile: async (id: string, userId?: string) => {
    const rows = await CourierPriorityModel.findById(id)
    if (!userId) return rows
    return rows.filter((row) => row.user_id === userId)
  },

  updatCourierPriorityeProfile: async (id: string, data: any, userId?: string) => {
    const updateData: any = { ...data, updated_at: new Date() }
    delete updateData.id
    delete updateData.user_id
    delete updateData.created_at

    if (userId) {
      const [existing] = await db
        .select()
        .from(courierPriorityProfiles)
        .where(
          and(eq(courierPriorityProfiles.id, id), eq(courierPriorityProfiles.user_id, userId)),
        )
        .limit(1)
      if (!existing) return []
      if (existing.rule_type === 'rule') {
        const allowed: any = { updated_at: new Date() }
        if (typeof data.is_active === 'boolean') allowed.is_active = data.is_active
        if (data.sort_order !== undefined) allowed.sort_order = Number(data.sort_order)
        return CourierPriorityModel.update(id, allowed)
      }
    }

    return CourierPriorityModel.update(id, updateData)
  },

  deleteCourierPriorityProfile: async (id: string, userId?: string) => {
    if (userId) {
      const [existing] = await db
        .select()
        .from(courierPriorityProfiles)
        .where(
          and(eq(courierPriorityProfiles.id, id), eq(courierPriorityProfiles.user_id, userId)),
        )
        .limit(1)
      if (!existing) return []
    }
    return CourierPriorityModel.delete(id)
  },
}
