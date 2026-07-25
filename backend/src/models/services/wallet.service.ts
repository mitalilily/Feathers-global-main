import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { PgTransaction } from 'drizzle-orm/pg-core'
import { db, pool } from '../client'
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

interface WalletLedgerTransactionsParams {
  walletId: string
  userId: string
  limit?: number
  offset?: number
  type?: 'credit' | 'debit'
  dateFrom?: Date
  dateTo?: Date
  search?: string
}

const clampWalletTransactionLimit = (limit?: number) => {
  const parsed = Number(limit)
  if (!Number.isFinite(parsed) || parsed <= 0) return 50
  return Math.min(Math.floor(parsed), 500)
}

const clampWalletTransactionOffset = (offset?: number) => {
  const parsed = Number(offset)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.floor(parsed)
}

const buildLedgerFilterSql = ({
  userId,
  type,
  dateFrom,
  dateTo,
  search,
  values,
}: {
  userId: string
  type?: 'credit' | 'debit'
  dateFrom?: Date
  dateTo?: Date
  search?: string
  values: any[]
}) => {
  const filters: string[] = []
  const pushValue = (value: any) => {
    values.push(value)
    return `$${values.length}`
  }

  if (type) filters.push(`wt.type = ${pushValue(type)}`)
  if (dateFrom) filters.push(`wt.created_at >= ${pushValue(dateFrom)}`)
  if (dateTo) filters.push(`wt.created_at <= ${pushValue(dateTo)}`)

  if (search?.trim()) {
    const pattern = `%${search.trim()}%`
    const patternRef = pushValue(pattern)
    const userRef = pushValue(userId)
    filters.push(`(
      wt.ref ILIKE ${patternRef}
      OR wt.reason ILIKE ${patternRef}
      OR COALESCE(wt.meta::text, '') ILIKE ${patternRef}
      OR EXISTS (
        SELECT 1
        FROM b2c_orders o
        WHERE o.user_id = ${userRef}::uuid
          AND (
            o.id::text ILIKE ${patternRef}
            OR COALESCE(o.order_id, '') ILIKE ${patternRef}
            OR COALESCE(o.order_number, '') ILIKE ${patternRef}
            OR COALESCE(o.awb_number, '') ILIKE ${patternRef}
          )
          AND (
            COALESCE(wt.ref, '') IN (
              o.id::text,
              COALESCE(o.order_id, ''),
              COALESCE(o.order_number, ''),
              COALESCE(o.awb_number, ''),
              COALESCE(o.shipment_id, ''),
              COALESCE(o.provider_reference, ''),
              COALESCE(o.provider_request_id, '')
            )
            OR (o.awb_number IS NOT NULL AND COALESCE(wt.meta::text, '') ILIKE ('%' || o.awb_number || '%'))
            OR (o.order_number IS NOT NULL AND COALESCE(wt.meta::text, '') ILIKE ('%' || o.order_number || '%'))
            OR (o.order_id IS NOT NULL AND COALESCE(wt.meta::text, '') ILIKE ('%' || o.order_id || '%'))
            OR COALESCE(wt.meta::text, '') ILIKE ('%' || o.id::text || '%')
          )
      )
      OR EXISTS (
        SELECT 1
        FROM b2b_orders o
        WHERE o.user_id = ${userRef}::uuid
          AND (
            o.id::text ILIKE ${patternRef}
            OR COALESCE(o.order_id, '') ILIKE ${patternRef}
            OR COALESCE(o.order_number, '') ILIKE ${patternRef}
            OR COALESCE(o.awb_number, '') ILIKE ${patternRef}
          )
          AND (
            COALESCE(wt.ref, '') IN (
              o.id::text,
              COALESCE(o.order_id, ''),
              COALESCE(o.order_number, ''),
              COALESCE(o.awb_number, ''),
              COALESCE(o.shipment_id, ''),
              COALESCE(o.provider_reference, ''),
              COALESCE(o.provider_request_id, '')
            )
            OR (o.awb_number IS NOT NULL AND COALESCE(wt.meta::text, '') ILIKE ('%' || o.awb_number || '%'))
            OR (o.order_number IS NOT NULL AND COALESCE(wt.meta::text, '') ILIKE ('%' || o.order_number || '%'))
            OR (o.order_id IS NOT NULL AND COALESCE(wt.meta::text, '') ILIKE ('%' || o.order_id || '%'))
            OR COALESCE(wt.meta::text, '') ILIKE ('%' || o.id::text || '%')
          )
      )
    )`)
  }

  return filters.length ? `WHERE ${filters.join(' AND ')}` : ''
}

export const getWalletLedgerTransactionsForWallet = async ({
  walletId,
  userId,
  limit = 50,
  offset = 0,
  type,
  dateFrom,
  dateTo,
  search,
}: WalletLedgerTransactionsParams) => {
  const baseValues: any[] = [walletId]
  const whereSql = buildLedgerFilterSql({
    userId,
    type,
    dateFrom,
    dateTo,
    search,
    values: baseValues,
  })
  const countValues = [...baseValues]
  const dataValues = [...baseValues, clampWalletTransactionLimit(limit), clampWalletTransactionOffset(offset)]
  const limitRef = `$${dataValues.length - 1}`
  const offsetRef = `$${dataValues.length}`

  const ledgerSql = `
    WITH ledger AS (
      SELECT
        wt.*,
        SUM(
          CASE
            WHEN wt.type = 'credit' THEN wt.amount::numeric
            ELSE -wt.amount::numeric
          END
        ) OVER (
          PARTITION BY wt.wallet_id
          ORDER BY wt.created_at ASC NULLS FIRST, wt.id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS closing_balance
      FROM wallet_transactions wt
      WHERE wt.wallet_id = $1::uuid
    )
  `

  const [countResult, dataResult] = await Promise.all([
    pool.query(
      `
        ${ledgerSql}
        SELECT COUNT(*)::int AS count
        FROM ledger wt
        ${whereSql}
      `,
      countValues,
    ),
    pool.query(
      `
        ${ledgerSql}
        SELECT
          wt.id,
          wt.wallet_id,
          wt.amount,
          wt.currency,
          wt.type,
          wt.ref,
          wt.reason,
          wt.meta,
          wt.created_at,
          wt.closing_balance
        FROM ledger wt
        ${whereSql}
        ORDER BY wt.created_at DESC NULLS LAST, wt.id DESC
        LIMIT ${limitRef}
        OFFSET ${offsetRef}
      `,
      dataValues,
    ),
  ])

  return {
    transactions: dataResult.rows,
    totalCount: Number(countResult.rows[0]?.count || 0),
  }
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
  const { transactions, totalCount } = await getWalletLedgerTransactionsForWallet({
    walletId: userWallet[0].id,
    userId,
    limit,
    offset,
    type,
    dateFrom,
    dateTo,
    search,
  })
  const enrichedTransactions = await enrichWalletTransactionsWithShipmentDetails(userId, transactions, {
    masked: true,
  })

  return {
    wallet: userWallet[0],
    transactions: enrichedTransactions,
    totalCount,
    limit,
    offset,
  }
}
