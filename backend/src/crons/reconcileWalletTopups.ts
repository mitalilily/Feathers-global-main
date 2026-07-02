import { and, desc, eq, gte, isNotNull, or } from 'drizzle-orm'
import { db } from '../models/client'
import { walletTopups } from '../models/schema/wallet'
import { reconcileWalletTopupOrder } from '../models/services/walletTopupService'

export async function reconcileWalletTopups(): Promise<void> {
  const lookbackWindow = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const pendingTopups = await db
    .select({
      orderId: walletTopups.gatewayOrderId,
      createdAt: walletTopups.createdAt,
    })
    .from(walletTopups)
    .where(
      and(
        or(eq(walletTopups.status, 'created'), eq(walletTopups.status, 'processing')),
        isNotNull(walletTopups.gatewayOrderId),
        gte(walletTopups.createdAt, lookbackWindow),
      ),
    )
    .orderBy(desc(walletTopups.createdAt))
    .limit(100)

  console.log(`[Cron] Reconciling ${pendingTopups.length} pending wallet top-up(s)`)

  for (const topup of pendingTopups) {
    const orderId = String(topup.orderId || '').trim()
    if (!orderId) continue

    try {
      const result = await reconcileWalletTopupOrder(orderId)
      console.log('[Cron] Wallet top-up reconcile result', {
        orderId,
        ok: result?.ok ?? false,
        status: result?.status ?? 'missing',
        paymentStatus: result?.paymentStatus ?? null,
      })
    } catch (error) {
      console.error(`[Cron] Wallet top-up reconciliation failed for ${orderId}:`, error)
    }
  }

  console.log('[Cron] Wallet reconciliation complete')
}
