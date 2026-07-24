import { Response } from 'express'
import {
  CUSTOMER_EMAIL_EVENT_LABELS,
  SELLER_EMAIL_EVENT_LABELS,
  getEmailNotificationPreferences,
  updateEmailNotificationPreferences,
} from '../models/services/emailNotificationPreferences.service'

const resolveMerchantUserId = (req: any) => req.merchantUserId || req.userId

export const getEmailNotificationPreferencesController = async (req: any, res: Response) => {
  try {
    const userId = resolveMerchantUserId(req)
    const data = await getEmailNotificationPreferences(userId)

    return res.status(200).json({
      success: true,
      data,
      meta: {
        customer_event_labels: CUSTOMER_EMAIL_EVENT_LABELS,
        seller_event_labels: SELLER_EMAIL_EVENT_LABELS,
      },
    })
  } catch (error: any) {
    console.error('Error fetching email notification preferences:', error)
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch email notification preferences',
    })
  }
}

export const updateEmailNotificationPreferencesController = async (req: any, res: Response) => {
  try {
    const userId = resolveMerchantUserId(req)
    const data = await updateEmailNotificationPreferences(userId, {
      customer_enabled: req.body?.customer_enabled,
      customer_events: req.body?.customer_events,
      seller_events: req.body?.seller_events,
    })

    return res.status(200).json({
      success: true,
      message: 'Email notification preferences updated',
      data,
    })
  } catch (error: any) {
    console.error('Error updating email notification preferences:', error)
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to update email notification preferences',
    })
  }
}

