import { NextFunction, Request, Response } from 'express'
import { requireKycVerification } from '../utils/kycVerification'

export const requireKycVerified = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = (req as any).userId || (req as any).user?.sub

  if (!userId) {
    return res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Unauthorized' })
  }

  try {
    await requireKycVerification(userId)
    return next()
  } catch (error: any) {
    return res.status(typeof error?.statusCode === 'number' ? error.statusCode : 403).json({
      success: false,
      code: 'KYC_REQUIRED',
      message: error?.message || 'KYC verification is required before creating orders.',
    })
  }
}
