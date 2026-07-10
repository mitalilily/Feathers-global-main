import {
  Avatar,
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material'
import Papa from 'papaparse'
import { useMemo, useState } from 'react'
import { MdCalculate, MdDownload, MdInfoOutline, MdLocalShipping } from 'react-icons/md'
import { TbPlaneTilt } from 'react-icons/tb'
import { useNavigate } from 'react-router-dom'
import { FilterBar, type FilterField } from '../../components/FilterBar'
import ListPageLayout from '../../components/UI/layout/ListPageLayout'
import { SmartTabs } from '../../components/UI/tab/Tabs'
import TableSkeleton from '../../components/UI/table/TableSkeleton'
import { useAllCouriers, useShippingRates } from '../../hooks/Integrations/useCouriers'
import { useZones } from '../../hooks/useZones'
import { courierLogos, defaultLogo } from '../../utils/constants'

type RateSlab = {
  id?: string
  weight_from: number
  weight_to?: number | null
  rate: number
  extra_rate?: number | null
  extra_weight_unit?: number | null
}

type ZoneRateMap = {
  forward?: number | string
  rto?: number | string
  reverse?: number | string
  description?: string
  forward_per_kg?: number | string
  rto_per_kg?: number | string
  reverse_per_kg?: number | string
  min_weight?: number
}

type ShippingRate = {
  id: string | number
  courier_id?: number | null
  courier_name: string
  service_provider?: string | null
  mode: string
  min_weight: number
  cod_charges?: number | string
  cod_percent?: number | string
  other_charges?: number | string
  rates: Record<string, ZoneRateMap>
  zone_slabs?: Record<string, Partial<Record<'forward' | 'rto' | 'reverse_pickup', RateSlab[]>>>
}

type ZoneItem = {
  id?: string
  code?: string
  name: string
  description?: string
}

type RateMatrixRow = {
  id: string
  isPrimary: boolean
  courierLabel?: string
  mode: string
  weightLabel: string
  zoneValues: Record<string, string>
  codLabel: string
  otherLabel: string
  badgeLabel?: string
}

const BORDER = 'rgba(15, 23, 42, 0.08)'
const HEADER_BG = '#E9EFF6'
const HEADER_TEXT = '#314158'
const SUBHEADER_TEXT = '#66758B'
const ROW_ALT = '#F7FAFD'
const TEXT_PRIMARY = '#132238'
const TEXT_MUTED = '#6A7B91'
const TEAL = '#08B7A5'
const ZONE_ORDER = [
  'WITHIN_CITY',
  'WITHIN_STATE',
  'METRO_TO_METRO',
  'ROI',
  'SPECIAL_ZONE',
  'WITHIN_REGION',
]

const getCourierLogo = (name: string) =>
  Object.entries(courierLogos || {}).find(([key]) => name.toLowerCase().includes(key.toLowerCase()))?.[1] ??
  defaultLogo

const formatCurrency = (value: unknown, allowNA = true) => {
  if (value === null || value === undefined || value === '') return allowNA ? 'NA' : '0'
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return allowNA ? 'NA' : '0'
  return Number.isInteger(parsed) ? parsed.toString() : parsed.toFixed(2)
}

const pickZoneRateValue = (
  zoneRates: ZoneRateMap | undefined,
  keys: Array<keyof ZoneRateMap>,
): number | string => {
  for (const key of keys) {
    const value = zoneRates?.[key]
    if (value !== undefined && value !== null && value !== '') {
      return value
    }
  }

  return 'NA'
}

const getForwardRateValue = (zoneRates: ZoneRateMap | undefined, businessType: 'b2b' | 'b2c') =>
  pickZoneRateValue(zoneRates, businessType === 'b2b' ? ['forward_per_kg', 'forward'] : ['forward'])

const getRtoRateValue = (zoneRates: ZoneRateMap | undefined, businessType: 'b2b' | 'b2c') =>
  pickZoneRateValue(zoneRates, businessType === 'b2b' ? ['rto_per_kg', 'rto'] : ['rto'])

const getReverseRateValue = (zoneRates: ZoneRateMap | undefined, businessType: 'b2b' | 'b2c') =>
  pickZoneRateValue(
    zoneRates,
    businessType === 'b2b'
      ? ['reverse_per_kg', 'reverse', 'rto_per_kg', 'rto']
      : ['reverse', 'rto'],
  )

const formatZoneRateSummary = (forward: unknown, rto: unknown, reverse: unknown) =>
  `F: ${formatCurrency(forward)} | RTO: ${formatCurrency(rto)} | Reverse: ${formatCurrency(reverse)}`

const formatWeightUnit = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '-'
  if (value < 1) return `${value.toFixed(2)} kg`
  if (Number.isInteger(value)) return `${value.toFixed(0)} kg`
  return `${value.toFixed(2)} kg`
}

const formatBaseWeightLabel = (slab: RateSlab) => {
  const weightTo = slab.weight_to ?? null
  if (slab.weight_from <= 0 && weightTo && weightTo > 0) {
    return `Per ${formatWeightUnit(weightTo)}`
  }
  if (weightTo && weightTo > slab.weight_from) {
    return `${formatWeightUnit(slab.weight_from)} to ${formatWeightUnit(weightTo)}`
  }
  return `Per ${formatWeightUnit(weightTo ?? slab.weight_from)}`
}

const formatAdditionalWeightLabel = (slab: RateSlab) => {
  const extraWeight = Number(slab.extra_weight_unit ?? 0)
  if (extraWeight > 0) return `additional Per ${formatWeightUnit(extraWeight)}`
  return 'additional'
}

const slabKey = (slab: RateSlab) => `${slab.weight_from}|${slab.weight_to ?? 'open'}`

const getMatchingZoneSlab = (
  rate: ShippingRate,
  zoneName: string,
  slabType: 'forward' | 'rto' | 'reverse_pickup',
  rangeKey: string,
) => rate.zone_slabs?.[zoneName]?.[slabType]?.find((candidate) => slabKey(candidate) === rangeKey)

const sortZones = (zones: ZoneItem[]) =>
  [...zones].sort((left, right) => {
    const leftIndex = ZONE_ORDER.indexOf(String(left.code || '').toUpperCase())
    const rightIndex = ZONE_ORDER.indexOf(String(right.code || '').toUpperCase())
    const safeLeft = leftIndex >= 0 ? leftIndex : ZONE_ORDER.length + 1
    const safeRight = rightIndex >= 0 ? rightIndex : ZONE_ORDER.length + 1
    if (safeLeft !== safeRight) return safeLeft - safeRight
    return String(left.name || '').localeCompare(String(right.name || ''))
  })

const buildZoneMeta = (zone: ZoneItem, index: number) => ({
  key: zone.id || zone.code || zone.name,
  title: `ZONE ${String.fromCharCode(65 + index)}`,
  subtitle: zone.name,
  note: zone.description || '',
})

const getRepresentativeForwardSlabs = (rate: ShippingRate, zones: ZoneItem[]) => {
  for (const zone of zones) {
    const slabs = rate.zone_slabs?.[zone.name]?.forward || []
    if (slabs.length) return slabs
  }
  return []
}

const buildB2CMatrixRows = (rate: ShippingRate, zones: ZoneItem[]): RateMatrixRow[] => {
  const forwardSlabs = getRepresentativeForwardSlabs(rate, zones)
  const rows: RateMatrixRow[] = []
  const codLabel = `${formatCurrency(rate.cod_charges, false)} | ${formatCurrency(rate.cod_percent, false)}`
  const otherLabel =
    rate.other_charges === null || rate.other_charges === undefined || rate.other_charges === ''
      ? 'NA'
      : formatCurrency(rate.other_charges, false)

  if (!forwardSlabs.length) {
    rows.push({
      id: `${rate.id}-fallback`,
      isPrimary: true,
      courierLabel: rate.courier_name,
      mode: rate.mode,
      weightLabel: rate.min_weight ? `Per ${formatWeightUnit(rate.min_weight)}` : 'Base rate',
      zoneValues: Object.fromEntries(
        zones.map((zone) => {
          const zoneRates = rate.rates?.[zone.name]
          return [
            zone.id || zone.code || zone.name,
            formatZoneRateSummary(
              getForwardRateValue(zoneRates, 'b2c'),
              getRtoRateValue(zoneRates, 'b2c'),
              getReverseRateValue(zoneRates, 'b2c'),
            ),
          ]
        }),
      ),
      codLabel,
      otherLabel,
      badgeLabel: 'Forward',
    })
    return rows
  }

  forwardSlabs.forEach((slab, index) => {
    const rangeKey = slabKey(slab)
    rows.push({
      id: `${rate.id}-${rangeKey}-base`,
      isPrimary: index === 0,
      courierLabel: index === 0 ? rate.courier_name : undefined,
      mode: rate.mode,
      weightLabel: formatBaseWeightLabel(slab),
      zoneValues: Object.fromEntries(
        zones.map((zone) => {
          const forwardSlab = getMatchingZoneSlab(rate, zone.name, 'forward', rangeKey) || slab
          const rtoSlab = getMatchingZoneSlab(rate, zone.name, 'rto', rangeKey)
          const reverseSlab = getMatchingZoneSlab(rate, zone.name, 'reverse_pickup', rangeKey)
          return [
            zone.id || zone.code || zone.name,
            formatZoneRateSummary(
              forwardSlab.rate,
              rtoSlab?.rate,
              reverseSlab?.rate ?? rtoSlab?.rate,
            ),
          ]
        }),
      ),
      codLabel,
      otherLabel,
      badgeLabel: index === 0 ? 'Forward' : undefined,
    })

    if (Number(slab.extra_rate ?? 0) > 0) {
      rows.push({
        id: `${rate.id}-${rangeKey}-additional`,
        isPrimary: false,
        mode: rate.mode,
        weightLabel: formatAdditionalWeightLabel(slab),
        zoneValues: Object.fromEntries(
          zones.map((zone) => {
            const forwardSlab = getMatchingZoneSlab(rate, zone.name, 'forward', rangeKey) || slab
            const rtoSlab = getMatchingZoneSlab(rate, zone.name, 'rto', rangeKey)
            const reverseSlab = getMatchingZoneSlab(rate, zone.name, 'reverse_pickup', rangeKey)
            return [
              zone.id || zone.code || zone.name,
              formatZoneRateSummary(
                forwardSlab.extra_rate,
                rtoSlab?.extra_rate,
                reverseSlab?.extra_rate ?? rtoSlab?.extra_rate,
              ),
            ]
          }),
        ),
        codLabel,
        otherLabel,
      })
    }
  })

  return rows
}

const buildB2BMatrixRows = (rate: ShippingRate, zones: ZoneItem[]): RateMatrixRow[] => [
  {
    id: `${rate.id}-b2b`,
    isPrimary: true,
    courierLabel: rate.courier_name,
    mode: rate.mode,
    weightLabel: rate.min_weight ? `Per ${formatWeightUnit(rate.min_weight)}` : 'Per kg',
    zoneValues: Object.fromEntries(
      zones.map((zone) => {
        const zoneRate = rate.rates?.[zone.name] || {}
        return [
          zone.id || zone.code || zone.name,
          formatZoneRateSummary(
            getForwardRateValue(zoneRate, 'b2b'),
            getRtoRateValue(zoneRate, 'b2b'),
            getReverseRateValue(zoneRate, 'b2b'),
          ),
        ]
      }),
    ),
    codLabel: `${formatCurrency(rate.cod_charges, false)} | ${formatCurrency(rate.cod_percent, false)}`,
    otherLabel:
      rate.other_charges === null || rate.other_charges === undefined || rate.other_charges === ''
        ? 'NA'
        : formatCurrency(rate.other_charges, false),
    badgeLabel: 'Rate',
  },
]

const ModeBadge = ({ mode }: { mode: string }) => {
  const normalized = String(mode || '').toLowerCase()
  const isAir = normalized === 'air'
  const Icon = isAir ? TbPlaneTilt : MdLocalShipping
  return (
    <Box
      sx={{
        width: 34,
        height: 34,
        borderRadius: '10px',
        border: `1px solid ${alpha('#0f172a', 0.08)}`,
        backgroundColor: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: isAir ? '#355DFF' : '#44546F',
      }}
    >
      <Icon size={18} />
    </Box>
  )
}

const CourierCell = ({
  label,
  badgeLabel,
}: {
  label?: string
  badgeLabel?: string
}) => {
  if (!label) return null
  return (
    <Stack spacing={0.8}>
      <Stack direction="row" spacing={1.2} alignItems="center">
        <Avatar
          src={getCourierLogo(label)}
          alt={label}
          sx={{
            width: 32,
            height: 32,
            borderRadius: '10px',
            border: `1px solid ${alpha('#0f172a', 0.08)}`,
          }}
        />
        <Typography sx={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: '0.92rem' }}>{label}</Typography>
      </Stack>
      {badgeLabel ? (
        <Chip
          label={badgeLabel}
          size="small"
          sx={{
            width: 'fit-content',
            height: 24,
            borderRadius: '999px',
            backgroundColor: alpha(TEAL, 0.14),
            color: TEAL,
            fontWeight: 700,
            fontSize: '0.72rem',
          }}
        />
      ) : null}
    </Stack>
  )
}

const RateMatrixTable = ({
  businessType,
  rates,
  zones,
}: {
  businessType: 'b2c' | 'b2b'
  rates: ShippingRate[]
  zones: ZoneItem[]
}) => {
  const orderedZones = useMemo(() => sortZones(zones), [zones])
  const zoneColumns = orderedZones.map(buildZoneMeta)

  const groupedRates = useMemo(
    () =>
      rates.map((rate) => ({
        key: `${rate.courier_id || rate.courier_name}-${rate.mode}-${rate.service_provider || 'na'}`,
        rate,
        rows:
          businessType === 'b2c'
            ? buildB2CMatrixRows(rate, orderedZones)
            : buildB2BMatrixRows(rate, orderedZones),
      })),
    [businessType, orderedZones, rates],
  )

  if (!groupedRates.length) {
    return (
      <Box
        sx={{
          borderRadius: 3,
          border: `1px solid ${BORDER}`,
          backgroundColor: '#fff',
          px: 3,
          py: 7,
          textAlign: 'center',
        }}
      >
        <Typography sx={{ fontWeight: 700, color: TEXT_PRIMARY, mb: 0.8 }}>
          No rate rows available for this selection
        </Typography>
        <Typography sx={{ color: TEXT_MUTED, fontSize: '0.92rem' }}>
          Try switching the business type or clearing courier filters.
        </Typography>
      </Box>
    )
  }

  return (
    <TableContainer
      sx={{
        borderRadius: 3,
        border: `1px solid ${BORDER}`,
        backgroundColor: '#fff',
        overflowX: 'auto',
        boxShadow: '0 18px 36px rgba(15, 23, 42, 0.05)',
      }}
    >
      <Table sx={{ minWidth: 1320 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={headerCellSx({ minWidth: 280 })}>Couriers</TableCell>
            <TableCell sx={headerCellSx({ minWidth: 86, textAlign: 'center' })}>Mode</TableCell>
            <TableCell sx={headerCellSx({ minWidth: 180 })}>Weight</TableCell>
            {zoneColumns.map((zone) => (
              <TableCell key={zone.key} sx={headerCellSx({ minWidth: 138, textAlign: 'center' })}>
                <Stack spacing={0.15}>
                  <Typography sx={headerTitleSx}>{zone.title}</Typography>
                  <Typography sx={headerSubtitleSx}>{zone.subtitle}</Typography>
                  <Typography sx={{ ...headerSubtitleSx, fontSize: '0.68rem' }}>F | RTO | Reverse</Typography>
                </Stack>
              </TableCell>
            ))}
            <TableCell sx={headerCellSx({ minWidth: 178, textAlign: 'center' })}>
              <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                <Typography sx={headerTitleSx}>COD Charges / COD %</Typography>
                <Tooltip title="Fixed COD charge and COD percentage for each courier rate card." arrow>
                  <Box component="span" sx={{ display: 'inline-flex', color: HEADER_TEXT }}>
                    <MdInfoOutline size={16} />
                  </Box>
                </Tooltip>
              </Stack>
            </TableCell>
            <TableCell sx={headerCellSx({ minWidth: 124, textAlign: 'center' })}>Other Charges</TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {groupedRates.map(({ key, rows }) =>
            rows.map((row, rowIndex) => (
              <TableRow
                key={row.id}
                sx={{
                  backgroundColor: rowIndex % 2 === 1 ? ROW_ALT : '#fff',
                  '&:last-child td': {
                    borderBottom: key === groupedRates[groupedRates.length - 1]?.key ? 0 : undefined,
                  },
                }}
              >
                <TableCell sx={bodyCellSx({ verticalAlign: row.isPrimary ? 'middle' : 'top' })}>
                  {row.isPrimary ? <CourierCell label={row.courierLabel} badgeLabel={row.badgeLabel} /> : null}
                </TableCell>
                <TableCell sx={bodyCellSx({ textAlign: 'center' })}>
                  <ModeBadge mode={row.mode} />
                </TableCell>
                <TableCell sx={bodyCellSx()}>
                  <Typography sx={{ color: TEXT_PRIMARY, fontWeight: row.isPrimary ? 600 : 500, fontSize: '0.88rem' }}>
                    {row.weightLabel}
                  </Typography>
                </TableCell>
                {zoneColumns.map((zone) => (
                  <TableCell key={`${row.id}-${zone.key}`} sx={bodyNumericCellSx}>
                    {row.zoneValues[zone.key] ?? 'NA'}
                  </TableCell>
                ))}
                <TableCell sx={bodyNumericCellSx}>{row.codLabel}</TableCell>
                <TableCell sx={bodyNumericCellSx}>{row.otherLabel}</TableCell>
              </TableRow>
            )),
          )}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

const headerCellSx = (extra: Record<string, unknown> = {}) => ({
  backgroundColor: HEADER_BG,
  color: HEADER_TEXT,
  fontWeight: 800,
  borderBottom: `1px solid ${BORDER}`,
  py: 2,
  px: 1.75,
  ...extra,
})

const headerTitleSx = {
  fontWeight: 800,
  fontSize: '0.82rem',
  letterSpacing: 0,
  color: HEADER_TEXT,
}

const headerSubtitleSx = {
  fontWeight: 600,
  fontSize: '0.72rem',
  lineHeight: 1.2,
  color: SUBHEADER_TEXT,
}

const bodyCellSx = (extra: Record<string, unknown> = {}) => ({
  borderBottom: `1px solid ${BORDER}`,
  py: 1.8,
  px: 1.75,
  verticalAlign: 'middle',
  ...extra,
})

const bodyNumericCellSx = {
  ...bodyCellSx({ textAlign: 'center' }),
  color: TEXT_PRIMARY,
  fontWeight: 600,
  fontSize: '0.88rem',
}

const RateCard = () => {
  const navigate = useNavigate()
  const [businessType, setBusinessType] = useState<'b2c' | 'b2b'>('b2c')
  const [filters, setFilters] = useState({
    courier: [] as string[],
    min_weight: '',
  })

  const { zones } = useZones(businessType)
  const { data: couriers } = useAllCouriers()
  const { data, isLoading, isError } = useShippingRates({
    ...filters,
    businessType,
    min_weight: filters.min_weight ? Number(filters.min_weight) : undefined,
  })

  const rates: ShippingRate[] = Array.isArray(data) ? data : []
  const normalizedCouriers = Array.isArray(couriers)
    ? couriers.map((courier: any) =>
        typeof courier === 'string'
          ? { label: courier, value: courier }
          : { label: courier?.name || String(courier?.id || ''), value: courier?.name || String(courier?.id || '') },
      )
    : []

  const handleExportCSV = () => {
    const csvData = rates.map((rate) => {
      const base: Record<string, unknown> = {
        Courier: rate.courier_name,
        Mode: rate.mode,
        Weight: rate.min_weight ? `Per ${formatWeightUnit(rate.min_weight)}` : 'Base rate',
        'COD Charges': rate.cod_charges ?? 'NA',
        'COD %': rate.cod_percent ?? 'NA',
        'Other Charges': rate.other_charges ?? 'NA',
      }

      sortZones(Array.isArray(zones) ? zones : []).forEach((zone) => {
        const zoneKey = zone.name
        const zoneRates = rate.rates?.[zoneKey] || {}
        base[zone.name] =
          businessType === 'b2c'
            ? formatZoneRateSummary(
                getForwardRateValue(zoneRates, 'b2c'),
                getRtoRateValue(zoneRates, 'b2c'),
                getReverseRateValue(zoneRates, 'b2c'),
              )
            : formatZoneRateSummary(
                getForwardRateValue(zoneRates, 'b2b'),
                getRtoRateValue(zoneRates, 'b2b'),
                getReverseRateValue(zoneRates, 'b2b'),
              )
      })

      return base
    })

    const csv = Papa.unparse(csvData)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', `rate_card_${businessType}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const filterFields: FilterField[] = [
    {
      name: 'courier',
      label: 'Courier',
      type: 'multiselect',
      options: normalizedCouriers,
    },
    {
      name: 'min_weight',
      label: businessType === 'b2c' ? 'Minimum slab' : 'Min weight (kg)',
      type: 'text',
      placeholder: businessType === 'b2c' ? 'e.g. 0.5 or 2' : 'Enter min weight',
    },
  ]

  const controls = (
    <Box sx={{ px: 0.5 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'center' }}
        spacing={2}
      >
        <SmartTabs
          tabs={[
            { label: 'B2C', value: 'b2c' },
            { label: 'B2B', value: 'b2b' },
          ]}
          value={businessType}
          onChange={(value) => setBusinessType(value)}
        />

        <FilterBar
          fields={filterFields}
          defaultValues={filters}
          onApply={(applied) => {
            setFilters({
              courier: Array.isArray(applied?.courier)
                ? applied.courier.map((item: any) => item?.value || item?.label || String(item))
                : [],
              min_weight: String(applied?.min_weight || ''),
            })
          }}
          mode="button"
          buttonLabel="Filters"
          appliedCount={Object.values(filters).filter((value) =>
            Array.isArray(value) ? value.length > 0 : Boolean(value),
          ).length}
        />
      </Stack>
    </Box>
  )

  return (
    <ListPageLayout
      title="Rate Card"
      description="A courier-by-courier rate matrix with slab rows, zone visibility, and billing details."
      actions={[
        {
          label: 'Calculate Rates',
          onClick: () => navigate('/tools/rate_calculator'),
          icon: <MdCalculate />,
          variant: 'outlined',
        },
        {
          label: 'Download Rate Card',
          onClick: handleExportCSV,
          icon: <MdDownload />,
          variant: 'contained',
        },
      ]}
      controls={controls}
    >
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <Typography color="error">Error loading shipping rates</Typography>
      ) : (
        <RateMatrixTable
          businessType={businessType}
          rates={rates}
          zones={Array.isArray(zones) ? zones : []}
        />
      )}
    </ListPageLayout>
  )
}

export default RateCard
