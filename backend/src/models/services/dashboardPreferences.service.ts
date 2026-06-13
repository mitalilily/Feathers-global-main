import { eq } from 'drizzle-orm'
import { db } from '../client'
import { dashboardPreferences } from '../schema/dashboardPreferences'

export interface DashboardPreferences {
  widgetVisibility: Record<string, boolean>
  widgetOrder: string[]
  layout: {
    columns?: number
    spacing?: number
    cardStyle?: 'default' | 'compact' | 'spacious'
    showGridLines?: boolean
  }
  dateRange: {
    defaultRange?: '7days' | '30days' | '90days' | 'custom'
    customStart?: string
    customEnd?: string
  }
}

const defaultPreferences: DashboardPreferences = {
  widgetVisibility: {
    quickStats: true,
    quickActions: true,
    insights: true,
    actionItems: true,
    recommendations: true,
    performanceMetrics: true,
    ordersTrend: true,
    financialHealth: true,
    recentActivity: true,
    revenueChart: true,
    todaysOperations: true,
    orderStatusChart: true,
    revenueByTypeChart: true,
    courierComparison: true,
    metricsOverview: true,
    courierPerformance: true,
    topDestinations: true,
    opsAnalytics: true,
  },
  widgetOrder: [
    'quickStats',
    'quickActions',
    'insights',
    'actionItems',
    'recommendations',
    'performanceMetrics',
    'ordersTrend',
    'financialHealth',
    'recentActivity',
    'revenueChart',
    'todaysOperations',
    'orderStatusChart',
    'revenueByTypeChart',
    'courierComparison',
    'metricsOverview',
    'courierPerformance',
    'topDestinations',
    'opsAnalytics',
  ],
  layout: {
    columns: 12,
    spacing: 3,
    cardStyle: 'default',
    showGridLines: false,
  },
  dateRange: {
    defaultRange: '7days',
  },
}

const normalizePreferences = (preferences: Partial<DashboardPreferences> | undefined): DashboardPreferences => {
  const widgetVisibility = {
    ...defaultPreferences.widgetVisibility,
    ...(preferences?.widgetVisibility || {}),
  }

  const preferredOrder = Array.isArray(preferences?.widgetOrder) ? preferences.widgetOrder : []
  const defaultOrder = defaultPreferences.widgetOrder
  const orderedWidgets = [
    ...preferredOrder.filter((widgetId) => defaultOrder.includes(widgetId)),
    ...defaultOrder.filter((widgetId) => !preferredOrder.includes(widgetId)),
  ]

  return {
    widgetVisibility,
    widgetOrder: orderedWidgets,
    layout: {
      ...defaultPreferences.layout,
      ...(preferences?.layout || {}),
    },
    dateRange: {
      ...defaultPreferences.dateRange,
      ...(preferences?.dateRange || {}),
    },
  }
}

export const getDashboardPreferences = async (userId: string): Promise<DashboardPreferences> => {
  const [prefs] = await db
    .select()
    .from(dashboardPreferences)
    .where(eq(dashboardPreferences.userId, userId))
    .limit(1)

  if (!prefs) {
    // Create default preferences
    await db.insert(dashboardPreferences).values({
      userId,
      widgetVisibility: defaultPreferences.widgetVisibility,
      widgetOrder: defaultPreferences.widgetOrder,
      layout: defaultPreferences.layout,
      dateRange: defaultPreferences.dateRange,
    })
    return defaultPreferences
  }

  return normalizePreferences({
    widgetVisibility: prefs.widgetVisibility as Record<string, boolean>,
    widgetOrder: prefs.widgetOrder as string[],
    layout: prefs.layout as any,
    dateRange: prefs.dateRange as any,
  })
}

export const saveDashboardPreferences = async (
  userId: string,
  preferences: Partial<DashboardPreferences>,
): Promise<DashboardPreferences> => {
  try {
    const existing = await db
      .select()
      .from(dashboardPreferences)
      .where(eq(dashboardPreferences.userId, userId))
      .limit(1)

    const currentPreferences = existing[0]
      ? {
          widgetVisibility: existing[0].widgetVisibility as Record<string, boolean>,
          widgetOrder: existing[0].widgetOrder as string[],
          layout: existing[0].layout as any,
          dateRange: existing[0].dateRange as any,
        }
      : defaultPreferences

    const updatedPrefs = normalizePreferences({
      ...currentPreferences,
      ...preferences,
    })

    if (existing[0]) {
      const [updated] = await db
        .update(dashboardPreferences)
        .set({
          widgetVisibility: updatedPrefs.widgetVisibility,
          widgetOrder: updatedPrefs.widgetOrder,
          layout: updatedPrefs.layout,
          dateRange: updatedPrefs.dateRange,
          updatedAt: new Date(),
        })
        .where(eq(dashboardPreferences.userId, userId))
        .returning()
      
      if (updated) {
        return normalizePreferences({
          widgetVisibility: updated.widgetVisibility as Record<string, boolean>,
          widgetOrder: updated.widgetOrder as string[],
          layout: updated.layout as any,
          dateRange: updated.dateRange as any,
        })
      }
    } else {
      const [newPrefs] = await db
        .insert(dashboardPreferences)
        .values({
          userId,
          widgetVisibility: updatedPrefs.widgetVisibility,
          widgetOrder: updatedPrefs.widgetOrder,
          layout: updatedPrefs.layout,
          dateRange: updatedPrefs.dateRange,
        })
        .returning()
      
      if (newPrefs) {
        return normalizePreferences({
          widgetVisibility: newPrefs.widgetVisibility as Record<string, boolean>,
          widgetOrder: newPrefs.widgetOrder as string[],
          layout: newPrefs.layout as any,
          dateRange: newPrefs.dateRange as any,
        })
      }
    }

    return updatedPrefs
  } catch (error: any) {
    console.error('Error saving dashboard preferences:', error)
    throw error
  }
}
