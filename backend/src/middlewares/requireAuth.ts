import { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../models/client";
import { employees } from "../models/schema/employees";
import { stores } from "../models/schema/stores";
import { findUserById } from "../models/services/userService";
import { normalizeShopifyDomain, verifyShopifySessionToken } from '../models/services/shopify.service'
import { verifyAccessToken } from "../utils/jwt";

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const auth = req.headers.authorization;
  const shiplifiAccessToken = String(req.headers['x-shiplifi-access-token'] || '').trim();

  if (!shiplifiAccessToken && !auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    const token = shiplifiAccessToken || auth!.split(" ")[1];
    const decoded = await verifyAccessToken(token); // ✅ await here

    if (!decoded || typeof decoded !== 'object') {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    const userId = typeof (decoded as any).sub === 'string' ? (decoded as any).sub.trim() : '';
    if (!userId) {
      return res.status(401).json({
        error: "Session invalid. Please log in again.",
        code: "SESSION_INVALID",
      });
    }

    const user = await findUserById(userId);
    if (!user) {
      console.error("Session token references missing user:", {
        userId,
        path: req.originalUrl || req.url,
        method: req.method,
      });
      return res.status(401).json({
        error: "Session invalid. Please log in again.",
        code: "SESSION_INVALID",
      });
    }

    let merchantUserId = user.id;
    let employeeAdminId: string | null = null;

    if (user.role === "employee") {
      const [employeeRecord] = await db
        .select({
          adminId: employees.adminId,
          isActive: employees.isActive,
        })
        .from(employees)
        .where(eq(employees.userId, user.id))
        .limit(1);

      if (employeeRecord?.isActive === false) {
        return res.status(403).json({
          error: "Employee account is inactive.",
          code: "EMPLOYEE_INACTIVE",
        });
      }

      if (employeeRecord?.adminId) {
        employeeAdminId = employeeRecord.adminId;
        merchantUserId = employeeRecord.adminId;
      }
    }

    if (shiplifiAccessToken) {
      const shopifySessionToken = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
      if (!shopifySessionToken) {
        return res.status(401).set('Cache-Control', 'no-store').json({
          error: 'Shopify session token is required',
          code: 'SHOPIFY_SESSION_MISSING',
        });
      }

      let shop: string;
      try {
        const shopifySession = verifyShopifySessionToken(shopifySessionToken);
        shop = normalizeShopifyDomain(new URL(shopifySession.dest).hostname);
      } catch {
        return res.status(401).set('Cache-Control', 'no-store').json({
          error: 'Shopify session expired or is invalid',
          code: 'SHOPIFY_SESSION_INVALID',
        });
      }

      const [binding] = await db
        .select({ id: stores.id })
        .from(stores)
        .where(and(eq(stores.userId, user.id), eq(stores.domain, shop)))
        .limit(1);
      if (!binding) {
        return res.status(403).set('Cache-Control', 'no-store').json({
          error: 'Shopify store is not connected to this account',
          code: 'SHOPIFY_SESSION_STORE_MISMATCH',
        });
      }
      (req as any).shopifySession = { shop };
    }

    // Attach decoded token to request
    (req as any).user = {
      ...decoded,
      sub: user.id,
      merchantSub: merchantUserId,
      employeeAdminId,
    };
    // Also expose userId for controllers that expect req.userId (for consistency with requireApiKey)
    (req as any).userId = user.id;
    // Merchant-scoped resources such as orders, pickups, and wallet belong to the owner account.
    (req as any).merchantUserId = merchantUserId;

    next();
  } catch (err: any) {
    // Don't log TokenExpiredError as error - it's expected behavior
    if (err?.name === 'TokenExpiredError') {
      // Return 401 so frontend can attempt refresh
      return res.status(401).json({ 
        error: "Token expired",
        code: "TOKEN_EXPIRED" 
      });
    }
    // Log other errors
    if (err?.name !== 'TokenExpiredError') {
      console.error("Token verification error:", err?.name || err?.message || err);
    }
    return res.status(401).json({ 
      error: "Token invalid or expired",
      code: err?.name || "TOKEN_INVALID"
    });
  }
};
