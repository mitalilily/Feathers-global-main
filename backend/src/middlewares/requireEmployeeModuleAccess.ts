import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../models/client'
import { employees } from '../models/schema/employees'

type AuthenticatedRequest = Request & {
  user?: {
    sub?: string
    role?: string
  }
}

const isPlainObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const getNestedBoolean = (value: unknown, path: string) => {
  const result = path.split('.').reduce<unknown>((current, segment) => {
    if (!isPlainObject(current)) return undefined
    return current[segment]
  }, value)

  return result === true
}

async function getEmployeeAccessRecord(userId: string) {
  const [record] = await db
    .select({
      moduleAccess: employees.moduleAccess,
      isActive: employees.isActive,
    })
    .from(employees)
    .where(eq(employees.userId, userId))
    .limit(1)

  return record
}

export const requireNonEmployeeUser: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const request = req as AuthenticatedRequest

  if (request.user?.role !== 'employee') {
    next()
    return
  }

  res.status(403).json({
    success: false,
    message: 'Employee accounts cannot manage users.',
  })
}

export const requireEmployeeModuleAccess =
  (paths: string | string[], options: { requireAll?: boolean; message?: string } = {}) =>
  (async (req: Request, res: Response, next: NextFunction) => {
    const request = req as AuthenticatedRequest

    if (request.user?.role !== 'employee') {
      next()
      return
    }

    const userId = request.user?.sub
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      })
      return
    }

    const record = await getEmployeeAccessRecord(userId)

    if (!record?.isActive) {
      res.status(403).json({
        success: false,
        message: 'Employee access is inactive.',
      })
      return
    }

    const permissionPaths = Array.isArray(paths) ? paths : [paths]
    const checker = options.requireAll ? 'every' : 'some'
    const hasAccess = permissionPaths[checker]((path) => getNestedBoolean(record.moduleAccess, path))

    if (!hasAccess) {
      res.status(403).json({
        success: false,
        message: options.message || 'You do not have permission to access this module.',
      })
      return
    }

    next()
  }) as RequestHandler
