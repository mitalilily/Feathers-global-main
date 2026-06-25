// seedAdmin.ts
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../models/client'
import { User } from '../models/services/userService'
import { users } from '../schema/schema'
import {
  getBootstrapAdminEmail,
  getBootstrapAdminPassword,
  getBootstrapAdminPhone,
} from '../config/bootstrapAdmin'

interface SeedAdminProps {
  phone: string
  password: string
  email?: string
  role?: 'admin' | 'customer' | 'manager'
  resetPassword?: boolean
}

export const seedAdmin = async ({
  phone,
  password,
  email,
  role = 'admin',
  resetPassword = false,
}: SeedAdminProps): Promise<User> => {
  const normalizedEmail = email?.trim().toLowerCase() ?? null
  const hashedPassword = await bcrypt.hash(password, 10)
  const [existingByPhone] = await db.select().from(users).where(eq(users.phone, phone)).limit(1)
  const [existingByEmail] = !existingByPhone && normalizedEmail
    ? await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1)
    : []

  const existing = existingByPhone || existingByEmail

  if (existing) {
    const shouldUpdatePassword = resetPassword || !existing.passwordHash
    const [updatedUser] = await db
      .update(users)
      .set({
        phone,
        email: normalizedEmail,
        ...(shouldUpdatePassword ? { passwordHash: hashedPassword } : {}),
        role,
        phoneVerified: true,
        emailVerified: !!normalizedEmail,
        accountVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning()

    return updatedUser as User
  }

  const [newUser] = await db
    .insert(users)
    .values({
      id: uuidv4(),
      phone,
      email: normalizedEmail,
      passwordHash: hashedPassword,
      role,
      phoneVerified: true,
      emailVerified: !!normalizedEmail,
      accountVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()

  return newUser as User
}

export const ensureBootstrapAdmin = (resetPassword = false) =>
  seedAdmin({
    phone: getBootstrapAdminPhone(),
    email: getBootstrapAdminEmail(),
    password: getBootstrapAdminPassword(),
    role: 'admin',
    resetPassword,
  })

if (require.main === module) {
  ensureBootstrapAdmin(process.env.ADMIN_RESET_PASSWORD === 'true')
    .then((user) => {
      console.log('Admin user created or verified:', {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
      })
      process.exit(0)
    })
    .catch((err) => {
      console.error('Error seeding admin:', err)
      process.exit(1)
    })
}
