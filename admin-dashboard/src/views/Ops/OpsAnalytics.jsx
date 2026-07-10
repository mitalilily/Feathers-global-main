import {
  Badge,
  Box,
  Button,
  Container,
  Grid,
  HStack,
  SimpleGrid,
  Spinner,
  Stack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
} from '@chakra-ui/react'
import MetricTile from 'components/Admin/MetricTile'
import PageHeader from 'components/Admin/PageHeader'
import Card from 'components/Card/Card'
import CardBody from 'components/Card/CardBody'
import CardHeader from 'components/Card/CardHeader'
import TableFilters from 'components/Tables/TableFilters'
import AreaChart from 'components/Charts/AreaChart'
import DonutChart from 'components/Charts/DonutChart'
import HeatmapChart from 'components/Charts/HeatmapChart'
import RadialBarChart from 'components/Charts/RadialBarChart'
import { useOpsAnalytics } from 'hooks/useOpsAnalytics'
import { useMemo, useState } from 'react'
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconCheck,
  IconPackageExport,
  IconRefresh,
  IconTruck,
} from '@tabler/icons-react'
import { BRAND } from '../../constants/brand'

const today = new Date()
const defaultFromDate = new Date(today)
defaultFromDate.setDate(defaultFromDate.getDate() - 30)

const formatInputDate = (date) => date.toISOString().slice(0, 10)

const defaultFilters = {
  search: '',
  fromDate: formatInputDate(defaultFromDate),
  toDate: formatInputDate(today),
  courier: '',
  zone: '',
  accountId: '',
}

const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`
const formatDays = (value) => `${Number(value || 0).toFixed(1)} days`

export default function OpsAnalytics({ embedded = false } = {}) {
  const [filters, setFilters] = useState(defaultFilters)
  const { data, isLoading, error, refetch, isRefetching } = useOpsAnalytics(filters)

  const pageBg = useColorModeValue(
    'linear-gradient(180deg, #F6F8FB 0%, #F8FAFC 42%, #EEF4FF 100%)',
    'linear-gradient(180deg, #08111F 0%, #0C172B 46%, #111827 100%)',
  )
  const panelBg = useColorModeValue('white', '#101B2E')
  const borderColor = useColorModeValue('rgba(148,163,184,0.24)', 'rgba(148,163,184,0.18)')
  const textPrimary = useColorModeValue('gray.800', 'gray.100')
  const textSecondary = useColorModeValue('gray.600', 'gray.400')
  const softBg = useColorModeValue('gray.50', 'rgba(148,163,184,0.08)')

  const analytics = data?.data || {}
  const summary = analytics.summary || {}
  const zoneOverview = analytics.zoneOverview || []
  const zoneMatrix = analytics.zoneCourierMatrix || { zones: [], couriers: [], rows: [] }
  const zoneRtoAnalytics = analytics.zoneRtoAnalytics || []
  const zoneSpeed = analytics.zoneSpeed || []
  const ndrAnalytics = analytics.ndrAnalytics || []
  const courierPerformance = analytics.courierPerformance || []
  const highRiskPincodes = analytics.highRiskPincodes || []
  const pincodeCourierComparison = analytics.pincodeCourierComparison || []
  const codFriendlyPincodes = analytics.codFriendlyPincodes || []
  const prepaidRecommendedPincodes = analytics.prepaidRecommendedPincodes || []
  const weightDistribution = analytics.weightDistribution || []
  const colorWiseRto = analytics.colorWiseRto || []
  const priceWiseRto = analytics.priceWiseRto || []
  const courierRtoByWeight = analytics.courierRtoByWeight || []
  const productWiseRto = analytics.productWiseRto || []
  const categoryWiseRto = analytics.categoryWiseRto || []
  const skuWiseRto = analytics.skuWiseRto || []
  const sizeWiseRto = analytics.sizeWiseRto || []
  const dispatchDelay = analytics.dispatchDelay || []
  const guidance = analytics.guidance || []

  const heatmapSeries = useMemo(
    () =>
      zoneMatrix.rows.map((row) => ({
        name: row.courier,
        data: zoneMatrix.zones.map((zoneName) => {
          const cell = row.zones.find((item) => item.zone === zoneName)
          return Number(cell?.deliveryRate || 0)
        }),
      })),
    [zoneMatrix],
  )

  const ndrSeries = ndrAnalytics.map((item) => Number(item.share || 0))
  const ndrLabels = ndrAnalytics.map((item) => item.reason)

  const weightSeries = weightDistribution.map((item) => Number(item.orders || 0))
  const weightLabels = weightDistribution.map((item) => item.label)

  const dispatchSeries = [
    {
      name: 'Delivery %',
      data: dispatchDelay.map((item) => Number(item.deliveryRate || 0)),
    },
    {
      name: 'RTO %',
      data: dispatchDelay.map((item) => Number(item.rtoRate || 0)),
    },
  ]
  const dispatchLabels = dispatchDelay.map((item) => item.dispatchTime)

  const tableFilters = [
    { key: 'search', label: 'Search', type: 'search', placeholder: 'Order / AWB / buyer / pincode' },
    { key: 'fromDate', label: 'From', type: 'date' },
    { key: 'toDate', label: 'To', type: 'date' },
    { key: 'courier', label: 'Courier', type: 'text', placeholder: 'Delhivery' },
    { key: 'zone', label: 'Zone', type: 'text', placeholder: 'West / South / North' },
    { key: 'accountId', label: 'Account', type: 'text', placeholder: 'Client account id' },
  ]

  const titleMeta = [
    { label: 'Orders', value: summary.totalOrders?.toLocaleString?.() || '0' },
    { label: 'Delivery', value: formatPercent(summary.deliveryRate) },
    { label: 'RTO', value: formatPercent(summary.rtoRate) },
  ]

  if (isLoading) {
    return (
      <Box minH={embedded ? '240px' : '70vh'} display="flex" alignItems="center" justifyContent="center">
        <Stack spacing={3} align="center">
          <Spinner size="xl" color="brand.500" thickness="4px" />
          <Text color={textSecondary}>Loading ops analytics...</Text>
        </Stack>
      </Box>
    )
  }

  if (error) {
    return (
      <Box minH={embedded ? '240px' : '70vh'} display="flex" alignItems="center" justifyContent="center">
        <Stack spacing={3} align="center">
          <Text color="red.500" fontWeight="700" fontSize="lg">
            Failed to load ops analytics
          </Text>
          <Button leftIcon={<IconRefresh size={16} />} onClick={() => refetch()}>
            Retry
          </Button>
        </Stack>
      </Box>
    )
  }

  const content = (
    <>
      {embedded ? (
        <Box mb={6}>
          <HStack justify="space-between" align={{ base: 'flex-start', md: 'center' }} flexWrap="wrap" spacing={4}>
            <Box>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" textTransform="uppercase" color="brand.500">
                Seller analytics on admin
              </Text>
              <Text mt={1} fontSize="2xl" fontWeight="800" color={textPrimary}>
                Zone, courier and pincode intelligence
              </Text>
              <Text mt={1} fontSize="sm" color={textSecondary} maxW="4xl">
                This mirrors the full seller analytics stack directly on the admin dashboard, using the same synced live data source.
              </Text>
            </Box>
            <Button
              size="sm"
              leftIcon={isRefetching ? <Spinner size="sm" /> : <IconRefresh size={16} />}
              isLoading={isRefetching}
              onClick={() => refetch()}
              bg="brand.500"
              color="white"
              borderRadius="14px"
              px={5}
              _hover={{ bg: 'brand.600' }}
            >
              Refresh data
            </Button>
          </HStack>
        </Box>
      ) : (
        <PageHeader
          eyebrow={`${BRAND.name} Operations`}
          title="Analytics cockpit for zone, courier and pincode decisions"
          description="Production-ready analytics cards for the ops team. The range filter keeps the snapshot focused today and leaves room for future client-account-level reporting."
          meta={titleMeta}
          actions={
            <HStack spacing={3} justify={{ base: 'stretch', xl: 'flex-end' }} flexWrap="wrap">
              <Button
                size="sm"
                leftIcon={isRefetching ? <Spinner size="sm" /> : <IconRefresh size={16} />}
                isLoading={isRefetching}
                onClick={() => refetch()}
                bg="brand.500"
                color="white"
                borderRadius="14px"
                px={5}
                _hover={{ bg: 'brand.600' }}
              >
                Refresh data
              </Button>
            </HStack>
          }
        />
      )}

      <Box mt={embedded ? 0 : 6} mb={6}>
        <TableFilters filters={tableFilters} values={filters} onApply={setFilters} cardStyle />
      </Box>

      <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={4} mb={6}>
        <MetricTile
          label="Orders"
          value={Number(summary.totalOrders || 0).toLocaleString()}
          muted="Orders in the selected range"
          icon={<IconPackageExport size={18} />}
          accent="brand.500"
        />
        <MetricTile
          label="Delivery rate"
          value={formatPercent(summary.deliveryRate)}
          muted={`Avg delivery ${formatDays(summary.avgDeliveryDays)}`}
          icon={<IconCheck size={18} />}
          accent="green.500"
        />
        <MetricTile
          label="RTO rate"
          value={formatPercent(summary.rtoRate)}
          muted={`Avg dispatch ${formatDays(summary.avgDispatchDays)}`}
          icon={<IconAlertTriangle size={18} />}
          accent="orange.500"
        />
        <MetricTile
          label="Best courier"
          value={summary.bestCourier?.label || summary.bestCourier?.courier || 'Unknown'}
          muted={summary.bestZone?.label ? `Best zone: ${summary.bestZone.label}` : 'Zone ranking ready'}
          icon={<IconTruck size={18} />}
          accent="secondary.500"
        />
      </SimpleGrid>

      <Grid templateColumns={{ base: '1fr', xl: '1.05fr 0.95fr' }} gap={6} mb={6}>
        <DashboardCard title="Overall Zone Dashboard" subtitle="Zone-level performance and seller guidance" bg={panelBg} borderColor={borderColor}>
          <CompactTable
            headers={['Zone', 'Orders', 'Delivery %', 'RTO %', 'Avg Delivery Days', 'Best Courier']}
            rows={zoneOverview}
            renderRow={(row) => (
              <Tr key={row.label}>
                <Td fontWeight="700" color={textPrimary}>
                  {row.label}
                </Td>
                <Td>{Number(row.orders || 0).toLocaleString()}</Td>
                <Td>{formatPercent(row.deliveryRate)}</Td>
                <Td>{formatPercent(row.rtoRate)}</Td>
                <Td>{formatDays(row.avgDeliveryDays)}</Td>
                <Td>
                  <Badge colorScheme="blue" borderRadius="full">
                    {row.bestCourier || 'Unknown'}
                  </Badge>
                </Td>
              </Tr>
            )}
          />

          <Box mt={4} p={4} borderRadius="14px" bg={softBg} borderWidth="1px" borderColor={borderColor}>
            <Text fontSize="sm" fontWeight="700" color={textPrimary} mb={2}>
              Seller guidance
            </Text>
            <Stack spacing={1.5}>
              {guidance.map((line) => (
                <HStack key={line} spacing={2}>
                  <IconArrowUpRight size={16} color="#2B6CB0" />
                  <Text fontSize="sm" color={textPrimary}>
                    {line}
                  </Text>
                </HStack>
              ))}
            </Stack>
          </Box>
        </DashboardCard>

        <DashboardCard title="Courier vs Zone Matrix" subtitle="Courier delivery rate by zone" bg={panelBg} borderColor={borderColor}>
          <Box h={{ base: '340px', md: '420px' }}>
            {heatmapSeries.length > 0 ? (
              <HeatmapChart series={heatmapSeries} categories={zoneMatrix.zones} />
            ) : (
              <EmptyState text="No courier-zone data available for the selected range." />
            )}
          </Box>
        </DashboardCard>
      </Grid>

      <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={6} mb={6}>
        <DashboardCard title="Zone Wise RTO Analytics" subtitle="COD RTO vs prepaid RTO" bg={panelBg} borderColor={borderColor}>
          <CompactTable
            headers={['Zone', 'COD RTO', 'Prepaid RTO']}
            rows={zoneRtoAnalytics}
            renderRow={(row) => (
              <Tr key={row.zone}>
                <Td fontWeight="700" color={textPrimary}>
                  {row.zone}
                </Td>
                <Td>{formatPercent(row.codRto)}</Td>
                <Td>{formatPercent(row.prepaidRto)}</Td>
              </Tr>
            )}
          />
        </DashboardCard>

        <DashboardCard title="Zone Wise Delivery Speed" subtitle="Best courier and average days by zone" bg={panelBg} borderColor={borderColor}>
          <CompactTable
            headers={['Zone', 'Best Courier', 'Avg Days']}
            rows={zoneSpeed}
            renderRow={(row) => (
              <Tr key={row.zone}>
                <Td fontWeight="700" color={textPrimary}>
                  {row.zone}
                </Td>
                <Td>{row.bestCourier}</Td>
                <Td>{formatDays(row.avgDays)}</Td>
              </Tr>
            )}
          />
        </DashboardCard>
      </Grid>
    </>
  )

  return embedded ? (
    <Box>
      {content}
    </Box>
  ) : (
    <Box minH="100vh" bg={pageBg} pb={8}>
      <Container maxW="full" pt={{ base: '120px', md: '75px' }} px={{ base: 4, md: 6 }}>
        {content}

        <Grid templateColumns={{ base: '1fr', xl: '0.95fr 1.05fr' }} gap={6} mb={6}>
          <DashboardCard title="NDR Analytics" subtitle="Reason-wise summary" bg={panelBg} borderColor={borderColor}>
            <Box h={{ base: '260px', md: '300px' }}>
              {ndrSeries.length > 0 ? (
                <RadialBarChart series={ndrSeries} labels={ndrLabels} />
              ) : (
                <EmptyState text="No NDR reason data for the selected range." />
              )}
            </Box>
            <Stack spacing={2} mt={4}>
              {ndrAnalytics.map((item) => (
                <HStack key={item.reason} justify="space-between" p={3} borderRadius="12px" bg={softBg} borderWidth="1px" borderColor={borderColor}>
                  <Text fontSize="sm" color={textPrimary} fontWeight="600">
                    {item.reason}
                  </Text>
                  <Badge colorScheme="orange">{formatPercent(item.share)}</Badge>
                </HStack>
              ))}
            </Stack>
          </DashboardCard>

          <DashboardCard title="Courier Performance Analytics" subtitle="Courier benchmarking" bg={panelBg} borderColor={borderColor}>
            <CompactTable
              headers={['Courier', 'Orders', 'Delivered %', 'Avg Days', 'RTO %']}
              rows={courierPerformance}
              renderRow={(row) => (
                <Tr key={row.courier}>
                  <Td fontWeight="700" color={textPrimary}>
                    {row.courier}
                  </Td>
                  <Td>{Number(row.orders || 0).toLocaleString()}</Td>
                  <Td>{formatPercent(row.deliveryRate)}</Td>
                  <Td>{formatDays(row.avgDeliveryDays)}</Td>
                  <Td>{formatPercent(row.rtoRate)}</Td>
                </Tr>
              )}
            />
          </DashboardCard>
        </Grid>

        <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={6} mb={6}>
          <DashboardCard title="High Risk Pincode Analytics" subtitle="Risky delivery areas" bg={panelBg} borderColor={borderColor}>
            <CompactTable
              headers={['Pincode', 'Orders', 'RTO %']}
              rows={highRiskPincodes}
              renderRow={(row) => (
                <Tr key={row.pincode}>
                  <Td fontWeight="700" color={textPrimary}>
                    {row.pincode}
                  </Td>
                  <Td>{Number(row.orders || 0).toLocaleString()}</Td>
                  <Td>{formatPercent(row.rtoRate)}</Td>
                </Tr>
              )}
            />

            <Box mt={4} p={4} borderRadius="14px" bg="orange.50" borderWidth="1px" borderColor="orange.200">
              <Text fontWeight="700" color="orange.700">
                Seller ne warning
              </Text>
              <Text fontSize="sm" color="orange.700" mt={1}>
                High RTO Zone
              </Text>
            </Box>
          </DashboardCard>

          <DashboardCard title="Pincode Intelligence Analytics" subtitle="Courier-wise pincode comparison" bg={panelBg} borderColor={borderColor}>
            <CompactTable
              headers={['Pincode', 'Courier', 'Delivery %', 'RTO %', 'Avg Days']}
              rows={pincodeCourierComparison}
              renderRow={(row) => (
                <Tr key={`${row.pincode}-${row.courier}`}>
                  <Td fontWeight="700" color={textPrimary}>
                    {row.pincode}
                  </Td>
                  <Td>{row.courier}</Td>
                  <Td>{formatPercent(row.deliveryRate)}</Td>
                  <Td>{formatPercent(row.rtoRate)}</Td>
                  <Td>{formatDays(row.avgDeliveryDays)}</Td>
                </Tr>
              )}
            />
          </DashboardCard>
        </Grid>

        <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={6} mb={6}>
          <DashboardCard title="COD Friendly Pincode Analytics" subtitle="Where COD can be allowed" bg={panelBg} borderColor={borderColor}>
            <CompactTable
              headers={['Pincode', 'COD Delivery %']}
              rows={codFriendlyPincodes}
              renderRow={(row) => (
                <Tr key={row.pincode}>
                  <Td fontWeight="700" color={textPrimary}>
                    {row.pincode}
                  </Td>
                  <Td>{formatPercent(row.codDelivery)}</Td>
                </Tr>
              )}
            />

            <Box mt={4} p={4} borderRadius="14px" bg="green.50" borderWidth="1px" borderColor="green.200">
              <Text fontWeight="700" color="green.700">
                AI Suggestion
              </Text>
              <Text fontSize="sm" color="green.700" mt={1}>
                COD Allowed
              </Text>
            </Box>
          </DashboardCard>

          <DashboardCard title="Prepaid Recommended Pincode" subtitle="Where COD should be avoided" bg={panelBg} borderColor={borderColor}>
            <CompactTable
              headers={['Pincode', 'COD RTO']}
              rows={prepaidRecommendedPincodes}
              renderRow={(row) => (
                <Tr key={row.pincode}>
                  <Td fontWeight="700" color={textPrimary}>
                    {row.pincode}
                  </Td>
                  <Td>{formatPercent(row.codRto)}</Td>
                </Tr>
              )}
            />

            <Box mt={4} p={4} borderRadius="14px" bg="orange.50" borderWidth="1px" borderColor="orange.200">
              <Text fontWeight="700" color="orange.700">
                Warning
              </Text>
              <Text fontSize="sm" color="orange.700" mt={1}>
                Suggest Prepaid Only
              </Text>
            </Box>
          </DashboardCard>
        </Grid>

        <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={6} mb={6}>
          <DashboardCard title="Order Distribution by Weight" subtitle="What weight buckets dominate the mix" bg={panelBg} borderColor={borderColor}>
            <Box h={{ base: '260px', md: '320px' }}>
              {weightSeries.length > 0 ? (
                <DonutChart series={weightSeries} labels={weightLabels} />
              ) : (
                <EmptyState text="No weight data available." />
              )}
            </Box>
          </DashboardCard>

          <DashboardCard title="Color Wise RTO + Price Wise RTO" subtitle="Product attribute risk analysis" bg={panelBg} borderColor={borderColor}>
            <Stack spacing={5}>
              <CompactTable
                headers={['Color', 'RTO %']}
                rows={colorWiseRto}
                renderRow={(row) => (
                  <Tr key={row.color}>
                    <Td fontWeight="700" color={textPrimary}>
                      {row.color}
                    </Td>
                    <Td>{formatPercent(row.rto)}</Td>
                  </Tr>
                )}
              />

              <CompactTable
                headers={['Price Range', 'RTO %']}
                rows={priceWiseRto}
                renderRow={(row) => (
                  <Tr key={row.priceRange}>
                    <Td fontWeight="700" color={textPrimary}>
                      {row.priceRange}
                    </Td>
                    <Td>{formatPercent(row.rto)}</Td>
                  </Tr>
                )}
              />
            </Stack>
          </DashboardCard>
        </Grid>

        <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={6} mb={6}>
          <DashboardCard title="Courier RTO by Weight" subtitle="Courier reliability across parcel slabs" bg={panelBg} borderColor={borderColor}>
            <CompactTable
              headers={['Courier', '0-500 gm', '500-1000 gm', '1-2 Kg', '2+ Kg']}
              rows={courierRtoByWeight}
              renderRow={(row) => (
                <Tr key={row.courier}>
                  <Td fontWeight="700" color={textPrimary}>
                    {row.courier}
                  </Td>
                  <Td>{formatPercent(row['0-500 gm'])}</Td>
                  <Td>{formatPercent(row['501-1000 gm'])}</Td>
                  <Td>{formatPercent(row['1001-2000 gm'])}</Td>
                  <Td>{formatPercent(row['2000+ gm'])}</Td>
                </Tr>
              )}
            />
          </DashboardCard>

          <DashboardCard title="Product Wise RTO Analytics + Category Wise RTO" subtitle="SKU-level and category-level risk" bg={panelBg} borderColor={borderColor}>
            <Stack spacing={5}>
              <CompactTable
                headers={['Product', 'Orders', 'Delivered', 'RTO', 'RTO %']}
                rows={productWiseRto}
                renderRow={(row) => (
                  <Tr key={row.product}>
                    <Td fontWeight="700" color={textPrimary}>
                      {row.product}
                    </Td>
                    <Td>{Number(row.orders || 0).toLocaleString()}</Td>
                    <Td>{Number(row.delivered || 0).toLocaleString()}</Td>
                    <Td>{Number(row.rto || 0).toLocaleString()}</Td>
                    <Td>{formatPercent(row.rtoRate)}</Td>
                  </Tr>
                )}
              />

              <CompactTable
                headers={['Category', 'RTO %']}
                rows={categoryWiseRto}
                renderRow={(row) => (
                  <Tr key={row.category}>
                    <Td fontWeight="700" color={textPrimary}>
                      {row.category}
                    </Td>
                    <Td>{formatPercent(row.rtoRate)}</Td>
                  </Tr>
                )}
              />
            </Stack>
          </DashboardCard>
        </Grid>

        <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={6}>
          <DashboardCard title="SKU Wise RTO + Size Wise RTO" subtitle="Specific SKU and size risk" bg={panelBg} borderColor={borderColor}>
            <Stack spacing={5}>
              <CompactTable
                headers={['SKU', 'Product', 'RTO %']}
                rows={skuWiseRto}
                renderRow={(row) => (
                  <Tr key={row.sku}>
                    <Td fontWeight="700" color={textPrimary}>
                      {row.sku}
                    </Td>
                    <Td>{row.product}</Td>
                    <Td>{formatPercent(row.rtoRate)}</Td>
                  </Tr>
                )}
              />

              <CompactTable
                headers={['Size', 'RTO %']}
                rows={sizeWiseRto}
                renderRow={(row) => (
                  <Tr key={row.size}>
                    <Td fontWeight="700" color={textPrimary}>
                      {row.size}
                    </Td>
                    <Td>{formatPercent(row.rtoRate)}</Td>
                  </Tr>
                )}
              />
            </Stack>
          </DashboardCard>

          <DashboardCard title="Dispatch Delay Analytics" subtitle="Dispatch SLA dashboard" bg={panelBg} borderColor={borderColor}>
            <Box h={{ base: '260px', md: '320px' }}>
              {dispatchSeries[0].data.length > 0 ? (
                <AreaChart categories={dispatchLabels} series={dispatchSeries} />
              ) : (
                <EmptyState text="No dispatch delay data available." />
              )}
            </Box>
            <CompactTable
              headers={['Dispatch Time', 'Orders', 'Delivery %', 'RTO %']}
              rows={dispatchDelay}
              renderRow={(row) => (
                <Tr key={row.dispatchTime}>
                  <Td fontWeight="700" color={textPrimary}>
                    {row.dispatchTime}
                  </Td>
                  <Td>{Number(row.orders || 0).toLocaleString()}</Td>
                  <Td>{formatPercent(row.deliveryRate)}</Td>
                  <Td>{formatPercent(row.rtoRate)}</Td>
                </Tr>
              )}
            />
          </DashboardCard>
        </Grid>
      </Container>
    </Box>
  )
}

function DashboardCard({ title, subtitle, children, bg, borderColor }) {
  const titleColor = useColorModeValue('gray.800', 'gray.100')
  const textColor = useColorModeValue('gray.600', 'gray.400')
  return (
    <Card bg={bg} borderWidth="1px" borderColor={borderColor} borderRadius="18px" h="full">
      <CardHeader p={5} pb={2}>
        <Text fontSize="lg" fontWeight="800" color={titleColor} letterSpacing="-0.02em">
          {title}
        </Text>
        {subtitle ? (
          <Text fontSize="sm" color={textColor} mt={1}>
            {subtitle}
          </Text>
        ) : null}
      </CardHeader>
      <CardBody p={5} pt={2}>
        {children}
      </CardBody>
    </Card>
  )
}

function CompactTable({ headers = [], rows = [], renderRow }) {
  const borderColor = useColorModeValue('rgba(148,163,184,0.18)', 'rgba(148,163,184,0.12)')
  const titleColor = useColorModeValue('gray.700', 'gray.200')
  return (
    <TableContainer borderWidth="1px" borderColor={borderColor} borderRadius="14px" overflowX="auto">
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            {headers.map((header) => (
              <Th key={header} color={titleColor} borderColor={borderColor} whiteSpace="nowrap">
                {header}
              </Th>
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {rows.length > 0 ? (
            rows.map((row, index) => renderRow({ ...row, rowIndex: index }))
          ) : (
            <Tr>
              <Td colSpan={headers.length} py={8} textAlign="center" color={titleColor}>
                No data available
              </Td>
            </Tr>
          )}
        </Tbody>
      </Table>
    </TableContainer>
  )
}

function EmptyState({ text }) {
  const textColor = useColorModeValue('gray.600', 'gray.400')
  return (
    <Box
      h="100%"
      display="flex"
      alignItems="center"
      justifyContent="center"
      borderWidth="1px"
      borderStyle="dashed"
      borderColor={useColorModeValue('gray.200', 'gray.600')}
      borderRadius="16px"
      bg={useColorModeValue('gray.50', 'rgba(148,163,184,0.04)')}
    >
      <Text color={textColor}>{text}</Text>
    </Box>
  )
}
