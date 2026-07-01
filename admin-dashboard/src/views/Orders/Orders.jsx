import {
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  Icon,
  Text,
  Select,
  useToast,
} from '@chakra-ui/react'
import MetricTile from 'components/Admin/MetricTile'
import PageHeader from 'components/Admin/PageHeader'
import Card from 'components/Card/Card'
import CardBody from 'components/Card/CardBody'
import OrdersTable from 'components/Tables/OrdersTable'
import TableFilters from 'components/Tables/TableFilters'
import { useOrders } from 'hooks/useOrders'
import { useEffect, useMemo, useState } from 'react'
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiDownload,
  FiPackage,
  FiRefreshCw,
  FiTruck,
  FiXCircle,
} from 'react-icons/fi'
import { useLocation } from 'react-router-dom'
import { exportOrdersToCSV } from 'services/order.service'

const Orders = () => {
  const location = useLocation()
  const initialSearch = new URLSearchParams(location.search).get('search') || ''
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [filters, setFilters] = useState({
    status: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
    search: initialSearch,
    fromDate: '',
    toDate: '',
  })
  const [isExporting, setIsExporting] = useState(false)

  const { data: ordersData, isLoading, isFetching, refetch } = useOrders(page, limit, filters)
  const toast = useToast()

  useEffect(() => {
    const nextSearch = new URLSearchParams(location.search).get('search') || ''
    setFilters((prev) => {
      if (prev.search === nextSearch) return prev
      return {
        ...prev,
        search: nextSearch,
      }
    })
    setPage(1)
  }, [location.search])

  // Calculate statistics
  const stats = useMemo(() => {
    const orders = ordersData?.orders || []
    return {
      total: ordersData?.totalCount || 0,
      pending: orders.filter((o) => o.order_status === 'pending').length,
      shipped: orders.filter(
        (o) => o.order_status === 'shipment_created' || o.order_status === 'in_transit',
      ).length,
      ndr: orders.filter((o) => ['ndr', 'undelivered'].includes(o.order_status)).length,
      delivered: orders.filter((o) => o.order_status === 'delivered').length,
      cancelled: orders.filter((o) => o.order_status === 'cancelled').length,
      cancellationRequested: orders.filter((o) => o.order_status === 'cancellation_requested')
        .length,
    }
  }, [ordersData])

  const handleStatusFilter = (statusValue = '') => {
    setFilters((prev) => ({
      ...prev,
      status: statusValue,
    }))
    setPage(1)
  }

  const isStatusActive = (statusValue = '') => filters.status === statusValue

  const handleExport = async () => {
    try {
      setIsExporting(true)
      await exportOrdersToCSV(filters)
      toast({
        title: 'Export successful',
        description: 'Orders have been exported to CSV',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error.message || 'Failed to export orders',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    } finally {
      setIsExporting(false)
    }
  }

  const filterOptions = [
    {
      key: 'search',
      label: 'Search',
      type: 'search',
      placeholder: 'Search by Order ID, AWB, or Customer...',
    },
    {
      key: 'status',
      label: 'Order Status',
      type: 'select',
      placeholder: 'All Statuses',
      options: [
        { value: 'pending', label: 'Pending' },
        { value: 'shipment_created', label: 'Shipment Created' },
        { value: 'in_transit', label: 'In Transit' },
        { value: 'out_for_delivery', label: 'Out for Delivery' },
        { value: 'ndr', label: 'NDR' },
        { value: 'undelivered', label: 'Undelivered' },
        { value: 'delivered', label: 'Delivered' },
        { value: 'cancellation_requested', label: 'Cancellation Requested' },
        { value: 'cancelled', label: 'Cancelled' },
        { value: 'rto', label: 'RTO' },
        { value: 'rto_in_transit', label: 'RTO In Transit' },
        { value: 'rto_delivered', label: 'RTO Delivered' },
      ],
    },
    {
      key: 'fromDate',
      label: 'From Date',
      type: 'date',
      placeholder: 'Start Date',
    },
    {
      key: 'toDate',
      label: 'To Date',
      type: 'date',
      placeholder: 'End Date',
    },
  ]

  return (
    <Box pt={{ base: '120px', md: '75px' }}>
      <Box mb={6}>
        <PageHeader
          eyebrow="Orders"
          title="Shipment desk for every live order"
          description="Review order flow, surface risky shipments early and move from investigation to action without leaving the queue."
          meta={[
            { label: 'Total orders', value: stats.total.toLocaleString() },
            { label: 'Pending', value: stats.pending.toLocaleString() },
            { label: 'Delivered', value: stats.delivered.toLocaleString() },
          ]}
          actions={
            <HStack spacing={3} flexWrap="wrap">
              <Button
                leftIcon={<FiRefreshCw />}
                onClick={() => refetch()}
                isLoading={isFetching}
                variant="outline"
                size="sm"
                borderRadius="14px"
              >
                Refresh
              </Button>
              <Button
                leftIcon={<FiDownload />}
                onClick={handleExport}
                isLoading={isExporting}
                loadingText="Exporting..."
                bg="brand.500"
                color="white"
                size="sm"
                borderRadius="14px"
                _hover={{ bg: 'brand.600' }}
              >
                Export CSV
              </Button>
            </HStack>
          }
        />
      </Box>

      <Grid
        templateColumns={{
          base: '1fr',
          md: 'repeat(2, 1fr)',
          xl: 'repeat(6, 1fr)',
        }}
        gap={4}
        mb={5}
      >
        <MetricTile
          label="Total"
          value={stats.total}
          muted="All orders in current result set"
          icon={<Icon as={FiPackage} w={5} h={5} />}
          onClick={() => handleStatusFilter('')}
          active={isStatusActive('')}
        />
        <MetricTile
          label="Pending"
          value={stats.pending}
          muted="Awaiting dispatch action"
          icon={<Icon as={FiRefreshCw} w={5} h={5} />}
          accent="orange.500"
          onClick={() => handleStatusFilter('pending')}
          active={isStatusActive('pending')}
        />
        <MetricTile
          label="Shipped"
          value={stats.shipped}
          muted="Created or in transit"
          icon={<Icon as={FiTruck} w={5} h={5} />}
          accent="brand.500"
          onClick={() => handleStatusFilter('in_transit')}
          active={filters.status === 'shipment_created' || filters.status === 'in_transit'}
        />
        <MetricTile
          label="NDR"
          value={stats.ndr}
          muted="Need intervention"
          icon={<Icon as={FiAlertTriangle} w={5} h={5} />}
          accent="secondary.500"
          onClick={() => handleStatusFilter('ndr')}
          active={filters.status === 'ndr' || filters.status === 'undelivered'}
        />
        <MetricTile
          label="Delivered"
          value={stats.delivered}
          muted="Closed successfully"
          icon={<Icon as={FiCheckCircle} w={5} h={5} />}
          accent="green.500"
          onClick={() => handleStatusFilter('delivered')}
          active={isStatusActive('delivered')}
        />
        <MetricTile
          label="Cancelled"
          value={stats.cancelled}
          muted={`${stats.cancellationRequested} cancellation requests open`}
          icon={<Icon as={FiXCircle} w={5} h={5} />}
          accent="red.500"
          onClick={() => handleStatusFilter('cancelled')}
          active={isStatusActive('cancelled')}
        />
      </Grid>

      <Flex justify="space-between" align={{ base: 'stretch', md: 'center' }} direction={{ base: 'column', md: 'row' }} gap={3} mb={4}>
        <Text fontSize="sm" color="gray.500">
          Use the status tiles for quick triage, then narrow the queue with filters below.
        </Text>
        <HStack spacing={3} align="center">
          <Text fontSize="sm" color="gray.500">
            Sort by Created At
          </Text>
          <Select
            size="sm"
            w="180px"
            borderRadius="14px"
            value={filters.sortOrder}
            onChange={(e) => {
              setFilters((prev) => ({
                ...prev,
                sortBy: 'created_at',
                sortOrder: e.target.value,
              }))
              setPage(1)
            }}
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </Select>
        </HStack>
      </Flex>

      <Card mb={4} boxShadow="sm" borderRadius="24px">
        <CardBody p={{ base: 4, md: 5 }}>
          <TableFilters
            filters={filterOptions}
            values={filters}
            onApply={(appliedFilters) => {
              setFilters((prev) => ({
                ...appliedFilters,
                sortBy: prev.sortBy || 'created_at',
                sortOrder: prev.sortOrder || 'desc',
              }))
              setPage(1)
            }}
            actions={[]}
            showActiveFiltersCount={true}
            cardStyle={false}
          />
        </CardBody>
      </Card>
      <OrdersTable
        orders={ordersData?.orders}
        totalCount={ordersData?.totalCount}
        page={page}
        setPage={setPage}
        perPage={limit}
        setPerPage={setLimit}
        loading={isLoading || isFetching}
        onRefresh={refetch}
      />
    </Box>
  )
}

export default Orders
