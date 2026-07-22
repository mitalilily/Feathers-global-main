import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { PgTransaction } from 'drizzle-orm/pg-core'
import { db } from '../client'
import { wallets, walletTransactions } from '../schema/wallet'
import { enrichWalletTransactionsWithShipmentDetails } from './walletTransactionDetails.service'

type WalletTransactionType = 'credit' | 'debit'

interface WalletTransactionParams {
  walletId: string
  amount: number
  type: WalletTransactionType
  reason?: string
  ref?: string
  meta?: Record<string, any>
  currency?: string
  allowNegativeBalance?: boolean
  tx?: PgTransaction<any> // optional, for passing an existing transaction
}

/**
 * Inserts a wallet transaction and updates the wallet balance accordingly.
 */
export const createWalletTransaction = async ({
  walletId,
  amount,
  type,
  reason,
  ref,
  meta,
  currency = 'INR',
  allowNegativeBalance = false,
  tx,
}: WalletTransactionParams) => {
  // Use provided transaction or default to db
  const executor = tx ?? db

  const wallet = await executor.select().from(wallets).where(eq(wallets.id, walletId)).limit(1)
  const currentBalance = Number(wallet[0]?.balance ?? 0)
  // Get current wallet balance if debit
  if (type === 'debit') {
    if (!wallet[0]) throw new Error('Wallet not found')
    if (!allowNegativeBalance && currentBalance < Number(amount)) {
      throw new Error('Insufficient wallet balance')
    }

    await executor
      .update(wallets)
      .set({ balance: (currentBalance - Number(amount)).toString() })
      .where(eq(wallets.id, walletId))
  } else if (type === 'credit') {
    // For credit, just increment
    await executor
      .update(wallets)
      .set({
        balance: (currentBalance + Number(amount)).toString(),
      })
      .where(eq(wallets.id, walletId))
  }

  // Insert transaction record
  const result = await executor
    .insert(walletTransactions)
    .values({
      wallet_id: walletId,
      amount,
      type,
      reason,
      ref,
      meta,
      currency,
      created_at: new Date(),
    })
    .returning({ id: walletTransactions.id })

  return result
}

export async function mutateBalance(
  walletId: string,
  amount: number,
  type: 'credit' | 'debit',
  ref: string,
  meta: Record<string, unknown> = {},
  reason = 'Wallet operation',
) {
  const delta = type === 'credit' ? amount : -amount

  await db.transaction(async (tx) => {
    await tx
      .update(wallets)
      .set({
        balance: sql`${wallets.balance} + ${delta}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, walletId))
    await createWalletTransaction({
      walletId: walletId,
      amount,
      currency: 'INR',
      type,
      ref,
      reason,
      meta,
      tx: tx as any,
    })
  })
}

interface GetUserWalletTransactionsParams {
  userId: string
  limit?: number
  offset?: number
  type?: 'credit' | 'debit'
  dateFrom?: Date
  dateTo?: Date
  search?: string
}

const buildWalletTransactionShipmentSearchFilter = (userId: string, search: string) => {
  const pattern = `%${search.trim()}%`

  return sql`(
    ${walletTransactions.ref} ilike ${pattern}
    or ${walletTransactions.reason} ilike ${pattern}
    or coalesce(${walletTransactions.meta}::text, '') ilike ${pattern}
    or exists (
      select 1
      from b2c_orders o
      where o.user_id = ${userId}::uuid
        and (
          o.id::text ilike ${pattern}
          or coalesce(o.order_id, '') ilike ${pattern}
          or coalesce(o.order_number, '') ilike ${pattern}
          or coalesce(o.awb_number, '') ilike ${pattern}
        )
        and (
          coalesce(${walletTransactions.ref}, '') in (
            o.id::text,
            coalesce(o.order_id, ''),
            coalesce(o.order_number, ''),
            coalesce(o.awb_number, ''),
            coalesce(o.shipment_id, ''),
            coalesce(o.provider_reference, ''),
            coalesce(o.provider_request_id, '')
          )
          or (o.awb_number is not null and coalesce(${walletTransactions.meta}::text, '') ilike ('%' || o.awb_number || '%'))
          or (o.order_number is not null and coalesce(${walletTransactions.meta}::text, '') ilike ('%' || o.order_number || '%'))
          or (o.order_id is not null and coalesce(${walletTransactions.meta}::text, '') ilike ('%' || o.order_id || '%'))
          or coalesce(${walletTransactions.meta}::text, '') ilike ('%' || o.id::text || '%')
        )
    )
    or exists (
      select 1
      from b2b_orders o
      where o.user_id = ${userId}::uuid
        and (
          o.id::text ilike ${pattern}
          or coalesce(o.order_id, '') ilike ${pattern}
          or coalesce(o.order_number, '') ilike ${pattern}
          or coalesce(o.awb_number, '') ilike ${pattern}
        )
        and (
          coalesce(${walletTransactions.ref}, '') in (
            o.id::text,
            coalesce(o.order_id, ''),
            coalesce(o.order_number, ''),
            coalesce(o.awb_number, ''),
            coalesce(o.shipment_id, ''),
            coalesce(o.provider_reference, ''),
            coalesce(o.provider_request_id, '')
          )
          or (o.awb_number is not null and coalesce(${walletTransactions.meta}::text, '') ilike ('%' || o.awb_number || '%'))
          or (o.order_number is not null and coalesce(${walletTransactions.meta}::text, '') ilike ('%' || o.order_number || '%'))
          or (o.order_id is not null and coalesce(${walletTransactions.meta}::text, '') ilike ('%' || o.order_id || '%'))
          or coalesce(${walletTransactions.meta}::text, '') ilike ('%' || o.id::text || '%')
        )
    )
  )`
}

/**
 * Fetch wallet transactions for a given user.
 */
export const getUserWalletTransactions = async ({
  userId,
  limit = 50,
  offset = 0,
  type,
  dateFrom,
  dateTo,
  search,
}: GetUserWalletTransactionsParams) => {
  // 1️⃣ Get wallet of the user
  const userWallet = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)
  if (!userWallet[0]) {
    throw new Error('Wallet not found for this user')
  }
  // 2️⃣ Build dynamic where clause
  const conditions: any[] = [eq(walletTransactions.wallet_id, userWallet[0].id)]
  if (type) conditions.push(eq(walletTransactions.type, type))
  if (dateFrom) conditions.push(gte(walletTransactions.created_at, dateFrom))
  if (dateTo) conditions.push(lte(walletTransactions.created_at, dateTo))
  if (search?.trim()) {
    conditions.push(buildWalletTransactionShipmentSearchFilter(userId, search))
  }
  const filter = and(...conditions)

  // 3️⃣ Fetch transactions
  const transactions = await db
    .select()
    .from(walletTransactions)
    .where(filter)
    .orderBy(sql`${walletTransactions.created_at} DESC`)
    .limit(limit)
    .offset(offset)
  const enrichedTransactions = await enrichWalletTransactionsWithShipmentDetails(userId, transactions, {
    masked: true,
  })

  return {
    wallet: userWallet[0],
    transactions: enrichedTransactions,
  }
}
