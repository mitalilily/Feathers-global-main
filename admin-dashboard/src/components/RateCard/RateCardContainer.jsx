import {
  Box,
  Button,
  Divider,
  Flex,
  Grid,
  HStack,
  Select,
  Stack,
  Tab,
  TabList,
  Tabs,
  Tag,
  Text,
  useToast,
} from '@chakra-ui/react'
import { IconUpload } from '@tabler/icons-react'
import Papa from 'papaparse'
import { useEffect, useMemo, useState } from 'react'

import CustomModal from 'components/Modal/CustomModal'
import { RateCardEditModal } from 'components/Modal/RateCardEditModal'
import TableFilters from 'components/Tables/TableFilters'
import FileUploader from 'components/upload/FileUploader'
import ZoneRateMatrix from 'views/B2B/ZoneRateMatrix'
import { RateCardTable } from './RateCardTable'

import { AddIcon } from '@chakra-ui/icons'
import { useQuery } from '@tanstack/react-query'
import { useImportShippingRates, useShippingRates } from 'hooks/useCouriers'
import { useZones } from 'hooks/useZones'
import { fetchAllCouriersList } from 'services/courier.service'
import { PlansService } from 'services/plan.service'

const normalizeProvider = (value) => String(value || '').trim().toLowerCase()
const normalizeCourierName = (value) => String(value || '').trim().toLowerCase()

const B2C_ZONE_LABELS = {
  METRO_TO_METRO: 'Metro to Metro',
  ROI: 'Rest of India',
  SPECIAL_ZONE: 'Special Zone',
  WITHIN_CITY: 'Within City',
  WITHIN_REGION: 'Within Region',
  WITHIN_STATE: 'Within State',
}

const normalizeMode = (value) => {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''
  if (['air', 'a', 'express'].includes(raw)) return 'air'
  if (['surface', 's', 'ground'].includes(raw)) return 'surface'
  return raw
}

const canonicalZoneCode = (value) => String(value || '').trim().toUpperCase().replace(/_B2C$/, '')

const getB2CZoneLabel = (zone = {}) =>
  B2C_ZONE_LABELS[canonicalZoneCode(zone.code)] || zone.name || zone.region || zone.code || ''

const dedupeB2CZones = (zones = []) => {
  const seenLabels = new Set()

  return zones.filter((zone) => {
    const label = getB2CZoneLabel(zone)
    if (!label || seenLabels.has(label)) return false
    seenLabels.add(label)
    return true
  })
}

const getZoneLookupKeys = (zone = {}) =>
  Array.from(new Set([getB2CZoneLabel(zone), zone.name, zone.region].filter(Boolean)))

const getZoneSlabs = (existing = {}, zone = {}, type = 'forward') => {
  for (const key of getZoneLookupKeys(zone)) {
    const slabs = existing.zone_slabs?.[key]?.[type]
    if (Array.isArray(slabs) && slabs.length) return slabs
  }

  return []
}

const findMatchingRateRow = (existingRows = [], courier = {}, businessType = '', planId = '') => {
  const matches = existingRows.filter(
    (row) =>
      row.business_type === businessType &&
      (!planId || row.plan_id === planId) &&
      Number(row.courier_id) === Number(courier.id) &&
      normalizeProvider(row.service_provider || row.serviceProvider || '') ===
        normalizeProvider(courier.serviceProvider || courier.service_provider || ''),
  )

  if (!matches.length) return null

  const courierMode = normalizeMode(courier.mode || '')
  if (courierMode) {
    const modeMatch = matches.find((row) => normalizeMode(row.mode || '') === courierMode)
    if (modeMatch) return modeMatch
  }

  const courierName = normalizeCourierName(courier.name || courier.courier_name || '')
  if (courierName) {
    const nameMatch = matches.find(
      (row) => normalizeCourierName(row.courier_name || row.courierName || '') === courierName,
    )
    if (nameMatch) return nameMatch
  }

  return matches[0] || null
}

// Default slab weights used in the B2C sample template
const DEFAULT_B2C_SLABS = [
  { label: '250 GM', weight: 0.25 },
  { label: '500 GM', weight: 0.5 },
  { label: '1 KG', weight: 1.0 },
  { label: '2 Kg', weight: 2.0 },
  { label: '5 Kg', weight: 5.0 },
  { label: '10 Kg', weight: 10.0 },
]
const DEFAULT_B2C_RTO_PERCENT = '100'
const DEFAULT_B2C_REVERSE_PICKUP_PERCENT = '100'

const weightLabel = (kg) => {
  if (kg < 1) return `${Math.round(kg * 1000)} GM`
  return `${kg} Kg`
}

const slugifyFilenamePart = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'courier'

const getImportCourierKey = (courier = {}) =>
  [courier.id, courier.serviceProvider || courier.service_provider || '', courier.mode || '']
    .map((value) => String(value || '').trim())
    .join('|')

const getImportCourierLabel = (courier = {}) => {
  const serviceProvider = courier.serviceProvider || courier.service_provider || 'provider'
  const mode = courier.mode || 'surface'
  return `${courier.name || 'Courier'} | ${serviceProvider} | ${mode}`
}

const triggerDownload = (csv, filename) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// CSV exporter — slab-per-row format for B2C, flat for B2B
const downloadCSV = (
  allCouriers = [],
  allZones = [],
  existingData = [],
  filters = {},
  targetCourier = null,
) => {
  if (!allCouriers?.length || !allZones?.length) return
  const type = filters?.businessType?.toLowerCase()
  const selectedCouriers = targetCourier ? [targetCourier] : allCouriers
  const filenameSuffix = targetCourier ? `_${slugifyFilenamePart(targetCourier.name)}` : ''

  if (type === 'b2c') {
    const b2cZones = dedupeB2CZones(allZones)
    if (!b2cZones.length) return

    const headers = [
      'Slab', 'Courier ID', 'Courier', 'Service Provider', 'Mode', 'Weight (KG)', 'Slab Type',
      ...b2cZones.map((zone) => getB2CZoneLabel(zone)),
      'COD Rs', 'COD %', 'RTO %', 'Reverse Pickup %',
    ]

    const rows = []

    for (const courier of selectedCouriers) {
      const existing = findMatchingRateRow(existingData, courier, type, filters.planId) || {}
      const mode = normalizeMode(courier.mode || existing.mode || '') || 'surface'

      // Derive RTO% and reverse pickup % from first zone slab pair
      let rtoPercent = ''
      let reversePickupPercent = ''
      const firstZone = b2cZones[0]
      const exFwd = getZoneSlabs(existing, firstZone, 'forward')
      const exRto = getZoneSlabs(existing, firstZone, 'rto')
      const exReversePickup = getZoneSlabs(existing, firstZone, 'reverse_pickup')
      if (exFwd.length && exRto.length) {
        const fRate = Number(exFwd[0]?.rate || 0)
        const rRate = Number(exRto[0]?.rate || 0)
        if (fRate > 0) rtoPercent = String(Math.round((rRate / fRate) * 100))
      }
      if (exFwd.length && exReversePickup.length) {
        const fRate = Number(exFwd[0]?.rate || 0)
        const reversePickupRate = Number(exReversePickup[0]?.rate || 0)
        if (fRate > 0) reversePickupPercent = String(Math.round((reversePickupRate / fRate) * 100))
      }
      if (!rtoPercent) rtoPercent = DEFAULT_B2C_RTO_PERCENT
      if (!reversePickupPercent) {
        reversePickupPercent = rtoPercent || DEFAULT_B2C_REVERSE_PICKUP_PERCENT
      }

      // Build slab list from existing forward slabs or defaults
      const slabDefs = exFwd.length
        ? exFwd.map((s) => ({ label: weightLabel(Number(s.weight_to || s.weight_from || 0)), weight: Number(s.weight_to || s.weight_from || 0) }))
        : DEFAULT_B2C_SLABS

      const codRs = existing.cod_charges ?? ''
      const codPct = existing.cod_percent ?? ''

      for (let i = 0; i < slabDefs.length; i++) {
        const slab = slabDefs[i]
        const firstZoneRates = b2cZones.map((zone) => getZoneSlabs(existing, zone, 'forward')[i]?.rate ?? '')
        const addZoneRates = b2cZones.map(
          (zone) => getZoneSlabs(existing, zone, 'forward')[i]?.extra_rate ?? '',
        )

        rows.push([slab.label, courier.id ?? '', courier.name ?? '', courier.serviceProvider || courier.service_provider || existing.service_provider || '', mode, slab.weight, 'First', ...firstZoneRates, codRs, codPct, rtoPercent, reversePickupPercent])
        rows.push([slab.label, courier.id ?? '', courier.name ?? '', courier.serviceProvider || courier.service_provider || existing.service_provider || '', mode, slab.weight, 'Additional', ...addZoneRates, '', '', '', ''])
      }
    }

    triggerDownload(
      Papa.unparse({ fields: headers, data: rows }),
      `shipping_rate_card_b2c${filenameSuffix}.csv`,
    )
    return
  }

  if (type === 'b2b') {
    const baseHeaders = ['Courier ID', 'Courier Name', 'Service Provider', 'Mode', 'Business Type']
    const headers = [
      ...baseHeaders, 'Min Weight',
      ...allZones.flatMap((z) => [`${z.name} (Per Kg Forward)`, `${z.name} (Per Kg RTO)`]),
      'COD Charges', 'COD Percent', 'Other Charges',
    ]
    const rows = selectedCouriers.map((courier) => {
      const row = findMatchingRateRow(existingData, courier, type, filters.planId) || {}
      const zoneValues = allZones.flatMap((zone) => {
        const zr = row.rates?.[zone.name] || {}
        return [zr.forward_per_kg ?? '', zr.rto_per_kg ?? '']
      })
      return [courier.id ?? row.courier_id ?? '', courier.name ?? row.courier_name ?? '', courier.serviceProvider || row.service_provider || '', normalizeMode(courier.mode || row.mode || ''), type, row.min_weight || '', ...zoneValues, row.cod_charges ?? '', row.cod_percent ?? '', row.other_charges ?? '']
    })
    triggerDownload(
      Papa.unparse({ fields: headers, data: rows }),
      `shipping_rate_card_b2b${filenameSuffix}.csv`,
    )
    return
  }
}

export const RateCardContainer = ({ forceBusinessType = null, embedded = false }) => {
  const toast = useToast()

  const businessTypes = ['B2B', 'B2C']
  // If forceBusinessType is provided, use it; otherwise allow switching
  const forcedIndex = forceBusinessType
    ? businessTypes.indexOf(forceBusinessType.toUpperCase())
    : -1
  const [businessTypeIndex, setBusinessTypeIndex] = useState(forcedIndex >= 0 ? forcedIndex : 0)

  const selectedBusinessType = businessTypes[businessTypeIndex].toLowerCase()
  const isB2BSelected = selectedBusinessType === 'b2b'

  const { data: courierList } = useQuery({
    queryKey: ['all-couriers', selectedBusinessType],
    queryFn: () => fetchAllCouriersList({ businessType: selectedBusinessType }),
  })

  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: () => PlansService.getPlans(),
  })

  const { mutate: importRates, isPending: isImporting } = useImportShippingRates()

  // Prevent changing business type if forced
  useEffect(() => {
    if (forceBusinessType && businessTypeIndex !== forcedIndex) {
      setBusinessTypeIndex(forcedIndex)
    }
  }, [forceBusinessType, forcedIndex, businessTypeIndex])
  const { zones } = useZones(businessTypes[businessTypeIndex])
  const [userFilters, setUserFilters] = useState({})
  const [selectedRate, setSelectedRate] = useState(null)
  const [isModalOpen, setModalOpen] = useState(false)
  const [isImportModalOpen, setImportModalOpen] = useState(false)
  const [importScope, setImportScope] = useState('all')
  const [selectedImportCourierKey, setSelectedImportCourierKey] = useState('')

  // Default to first plan if available
  const [selectedPlanId, setSelectedPlanId] = useState('')

  // Update selectedPlanId when plans load - default to first plan
  useEffect(() => {
    if (plans?.length > 0) {
      // Always set to first plan if not set, or if current selection is invalid
      if (!selectedPlanId || !plans.find((p) => p.id === selectedPlanId)) {
        setSelectedPlanId(plans[0].id)
      }
    }
  }, [plans, selectedPlanId])

  // Combine user filters with internal query constraints for API
  const queryFilters = useMemo(() => {
    const combined = { ...userFilters, businessType: selectedBusinessType }
    if (selectedBusinessType === 'b2c' && selectedPlanId) {
      combined.planId = selectedPlanId
    }
    return combined
  }, [userFilters, selectedBusinessType, selectedPlanId])

  const { data, isLoading } = useShippingRates(queryFilters)

  const importCourierOptions = useMemo(
    () =>
      (courierList || []).map((courier) => ({
        ...courier,
        importKey: getImportCourierKey(courier),
        importLabel: getImportCourierLabel(courier),
      })),
    [courierList],
  )

  const selectedImportCourier = useMemo(
    () =>
      importScope === 'single'
        ? importCourierOptions.find((courier) => courier.importKey === selectedImportCourierKey) ||
          null
        : null,
    [importScope, importCourierOptions, selectedImportCourierKey],
  )

  const openEditModal = (row) => {
    setSelectedRate(row)
    setModalOpen(true)
  }

  const openAddModal = () => {
    // Ensure planId is set before opening modal for new rate
    if (!selectedPlanId && plans?.length > 0) {
      setSelectedPlanId(plans[0].id)
    }
    setSelectedRate(null)
    setModalOpen(true)
  }

  const handleImportRates = () => setImportModalOpen(true)

  const handleTemplateDownload = () => {
    if (importScope === 'single' && !selectedImportCourier) {
      toast({
        title: 'Select a courier first',
        description:
          'Choose the courier you want to import before downloading the single-courier template.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
      return
    }

    downloadCSV(
      courierList || [],
      zones || [],
      data || [],
      queryFilters,
      selectedImportCourier,
    )
  }

  const filterOptions = useMemo(
    () => {
      const options = [
        {
          key: 'courier_name',
          label: 'Courier',
          type: 'multiselect',
          options: courierList?.map((c) => ({ label: c?.name, value: c?.name })) || [],
        },
        {
          key: 'mode',
          label: 'Mode',
          type: 'select',
          options: [
            { label: 'Air', value: 'air' },
            { label: 'Surface', value: 'surface' },
          ],
        },
      ]

      if (selectedBusinessType !== 'b2c') {
        options.push({ key: 'min_weight', label: 'Min Weight', type: 'text' })
      }

      options.push({
        key: 'zone',
        label: 'Zone',
        type: 'multiselect',
        options: zones?.map((zone) => ({ label: zone.name, value: zone.code })) || [],
      })

      return options
    },
    [courierList, selectedBusinessType, zones],
  )

  return (
    <Flex
      direction="column"
      pt={embedded ? 0 : { base: '120px', md: '75px' }}
      gap={embedded ? 3 : 4}
    >
      {/* Business Type Tabs - Only show if not forced */}
      {!forceBusinessType && (
        <Tabs
          variant="solid-rounded"
          colorScheme="brand"
          index={businessTypeIndex}
          onChange={setBusinessTypeIndex}
          mb={2}
        >
          <TabList gap={2}>
            <Tab
              flex={1}
              px={6}
              py={4}
              borderRadius="lg"
              alignItems="flex-start"
              _selected={{ bg: 'white', shadow: 'md', color: 'brand.600', cursor: 'pointer' }}
              _focus={{ boxShadow: 'none' }}
            >
              <Stack spacing={1} align="flex-start" width="100%">
                <HStack spacing={2}>
                  <Tag colorScheme="blue" size="sm">
                    B2B
                  </Tag>
                  <Text fontWeight="semibold">Enterprise Rate Card</Text>
                </HStack>
                <Text fontSize="sm" color="gray.600">
                  Zone-based pricing that maps by state and integrates with your matrix rates.
                </Text>
              </Stack>
            </Tab>

            <Tab
              flex={1}
              px={6}
              py={4}
              borderRadius="lg"
              alignItems="flex-start"
              _selected={{ bg: 'white', shadow: 'md', color: 'brand.600', cursor: 'pointer' }}
              _focus={{ boxShadow: 'none' }}
            >
              <Stack spacing={1} align="flex-start" width="100%">
                <HStack spacing={2}>
                  <Tag colorScheme="purple" size="sm">
                    B2C
                  </Tag>
                  <Text fontWeight="semibold">Retail Rate Card</Text>
                </HStack>
                <Text fontSize="sm" color="gray.600">
                  Standard pricing for direct-to-consumer shipments, managed by serviceable
                  pincodes.
                </Text>
              </Stack>
            </Tab>
          </TabList>
        </Tabs>
      )}

      {!isB2BSelected && (
        <>
          {/* Plan Selector */}
          {plans?.length > 0 && (
            <Box mb={4}>
              <HStack spacing={3} align="center">
                <Text fontSize="sm" fontWeight="medium" color="gray.700" minW="80px">
                  Select Plan:
                </Text>
                <Select
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  maxW="200px"
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </Select>
              </HStack>
              <Divider mt={4} />
            </Box>
          )}

          {/* Filters and actions */}
          <Grid templateColumns="3fr 2fr" width="100%" gap={4} mb={4} alignItems="center">
            <TableFilters filters={filterOptions} values={userFilters} onApply={setUserFilters} />
            <Flex justify="flex-end" gap={2}>
              <Button
                size="sm"
                colorScheme="brand"
                leftIcon={<AddIcon />}
                onClick={openAddModal}
                isDisabled={!selectedPlanId || plans?.length === 0}
              >
                Add Rate
              </Button>
              <Button
                size="sm"
                colorScheme="pink"
                leftIcon={<IconUpload />}
                onClick={handleImportRates}
                isDisabled={!selectedPlanId || plans?.length === 0}
              >
                Import Rate Card
              </Button>
            </Flex>
          </Grid>

          {/* Rate Card Table */}
          <RateCardTable
            data={data || []}
            zones={zones}
            planId={selectedPlanId || queryFilters?.planId}
            businessType={selectedBusinessType}
            onEdit={openEditModal}
            loading={isLoading}
          />

          {/* Edit Rate Modal */}
          <RateCardEditModal
            isOpen={isModalOpen}
            onClose={() => setModalOpen(false)}
            data={selectedRate}
            existingRates={data}
            zones={zones}
            planId={queryFilters?.planId}
            couriers={courierList || []}
            businessType={selectedBusinessType}
          />

          {/* Import Modal */}
          <CustomModal
            isOpen={isImportModalOpen}
            onClose={() => setImportModalOpen(false)}
            title="Import Rates"
            size="xl"
            action={
              <Button
                size="sm"
                colorScheme="blue"
                onClick={handleTemplateDownload}
              >
                Download Sample Template
              </Button>
            }
          >
            <Stack spacing={3} mb={4}>
              <Box>
                <Text fontSize="sm" color="gray.700" fontWeight="semibold" mb={1}>
                  Import scope
                </Text>
                <Select
                  value={importScope}
                  onChange={(e) => setImportScope(e.target.value)}
                  maxW="260px"
                >
                  <option value="all">All couriers in one file</option>
                  <option value="single">Single courier only</option>
                </Select>
              </Box>

              {importScope === 'single' && (
                <Box>
                  <Text fontSize="sm" color="gray.700" fontWeight="semibold" mb={1}>
                    Select courier
                  </Text>
                  <Select
                    placeholder="Choose one courier"
                    value={selectedImportCourierKey}
                    onChange={(e) => setSelectedImportCourierKey(e.target.value)}
                  >
                    {importCourierOptions.map((courier) => (
                      <option key={courier.importKey} value={courier.importKey}>
                        {courier.importLabel}
                      </option>
                    ))}
                  </Select>
                  <Text fontSize="sm" color="gray.500" mt={2}>
                    The single-courier template is prefilled for this courier and the upload is
                    locked to the same courier, provider, and mode.
                  </Text>
                </Box>
              )}
            </Stack>

            {selectedBusinessType === 'b2c' && (
              <Stack spacing={2} mb={4}>
                <Text fontSize="sm" color="gray.700" fontWeight="semibold">
                  B2C import format
                </Text>
                <Text fontSize="sm" color="gray.600">
                  Use one row per slab with `Slab Type` set to `First`, `Additional`,
                  `Forward`, `Reverse`, or `Reverse Additional`.
                </Text>
                <Text fontSize="sm" color="gray.600">
                  Fill forward rates zone-wise. For separate reverse pricing, add explicit
                  `Reverse` and `Reverse Additional` rows; otherwise `Reverse Pickup %` remains a
                  multiplier of the forward slab.
                </Text>
                <Text fontSize="sm" color="gray.600">
                  The downloaded sample template already includes the accepted B2C headers and
                  default reverse logic columns.
                </Text>
                <Text fontSize="sm" color="gray.600">
                  `RTO %` creates RTO slabs only when it is greater than zero, so forward and
                  reverse-only cards can be imported without creating RTO rates.
                </Text>
              </Stack>
            )}
            <FileUploader
              maxSizeMb={5}
              folderKey="rates"
              accept=".csv,.xlsx,.xls"
              uploadLoading={isImporting}
              onUploaded={(files) => {
                if (!files.length) return
                if (importScope === 'single' && !selectedImportCourier) {
                  toast({
                    title: 'Select a courier first',
                    description:
                      'Choose the courier you want to import before uploading a single-courier rate card.',
                    status: 'warning',
                    duration: 3000,
                    isClosable: true,
                  })
                  return
                }
                importRates(
                  {
                    file: files[0],
                    planId: selectedPlanId || queryFilters?.planId,
                    businessType: queryFilters?.businessType || selectedBusinessType,
                    targetCourier:
                      importScope === 'single' && selectedImportCourier
                        ? {
                            courierId: selectedImportCourier.id,
                            courierName: selectedImportCourier.name,
                            serviceProvider:
                              selectedImportCourier.serviceProvider ||
                              selectedImportCourier.service_provider ||
                              '',
                            mode: selectedImportCourier.mode || '',
                          }
                        : undefined,
                  },
                  {
                    onSuccess: (result) => {
                      toast({
                        title: 'Imported successfully',
                        description: result?.data?.savedRows
                          ? `${result.data.savedRows} rate rows saved.`
                          : undefined,
                        status: 'success',
                        duration: 3000,
                        isClosable: true,
                      })
                      setImportModalOpen(false)
                    },
                    onError: (err) => {
                      toast({
                        title: 'Failed to upload rate card',
                        description: err?.message,
                        status: 'error',
                        duration: 4000,
                        isClosable: true,
                      })
                    },
                  },
                )
              }}
            />
          </CustomModal>
        </>
      )}

      {isB2BSelected && (
        <Box pt={4}>
          <ZoneRateMatrix embedded />
        </Box>
      )}
    </Flex>
  )
}
