import {
  alpha,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import moment from 'moment'
import { useState } from 'react'
import {
  MdAccessTime,
  MdAccountBalanceWallet,
  MdCheckCircle,
  MdDownload,
  MdEventAvailable,
  MdHourglassEmpty,
  MdTrendingUp,
} from 'react-icons/md'
import { FilterBar, type FilterField } from '../../components/FilterBar'
import AWBLink from '../../components/UI/AWBLink'
import ListPageLayout from '../../components/UI/layout/ListPageLayout'
import DataTable, { type Column } from '../../components/UI/table/DataTable'
import {
  handleCodRemittancesExport,
  useCodRemittancePlan,
  useCodRemittances,
  useCodStats,
  useUpdateCodRemittancePlan,
} from '../../hooks/useCodRemittance'

const BRAND_SURFACE = '#16181D'
const BRAND_PRIMARY = '#047b85'
const BRAND_ORANGE = '#ff821c'

const DEFAULT_COD_PLANS = [
  {
    name: 'T+1 Day',
    chargePercent: 1,
    frequency: 'All Weekdays',
    description: 'The applicable transaction charges is 1.00% of the COD amount (Exclusive of GST)',
  },
  {
    name: 'T+2 Days',
    chargePercent: 0.7,
    frequency: 'All Weekdays',
    description: 'The applicable transaction charges is 0.70% of the COD amount (Exclusive of GST)',
  },
  {
    name: 'T+3 Days',
    chargePercent: 0.5,
    frequency: 'All Weekdays',
    description: 'The applicable transaction charges is 0.50% of the COD amount (Exclusive of GST)',
  },
  {
    name: 'T+4 Days (Default)',
    chargePercent: 0,
    frequency: 'Weekly Twice',
    description: 'The applicable transaction charges is 0% of the COD amount (Exclusive of GST)',
  },
]

interface SummaryCardProps {
  title: string
  value: number
  helper: string
  icon: React.ReactNode
  tone: 'dark' | 'primary' | 'wine' | 'light'
}

function SummaryCard({ title, value, helper, icon, tone }: SummaryCardProps) {
  const toneStyles = {
    dark: {
      background: BRAND_SURFACE,
      border: '1px solid rgba(255,255,255,0.06)',
      titleColor: '#D8DEE8',
      valueColor: '#FFFFFF',
      helperColor: '#C7D0DD',
      iconBg: 'rgba(255,255,255,0.08)',
      iconColor: '#FFFFFF',
    },
    primary: {
      background: '#FFFFFF',
      border: `1px solid ${alpha(BRAND_PRIMARY, 0.14)}`,
      titleColor: '#4B5563',
      valueColor: BRAND_PRIMARY,
      helperColor: '#6B7280',
      iconBg: alpha(BRAND_PRIMARY, 0.08),
      iconColor: BRAND_PRIMARY,
    },
    wine: {
      background: '#FFFFFF',
      border: `1px solid ${alpha(BRAND_ORANGE, 0.16)}`,
      titleColor: '#4B5563',
      valueColor: BRAND_ORANGE,
      helperColor: '#6B7280',
      iconBg: alpha(BRAND_ORANGE, 0.1),
      iconColor: BRAND_ORANGE,
    },
    light: {
      background: '#F8FAFC',
      border: '1px solid rgba(15, 23, 42, 0.08)',
      titleColor: '#4B5563',
      valueColor: '#111827',
      helperColor: '#6B7280',
      iconBg: '#FFFFFF',
      iconColor: '#111827',
    },
  }[tone]

  return (
    <Paper
      elevation={0}
      sx={{
        height: '100%',
        p: 2.2,
        borderRadius: 0,
        background: toneStyles.background,
        border: toneStyles.border,
        boxShadow: 'none',
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: '0.78rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: toneStyles.titleColor,
            }}
          >
            {title}
          </Typography>
          <Typography
            sx={{
              mt: 1.1,
              fontSize: { xs: '1.55rem', md: '1.9rem' },
              fontWeight: 800,
              lineHeight: 1.05,
              color: toneStyles.valueColor,
            }}
          >
            ₹{Number(value || 0).toLocaleString('en-IN')}
          </Typography>
          <Typography sx={{ mt: 1.1, fontSize: '0.84rem', color: toneStyles.helperColor }}>
            {helper}
          </Typography>
        </Box>

        <Box
          sx={{
            width: 44,
            height: 44,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 0,
            bgcolor: toneStyles.iconBg,
            color: toneStyles.iconColor,
            border: `1px solid ${alpha('#111827', tone === 'dark' ? 0.04 : 0.08)}`,
          }}
        >
          {icon}
        </Box>
      </Stack>
    </Paper>
  )
}

function PlanSummaryCard({
  selectedPlan,
  onClick,
}: {
  selectedPlan: string
  onClick: () => void
}) {
  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        height: '100%',
        p: 2.2,
        borderRadius: 0,
        background: '#FFFFFF',
        border: `1px solid ${alpha(BRAND_PRIMARY, 0.2)}`,
        boxShadow: 'none',
        cursor: 'pointer',
        transition: 'border-color 160ms ease, background-color 160ms ease',
        '&:hover': {
          borderColor: BRAND_PRIMARY,
          backgroundColor: alpha(BRAND_PRIMARY, 0.025),
        },
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: '0.78rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#4B5563',
            }}
          >
            Choose Your Remittance Plan
          </Typography>
          <Typography
            sx={{
              mt: 1.1,
              fontSize: { xs: '1.1rem', md: '1.25rem' },
              fontWeight: 800,
              lineHeight: 1.2,
              color: BRAND_PRIMARY,
              overflowWrap: 'anywhere',
            }}
          >
            {selectedPlan}
          </Typography>
          <Typography sx={{ mt: 1.1, fontSize: '0.84rem', color: '#6B7280' }}>
            Click to view available plans
          </Typography>
        </Box>

        <Box
          sx={{
            width: 44,
            height: 44,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 0,
            bgcolor: alpha(BRAND_PRIMARY, 0.08),
            color: BRAND_PRIMARY,
            border: `1px solid ${alpha(BRAND_PRIMARY, 0.1)}`,
          }}
        >
          <MdEventAvailable size={24} />
        </Box>
      </Stack>
    </Paper>
  )
}

export default function CodRemittancesList() {
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false)
  const [checkedPlan, setCheckedPlan] = useState('')
  const [filters, setFilters] = useState<{
    status?: string
    fromDate?: Date
    toDate?: Date
  }>({})

  // Convert Date objects to ISO strings for API
  const apiFilters = {
    status: filters.status,
    fromDate: filters.fromDate?.toISOString(),
    toDate: filters.toDate?.toISOString(),
  }

  // Use custom hooks
  const { data: stats } = useCodStats()
  const { data: planData } = useCodRemittancePlan()
  const updatePlanMutation = useUpdateCodRemittancePlan()
  const { data, isLoading } = useCodRemittances(page, rowsPerPage, apiFilters)
  const selectedPlan = planData?.selectedPlan || 'T+4 Days (Default)'
  const planOptions = planData?.plans?.length ? planData.plans : DEFAULT_COD_PLANS
  const selectedPlanDetails =
    planOptions.find((plan) => plan.name === selectedPlan) || DEFAULT_COD_PLANS[3]

  const handleExport = async () => {
    try {
      await handleCodRemittancesExport(apiFilters)
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  const getStatusColor = (status: string) => {
    return status === 'credited' ? 'success' : 'info'
  }

  const getStatusIcon = (status: string) => {
    return status === 'credited' ? <MdCheckCircle /> : <MdHourglassEmpty />
  }

  const openPlanDialog = () => {
    setCheckedPlan(selectedPlan)
    setIsPlanDialogOpen(true)
  }

  const handleActivatePlan = async (planName = checkedPlan) => {
    if (!planName) return

    try {
      await updatePlanMutation.mutateAsync(planName)
      setCheckedPlan(planName)
      setIsPlanDialogOpen(false)
    } catch (error) {
      console.error('Failed to update COD remittance plan:', error)
    }
  }

  const filterFields: FilterField[] = [
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { label: 'All', value: '' },
        { label: 'Processing', value: 'pending' },
        { label: 'Settled', value: 'credited' },
      ],
      placeholder: 'Select status',
    },
    {
      name: 'fromDate',
      label: 'From Date',
      type: 'date',
      placeholder: 'Start date',
    },
    {
      name: 'toDate',
      label: 'To Date',
      type: 'date',
      placeholder: 'End date',
    },
  ]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: Column<any>[] = [
    {
      id: 'orderNumber',
      label: 'Order Number',
      minWidth: 150,
      render: (_, row) => (
        <Box>
          <Typography variant="body2" fontWeight={600}>
            {row.orderNumber}
          </Typography>
          {row.awbNumber && (
            <Typography variant="caption" color="text.secondary">
              AWB: <AWBLink awb={row.awbNumber} />
            </Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'courierPartner',
      label: 'Courier',
      minWidth: 120,
      render: (val) => <Typography variant="body2">{val || 'N/A'}</Typography>,
    },
    {
      id: 'codAmount',
      label: 'COD Amount',
      minWidth: 120,
      render: (val) => (
        <Typography variant="body2" fontWeight={600}>
          ₹{Number(val).toLocaleString('en-IN')}
        </Typography>
      ),
    },
    {
      id: 'deductions',
      label: 'Deductions',
      minWidth: 120,
      render: (val) => (
        <Typography variant="body2" color="error.main">
          -₹{Number(val).toLocaleString('en-IN')}
        </Typography>
      ),
    },
    {
      id: 'remittableAmount',
      label: 'Remittable',
      minWidth: 130,
      render: (val) => (
        <Typography variant="body2" fontWeight={700} color="success.main">
          ₹{Number(val).toLocaleString('en-IN')}
        </Typography>
      ),
    },
    {
      id: 'status',
      label: 'Status',
      minWidth: 130,
      render: (val) => (
        <Chip label={val} color={getStatusColor(val)} size="small" icon={getStatusIcon(val)} />
      ),
    },
    {
      id: 'collectedAt',
      label: 'Collected',
      minWidth: 120,
      render: (val) => (
        <Typography variant="body2">{val ? moment(val).format('DD MMM YYYY') : 'N/A'}</Typography>
      ),
    },
    {
      id: 'creditedAt',
      label: 'Settled At',
      minWidth: 150,
      render: (val) => (
        <Typography variant="body2">
          {val ? moment(val).format('DD MMM YYYY HH:mm') : '-'}
        </Typography>
      ),
    },
  ]

  const summaryCardsSection = (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          sm: 'repeat(2, minmax(0, 1fr))',
          lg: 'repeat(5, minmax(0, 1fr))',
        },
        gap: 3,
      }}
    >
      <Box>
        <SummaryCard
          title="Remitted Till Date"
          value={stats?.remittedTillDate || 0}
          helper={`${stats?.creditedCount || 0} settled remittances`}
          icon={<MdTrendingUp size={24} />}
          tone="dark"
        />
      </Box>

      <Box>
        <SummaryCard
          title="Last Remittance"
          value={stats?.lastRemittance || 0}
          helper="Most recent settlement"
          icon={<MdCheckCircle size={24} />}
          tone="primary"
        />
      </Box>

      <Box>
        <SummaryCard
          title="Next Remittance"
          value={stats?.nextRemittance || 0}
          helper={`${stats?.pendingCount || 0} orders pending`}
          icon={<MdAccountBalanceWallet size={24} />}
          tone="wine"
        />
      </Box>

      <Box>
        <SummaryCard
          title="Total Remittance Due"
          value={stats?.totalDue || 0}
          helper="Awaiting settlement"
          icon={<MdAccessTime size={24} />}
          tone="light"
        />
      </Box>

      <Box>
        <PlanSummaryCard selectedPlan={selectedPlan} onClick={openPlanDialog} />
      </Box>
    </Box>
  )

  const controls = (
    <Box sx={{ px: 2 }}>
      <FilterBar
        fields={filterFields}
        onApply={(appliedFilters) => {
          setFilters(appliedFilters)
          setPage(1)
        }}
        mode="button"
        buttonLabel="Filters"
        defaultValues={{
          status: '',
          fromDate: undefined,
          toDate: undefined,
        }}
        appliedCount={Object.values(filters).filter(Boolean).length}
      />
    </Box>
  )

  const table = (
    <>
      {isLoading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <Typography>Loading remittances...</Typography>
        </Box>
      ) : (
        <DataTable
          rows={data?.remittances || []}
          columns={columns}
          title="All Remittances"
          pagination
          currentPage={page}
          defaultRowsPerPage={rowsPerPage}
          totalCount={data?.totalCount || 0}
          onPageChange={(newPage) => setPage(newPage)}
          onRowsPerPageChange={(newRowsPerPage) => {
            setRowsPerPage(newRowsPerPage)
            setPage(1)
          }}
        />
      )}
    </>
  )

  return (
    <ListPageLayout
      title="COD Remittance"
      description="Track your Cash on Delivery settlements"
      actions={[
        {
          label: 'Export CSV',
          onClick: handleExport,
          icon: <MdDownload />,
          variant: 'contained',
        },
      ]}
      controls={controls}
    >
      <Box sx={{ px: 2 }}>{summaryCardsSection}</Box>
      {table}
      <Dialog
        open={isPlanDialogOpen}
        onClose={() => setIsPlanDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 800 }}>
            Early COD Remittance Plan
          </Typography>
          <Typography sx={{ mt: 0.6, color: 'text.secondary', fontSize: '0.92rem' }}>
            Choose the best payment plan for your business.
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Paper
              elevation={0}
              sx={{
                width: { xs: '100%', sm: 260 },
                p: 2,
                borderRadius: 0,
                border: `1px solid ${BRAND_PRIMARY}`,
              }}
            >
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: '#2D3748' }}>
                Current Plan
              </Typography>
              <Typography sx={{ mt: 2, fontSize: '0.86rem', color: '#2D3748' }}>
                <Box component="span" sx={{ fontWeight: 800 }}>
                  Cycle:
                </Box>{' '}
                {selectedPlan}
              </Typography>
              <Typography sx={{ mt: 2, fontSize: '0.86rem', color: '#2D3748' }}>
                <Box component="span" sx={{ fontWeight: 800 }}>
                  Frequency:
                </Box>{' '}
                {selectedPlanDetails.frequency}
              </Typography>
            </Paper>
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(4, minmax(0, 1fr))',
              },
              gap: 2.5,
              pt: 1,
            }}
          >
            {planOptions.map((plan) => {
              const isChecked = checkedPlan === plan.name

              return (
                <Paper
                  key={plan.name}
                  elevation={0}
                  sx={{
                    minHeight: 360,
                    p: 2.2,
                    borderRadius: 0,
                    border: `1px solid ${isChecked ? BRAND_PRIMARY : alpha(BRAND_PRIMARY, 0.45)}`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box>
                    <Typography sx={{ fontSize: '1.02rem', fontWeight: 800, color: '#2D3748' }}>
                      {plan.name}
                    </Typography>
                    <Typography sx={{ mt: 1.6, fontSize: '0.88rem', color: '#4B5563' }}>
                      <Box component="span" sx={{ fontWeight: 800 }}>
                        {Number(plan.chargePercent).toFixed(plan.chargePercent ? 2 : 0)}%
                      </Box>{' '}
                      of COD Amount
                    </Typography>
                    <Typography sx={{ mt: 2.2, fontSize: '0.88rem', color: '#4B5563' }}>
                      {plan.description}
                    </Typography>
                    <Typography sx={{ mt: 2.2, fontSize: '0.88rem', color: '#4B5563' }}>
                      Remittance frequency: {plan.frequency}
                    </Typography>
                    <FormControlLabel
                      sx={{ mt: 2, alignItems: 'flex-start' }}
                      control={
                        <Checkbox
                          checked={isChecked}
                          onChange={() => setCheckedPlan(plan.name)}
                          size="small"
                        />
                      }
                      label={
                        <Typography sx={{ fontSize: '0.82rem', color: '#4B5563' }}>
                          I have carefully read and agree to the Terms & Conditions
                        </Typography>
                      }
                    />
                  </Box>
                  <Button
                    variant="contained"
                    disabled={!isChecked || updatePlanMutation.isPending}
                    onClick={() => handleActivatePlan(plan.name)}
                    sx={{
                      mt: 2,
                      borderRadius: 1,
                      bgcolor: '#4864F6',
                      fontWeight: 800,
                      textTransform: 'none',
                      '&:hover': { bgcolor: '#3F57D8' },
                    }}
                  >
                    Activate
                  </Button>
                </Paper>
              )
            })}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setIsPlanDialogOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!checkedPlan || updatePlanMutation.isPending}
            onClick={() => handleActivatePlan()}
            sx={{ textTransform: 'none', bgcolor: BRAND_PRIMARY, '&:hover': { bgcolor: '#03656d' } }}
          >
            Save Plan
          </Button>
        </DialogActions>
      </Dialog>
    </ListPageLayout>
  )
}
