import { Request, Response } from 'express'
import { BillingPreferencesService } from '../models/services/billingPreferences.service'

export class BillingPreferencesController {
  // GET /api/billing-preferences/:userId
  static async getBillingPreference(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.sub
      const preference = await BillingPreferencesService.getByUserId(userId)

      if (!preference) {
        res.status(404).json({ message: 'Billing preference not found' })
        return
      }

      res.json(preference)
    } catch (error) {
      console.error('Error fetching billing preference:', error)
      res.status(500).json({ message: 'Internal server error' })
    }
  }

  // POST /api/billing-preferences/:userId
  static async upsertBillingPreference(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.sub
      const { frequency, autoGenerate, customFrequencyDays } = req.body

      if (!['weekly', 'monthly', 'manual', 'custom'].includes(frequency)) {
        res.status(400).json({ message: 'Invalid frequency type' })
        return
      }

      let parsedCustomFrequencyDays: number | null = null
      if (frequency === 'custom') {
        const candidateCustomFrequencyDays = Number(customFrequencyDays || 0)
        if (!Number.isInteger(candidateCustomFrequencyDays) || candidateCustomFrequencyDays < 1) {
          res.status(400).json({ message: 'Custom frequency days must be a positive integer' })
          return
        }
        parsedCustomFrequencyDays = candidateCustomFrequencyDays
      }

      const result = await BillingPreferencesService.upsert(userId, {
        frequency,
        autoGenerate: frequency === 'manual' ? false : Boolean(autoGenerate),
        customFrequencyDays: parsedCustomFrequencyDays,
      })

      res.json({
        message:
          result === 'created'
            ? 'Billing preference created successfully'
            : 'Billing preference updated successfully',
      })
    } catch (error) {
      console.error('Error updating billing preference:', error)
      res.status(500).json({ message: 'Internal server error' })
    }
  }
}
