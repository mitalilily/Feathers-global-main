import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import {
  getBootstrapAdminEmails,
  getBootstrapAdminPassword,
  getBootstrapAdminPhone,
} from "../../config/bootstrapAdmin";
import { ensureBootstrapAdmin } from "../../scripts/seedAdmin";
import { signAccessToken, signRefreshToken } from "../../utils/jwt";
import { db } from "../client";
import { users } from "../schema/users";
import { findUserByEmail, findUserById, saveRefreshToken } from "./userService";


const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function findAdminLoginCandidate(email: string) {
  const normalizedEmail = email.trim().toLowerCase()
  const bootstrapAdminEmails = getBootstrapAdminEmails()
  const bootstrapAdminPhone = getBootstrapAdminPhone()

  const exactMatch = await findUserByEmail(normalizedEmail)
  if (exactMatch) return exactMatch

  if (!bootstrapAdminEmails.includes(normalizedEmail)) {
    return null
  }

  return db.query.users.findFirst({
    where: (user, { eq, inArray, or }) =>
      or(
        inArray(user.email, bootstrapAdminEmails),
        eq(user.phone, bootstrapAdminPhone),
      ),
  })
}

export const loginAdmin = async (email: string, password: string) => {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : email;
  let user = await findAdminLoginCandidate(normalizedEmail);

  if (!user) {
    const bootstrapAdminEmails = getBootstrapAdminEmails()
    const isBootstrapLogin =
      bootstrapAdminEmails.includes(normalizedEmail) && password === getBootstrapAdminPassword()

    if (isBootstrapLogin) {
      user = await ensureBootstrapAdmin(true)
    } else {
      throw new Error("Unauthorized");
    }
  }

  if (user.role !== "admin") {
    const passwordLooksValid = user.passwordHash && (await bcrypt.compare(password, user.passwordHash))
    const matchesBootstrapIdentity =
      getBootstrapAdminEmails().includes((user.email || '').trim().toLowerCase()) ||
      (user.phone || '').trim() === getBootstrapAdminPhone()

    if (!passwordLooksValid || !matchesBootstrapIdentity) {
      throw new Error("Unauthorized");
    }

    await db
      .update(users)
      .set({
        role: 'admin',
        emailVerified: true,
        phoneVerified: true,
        accountVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))

    const elevatedUser = (await findUserByEmail(normalizedEmail)) ?? user
    const accessToken = signAccessToken(elevatedUser.id, "admin");
    const { token: refreshToken } = signRefreshToken(elevatedUser.id, "admin");

    await saveRefreshToken(elevatedUser.id, refreshToken, ONE_WEEK_MS);

    return {
     token: accessToken,
      refreshToken:refreshToken,
      user: {
        id: elevatedUser.id,
        email: elevatedUser.email,
        role: 'admin',
        emailVerified: true,
      },
    };
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash!);
  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  const accessToken = signAccessToken(user.id, "admin");
  const { token: refreshToken } = signRefreshToken(user.id, "admin");

  await saveRefreshToken(user.id, refreshToken, ONE_WEEK_MS);

  return {
   token: accessToken,
    refreshToken:refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
    },
  };
};

export const changeAdminPassword = async (
  adminId: string,
  currentPassword: string,
  newPassword: string,
) => {
  const user = await findUserById(adminId);

  if (!user || user.role !== "admin") {
    throw new Error("Unauthorized");
  }

  if (!user.passwordHash) {
    throw new Error("Password is not set for this admin");
  }

  const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isMatch) {
    throw new Error("Current password is incorrect");
  }

  if (currentPassword === newPassword) {
    throw new Error("New password must be different from current password");
  }

  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}/.test(newPassword)) {
    throw new Error(
      "Password must be at least 8 characters and include upper, lower, and number",
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, adminId));

  // Invalidate old refresh token so admin re-auths cleanly on other sessions.
  await saveRefreshToken(adminId, null, 0, null);
};
