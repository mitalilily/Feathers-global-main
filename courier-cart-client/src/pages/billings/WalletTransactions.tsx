import {
  alpha,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Skeleton,
  Stack,
  Typography,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TextField,
} from '@mui/material'
import { useState } from 'react'
import { MdDownload } from 'react-icons/md'
import Papa from 'papaparse'
import { FilterBar, type FilterField } from '../../components/FilterBar'
import ListPageLayout from '../../components/UI/layout/ListPageLayout'
import { useWalletTransactions } from '../../hooks/useWalletBalance'
import { toast } from '../../components/UI/Toast'
import type { WalletTransaction } from '../../api/wallet.api'

interface WalletFilter {
  type?: 'credit' | 'debit' | ''
  dateFrom?: string
  dateTo?: string
  search?: string
}

interface PriceBreakupLine {
  key?: string
  label: string
  amount: number
  kind?: 'charge' | 'tax' | 'subtotal' | 'total'
  adminOnly?: boolean
}

const hiddenClientBreakupKeys = [
  'courier_cost',
  'provider_quote_charge',
  'final_courier_charge',
  'platform_freight_charge',
  'internal_margin',
]
const WALLET_TRANSACTION_GST_PERCENT = 18

const formatCurrency = (value: unknown, currency = 'INR') => {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0)
}

const formatCsvAmount = (value: unknown) => {
  const amount = Number(value || 0)
  return (Number.isFinite(amount) ? Math.abs(amount) : 0).toFixed(2)
}

const formatLedgerAmount = (value: unknown, currency = 'INR') => {
  if (value === undefined || value === null || value === '') return '-'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '-'
  return formatCurrency(Math.abs(amount), currency)
}

const formatDateTime = (date?: string) => {
  if (!date) return '-'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getMeta = (txn?: WalletTransaction | null) =>
  txn?.meta && typeof txn.meta === 'object' && !Array.isArray(txn.meta) ? txn.meta : {}

const toNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    const amount = toNumber(value)
    if (amount !== null) return amount
  }
  return null
}

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

const getTransactionAwb = (txn?: WalletTransaction | null) => {
  const meta = getMeta(txn)
  return firstText(
    txn?.awb_number,
    txn?.order?.awb_number,
    meta.awb_number,
    meta.awbNumber,
    meta.awb,
  )
}

const getOrderNumber = (txn?: WalletTransaction | null) => {
  const meta = getMeta(txn)
  return firstText(txn?.order?.order_number, meta.order_number, meta.orderNumber, txn?.ref)
}

const getCourierName = (txn?: WalletTransaction | null) => {
  const meta = getMeta(txn)
  return firstText(
    txn?.order?.courier_partner,
    meta.courier_name,
    meta.courier_partner,
    meta.integration_type,
  )
}

const getTransactionId = (txn?: WalletTransaction | null) => {
  const meta = getMeta(txn)
  return firstText(meta.transaction_id, meta.transactionId, meta.gatewayPaymentId, meta.gateway_payment_id, txn?.id)
}

const getLedgerDescription = (txn?: WalletTransaction | null) => {
  const reason = String(txn?.reason || '').toLowerCase()
  if (reason.includes('rto cod')) return 'RTO COD Charges'
  if (reason.includes('cod')) return 'COD Charges'
  if (reason.includes('rto freight')) return 'RTO Freight Charges'
  if (reason.includes('reverse')) return 'Reverse Shipping Charges'
  if (reason.includes('weight')) return 'Weight Discrepancy Charges'
  if (reason.includes('wallet recharge') || reason.includes('topup') || reason.includes('top-up')) return 'Wallet Recharge'
  if (reason.includes('refund')) return 'Refund'
  if (reason.includes('freight') || reason.includes('shipment') || reason.includes('order payment')) return 'Freight Charges'
  return txn?.reason || '-'
}

const getLedgerTransactionType = (txn?: WalletTransaction | null) => {
  const description = getLedgerDescription(txn)
  if (description === 'Wallet Recharge') return 'Wallet Recharge'
  if (description === 'Refund') return 'Refund'
  return 'Shipping'
}

const isClientVisibleLine = (line: PriceBreakupLine) => {
  const key = String(line.key || '').toLowerCase()
  return !line.adminOnly && !hiddenClientBreakupKeys.some((hiddenKey) => key.includes(hiddenKey))
}

const getPriceBreakupLines = (txn: WalletTransaction): PriceBreakupLine[] => {
  const backendLines = (txn.transaction_breakup?.lines || []).filter(isClientVisibleLine)
  if (backendLines.length) return backendLines

  const meta = getMeta(txn)
  const order = txn.order || {}
  const reason = String(txn.reason || '').toLowerCase()
  const paymentType = firstText(meta.payment_type, order.order_type).toLowerCase()
  const isCod = paymentType === 'cod' || reason.includes('cod')
  const lines: PriceBreakupLine[] = []
  const addLine = (
    key: string,
    label: string,
    amount: number | null,
    kind: PriceBreakupLine['kind'] = 'charge',
    includeZero = false,
  ) => {
    if (amount === null) return
    if (amount === 0 && !includeZero) return
    lines.push({ key, label, amount, kind })
  }

  addLine(
    'freight_charges',
    'Freight charge',
    firstNumber(meta.freight_charges, meta.freightCharges, order.freight_charges),
  )
  addLine('other_charges', 'Other charge', firstNumber(meta.other_charges, order.other_charges))
  addLine('cod_charges', 'COD charge', firstNumber(meta.cod_charges, order.cod_charges), 'charge', isCod)

  const chargeLineCount = lines.filter((line) => line.kind === 'charge').length
  if (chargeLineCount === 0 && getTransactionAwb(txn)) {
    const fallbackLabel = reason.includes('rto freight')
      ? 'RTO freight charge'
      : reason.includes('weight discrepancy')
        ? 'Weight discrepancy charge'
        : reason.includes('reverse')
          ? 'Reverse shipment charge'
          : 'Shipment charge'
    addLine('shipment_charge', fallbackLabel, Number(txn.amount || 0), 'charge', true)
  }

  addLine('taxable_subtotal', 'Taxable subtotal', firstNumber(meta.wallet_base_debit), 'subtotal')

  const gstPercent = WALLET_TRANSACTION_GST_PERCENT
  const taxableSubtotal =
    firstNumber(meta.wallet_base_debit, order.wallet_debit_amount) ??
    lines
      .filter((line) => line.kind === 'charge')
      .reduce((sum, line) => sum + Number(line.amount || 0), 0)
  const gstAmount = taxableSubtotal > 0 ? Number(((taxableSubtotal * gstPercent) / 100).toFixed(2)) : null
  addLine(
    'gst_amount',
    `GST (${gstPercent}%)`,
    gstAmount,
    'tax',
    taxableSubtotal > 0,
  )

  addLine(
    'wallet_transaction_total',
    txn.type === 'credit' ? 'Wallet credit total' : 'Wallet debit total',
    firstNumber(meta.total_wallet_debit, order.wallet_debit_amount, txn.amount),
    'total',
    true,
  )

  return lines
}

const DetailItem = ({ label, value }: { label: string; value: string }) => (
  <Box>
    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>
      {label}
    </Typography>
    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: '#17171A', wordBreak: 'break-word' }}>
      {value || '-'}
    </Typography>
  </Box>
)

const WalletTransactions = () => {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<WalletFilter>({})
  const [selectedTransaction, setSelectedTransaction] = useState<WalletTransaction | null>(null)

  const { data, isLoading, isError } = useWalletTransactions({
    limit: 15,
    page,
    type: filters.type || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    search: filters.search || undefined,
  })

  const transactions = data?.transactions ?? []

  const filterFields: FilterField[] = [
    {
      name: 'type',
      label: 'Type',
      type: 'select',
      options: [
        { label: 'All', value: '' },
        { label: 'Credit', value: 'credit' },
        { label: 'Debit', value: 'debit' },
      ],
    },
    { name: 'dateFrom', label: 'From', type: 'date' },
    { name: 'dateTo', label: 'To', type: 'date' },
  ]

  if (isError)
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="error">Error loading transactions</Typography>
      </Box>
    )

  const balance = Number(data?.wallet?.balance || 0)
  const selectedAwb = getTransactionAwb(selectedTransaction)
  const selectedBreakupLines = selectedTransaction ? getPriceBreakupLines(selectedTransaction) : []
  const selectedFacts = selectedTransaction?.transaction_breakup?.facts || []

  const handleExportCSV = () => {
    if (!transactions.length) {
      toast.open({ message: 'No transactions to export', severity: 'warning' })
      return
    }

    const csvData = transactions.map((txn) => ({
      Date: formatDateTime(txn.created_at),
      'Txn Type': getLedgerTransactionType(txn),
      'Ref No': getTransactionAwb(txn) || txn.ref || '-',
      'Transaction ID': getTransactionId(txn),
      Credit: txn.type === 'credit' ? formatCsvAmount(txn.amount) : '-',
      Debit: txn.type === 'debit' ? formatCsvAmount(txn.amount) : '-',
      'Closing Balance': formatCsvAmount(txn.closing_balance),
      Description: getLedgerDescription(txn),
    }))

    const csv = Papa.unparse(csvData)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `wallet-transactions-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    toast.open({ message: 'Transactions exported successfully', severity: 'success' })
  }

  return (
    <ListPageLayout title="Wallet Transactions" description="Transaction history and balance">
      <Stack gap={1.5} sx={{ pb: 2 }}>
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            backgroundColor: '#FFFFFF',
            border: '1px solid rgba(17, 24, 39, 0.08)',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
          }}
        >
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
            Current Balance
          </Typography>
          {isLoading ? (
            <Skeleton variant="text" width={150} height={32} />
          ) : (
            <Typography sx={{ fontSize: '1.8rem', fontWeight: 900, color: '#047b85' }}>
              {formatCurrency(balance)}
            </Typography>
          )}
        </Box>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          gap={1}
        >
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#17171A' }}>
            Transactions
          </Typography>
          <Stack direction="row" gap={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<MdDownload />}
              onClick={handleExportCSV}
              sx={{ textTransform: 'none', borderRadius: 1.5, fontSize: '0.85rem' }}
            >
              Export
            </Button>
            <Box>
              <FilterBar<WalletFilter>
                fields={filterFields}
                defaultValues={filters}
                onApply={(vals) => {
                  setFilters(vals)
                  setPage(1)
                }}
                mode="button"
                buttonLabel="Filters"
                appliedCount={Object.values(filters).filter(Boolean).length}
              />
            </Box>
          </Stack>
        </Stack>

        <TextField
          size="small"
          fullWidth
          value={filters.search || ''}
          placeholder="Search by Order ID / Order Number / AWB"
          onChange={(event) => {
            setFilters((prev) => ({ ...prev, search: event.target.value }))
            setPage(1)
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              backgroundColor: '#FFFFFF',
            },
          }}
        />

        <TableContainer
          sx={{
            borderRadius: 2,
            border: '1px solid rgba(17, 24, 39, 0.08)',
            backgroundColor: '#FFFFFF',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
          }}
        >
          {isLoading ? (
            <Stack gap={1} p={2}>
              {Array.from({ length: 5 }).map((_, idx) => (
                <Skeleton key={idx} variant="rectangular" height={40} />
              ))}
            </Stack>
          ) : transactions.length > 0 ? (
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: alpha('#17171A', 0.02) }}>
                  <TableCell sx={{ fontWeight: 800, fontSize: '0.74rem', color: '#94A3B8', textTransform: 'uppercase' }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: '0.74rem', color: '#94A3B8', textTransform: 'uppercase' }}>Txn Type</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: '0.74rem', color: '#94A3B8', textTransform: 'uppercase' }}>Ref No#</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: '0.74rem', color: '#94A3B8', textTransform: 'uppercase' }}>Transaction ID</TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: '0.74rem', color: '#94A3B8', textTransform: 'uppercase' }} align="right">
                    Credit(₹)
                  </TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: '0.74rem', color: '#94A3B8', textTransform: 'uppercase' }} align="right">
                    Debit(₹)
                  </TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: '0.74rem', color: '#94A3B8', textTransform: 'uppercase' }} align="right">
                    Closing Balance(₹)
                  </TableCell>
                  <TableCell sx={{ fontWeight: 800, fontSize: '0.74rem', color: '#94A3B8', textTransform: 'uppercase' }}>Description</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((txn) => {
                  const awb = getTransactionAwb(txn)
                  const txnId = getTransactionId(txn)
                  return (
                    <TableRow
                      key={txn.id}
                      sx={{
                        '&:hover': { backgroundColor: alpha('#17171A', 0.02) },
                        '&:last-child td': { borderBottom: 0 },
                      }}
                    >
                      <TableCell sx={{ p: '10px 16px', fontSize: '0.78rem', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>
                        {formatDateTime(txn.created_at)}
                      </TableCell>
                      <TableCell sx={{ p: '10px 16px', fontSize: '0.82rem', color: '#334155' }}>
                        {getLedgerTransactionType(txn)}
                      </TableCell>
                      <TableCell sx={{ p: '10px 16px', fontSize: '0.8rem' }}>
                        {awb ? (
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => setSelectedTransaction(txn)}
                            sx={{
                              minWidth: 0,
                              p: 0,
                              fontSize: '0.78rem',
                              fontWeight: 800,
                              fontFamily: 'monospace',
                              textTransform: 'none',
                            }}
                          >
                            {awb}
                          </Button>
                        ) : (
                          <Typography sx={{ color: '#64748B', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                            {txn.ref || '-'}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ p: '10px 16px', fontSize: '0.78rem', color: '#334155', fontFamily: 'monospace' }}>
                        {txnId ? `#${String(txnId).replace(/^#/, '').slice(0, 10)}` : '-'}
                      </TableCell>
                      <TableCell
                        sx={{
                          p: '10px 16px',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          color: '#059669',
                          textAlign: 'right',
                        }}
                      >
                        {txn.type === 'credit' ? formatLedgerAmount(txn.amount, txn.currency) : '-'}
                      </TableCell>
                      <TableCell
                        sx={{
                          p: '10px 16px',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          color: '#DC2626',
                          textAlign: 'right',
                        }}
                      >
                        {txn.type === 'debit' ? formatLedgerAmount(txn.amount, txn.currency) : '-'}
                      </TableCell>
                      <TableCell sx={{ p: '10px 16px', fontSize: '0.82rem', color: '#334155', fontWeight: 700, textAlign: 'right' }}>
                        {formatLedgerAmount(txn.closing_balance, txn.currency)}
                      </TableCell>
                      <TableCell sx={{ p: '10px 16px', fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                        {getLedgerDescription(txn)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography sx={{ color: '#6B7280', fontSize: '0.9rem' }}>No transactions found</Typography>
            </Box>
          )}
        </TableContainer>

        {transactions.length > 0 && (
          <Stack direction="row" justifyContent="center" gap={1}>
            <Button
              size="small"
              variant="outlined"
              disabled={page === 1 || isLoading}
              onClick={() => setPage((p) => p - 1)}
              sx={{ textTransform: 'none', borderRadius: 1.5, fontSize: '0.85rem' }}
            >
              Previous
            </Button>
            <Typography sx={{ alignSelf: 'center', fontSize: '0.85rem', color: '#6B7280' }}>
              Page {page}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              disabled={transactions.length < 15 || isLoading}
              onClick={() => setPage((p) => p + 1)}
              sx={{ textTransform: 'none', borderRadius: 1.5, fontSize: '0.85rem' }}
            >
              Next
            </Button>
          </Stack>
        )}
      </Stack>

      <Dialog
        open={Boolean(selectedTransaction)}
        onClose={() => setSelectedTransaction(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Transaction Details</DialogTitle>
        <DialogContent dividers>
          {selectedTransaction && (
            <Stack gap={2}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 1.5,
                }}
              >
                <DetailItem label="AWB" value={selectedAwb} />
                <DetailItem label="Order" value={getOrderNumber(selectedTransaction)} />
                <DetailItem label="Courier" value={getCourierName(selectedTransaction)} />
                <DetailItem label="Type" value={selectedTransaction.type.toUpperCase()} />
                <DetailItem label="Reference" value={selectedTransaction.ref || '-'} />
                <DetailItem label="Date" value={formatDateTime(selectedTransaction.created_at)} />
              </Box>

              <Divider />

              <Box>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, color: '#17171A', mb: 1 }}>
                  Price Breakup
                </Typography>
                <Stack
                  sx={{
                    border: '1px solid rgba(17, 24, 39, 0.08)',
                    borderRadius: 1.5,
                    overflow: 'hidden',
                  }}
                >
                  {selectedBreakupLines.map((line) => (
                    <Stack
                      key={`${line.key || line.label}-${line.kind || 'line'}`}
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      sx={{
                        px: 1.5,
                        py: 1,
                        borderBottom:
                          line.kind === 'total' ? 0 : '1px solid rgba(17, 24, 39, 0.06)',
                        backgroundColor:
                          line.kind === 'total' ? alpha('#17171A', 0.03) : '#FFFFFF',
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: '0.84rem',
                          fontWeight: line.kind === 'total' || line.kind === 'subtotal' ? 800 : 600,
                          color: '#374151',
                        }}
                      >
                        {line.label}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: '0.84rem',
                          fontWeight: 800,
                          color: line.kind === 'tax' ? '#047b85' : '#17171A',
                        }}
                      >
                        {formatCurrency(line.amount, selectedTransaction.currency)}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>

              {selectedFacts.length > 0 && (
                <>
                  <Divider />
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                      gap: 1.25,
                    }}
                  >
                    {selectedFacts.map((fact) => (
                      <DetailItem key={`${fact.label}-${fact.value}`} label={fact.label} value={fact.value} />
                    ))}
                  </Box>
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedTransaction(null)} sx={{ textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </ListPageLayout>
  )
}

export default WalletTransactions
