import {
  Badge,
  Box,
  SimpleGrid,
  Stack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react'

const lifecycleLegend = [
  {
    code: 'UD',
    label: 'Forward shipment',
    colorScheme: 'orange',
    detail: 'Order moves from the client warehouse toward the end customer.',
  },
  {
    code: 'RT',
    label: 'RTO journey',
    colorScheme: 'red',
    detail: 'A forward shipment is converted into a return shipment after failure or change.',
  },
  {
    code: 'PP',
    label: 'Pickup request',
    colorScheme: 'blue',
    detail: 'Reverse pickup is created and scheduled from the customer side.',
  },
  {
    code: 'PU',
    label: 'Reverse shipment',
    colorScheme: 'teal',
    detail: 'Shipment is picked up and sent back to the origin facility.',
  },
  {
    code: 'DL',
    label: 'Delivery milestone',
    colorScheme: 'green',
    detail: 'The package reaches its end destination or returns to origin.',
  },
  {
    code: 'CN',
    label: 'Closure',
    colorScheme: 'gray',
    detail: 'Reverse pickup is cancelled or closed by the client or seller.',
  },
]

const lifecycleSections = [
  {
    title: 'Forward shipment lifecycle',
    subtitle:
      'Picking up products from client warehouses and delivering them to the end customer.',
    accent: 'orange',
    rows: [
      {
        type: 'UD',
        status: 'Manifested',
        description: 'When forward shipment soft data is API pushed or manually uploaded to HQ from the client system.',
      },
      {
        type: 'UD',
        status: 'Not Picked',
        description: 'When the shipment is not physically picked up from the client warehouse.',
      },
      {
        type: 'UD',
        status: 'In Transit',
        description: 'When a forward consignment is in transit to its DC after physical pickup.',
      },
      {
        type: 'UD',
        status: 'Pending',
        description: 'When a forward shipment has reached DC but has not yet been dispatched for delivery.',
      },
      {
        type: 'UD',
        status: 'Dispatched',
        description: 'When a forward shipment is dispatched for delivery to the end customer.',
      },
      {
        type: 'DL',
        status: 'Delivered',
        description: 'When a forward shipment is accepted by the end customer.',
      },
    ],
  },
  {
    title: 'Return to origin lifecycle',
    subtitle:
      'Forward shipment gets converted to return shipment after unsuccessful delivery or a client instruction.',
    accent: 'red',
    rows: [
      {
        type: 'RT',
        status: 'In Transit',
        description:
          'When a forward shipment is converted into a return shipment after unsuccessful delivery, client instruction, or an ad hoc condition in the system.',
      },
      {
        type: 'RT',
        status: 'Pending',
        description: 'When a shipment has reached the DC nearest to the origin center.',
      },
      {
        type: 'RT',
        status: 'Dispatched',
        description:
          'When a shipment has reached the DC nearest to the origin center and is dispatched for delivery.',
      },
      {
        type: 'DL',
        status: 'RTO',
        description: 'When a forward shipment is returned to origin.',
      },
    ],
  },
  {
    title: 'Reverse pickup lifecycle',
    subtitle:
      'Pickup from the customer location and delivery back to the client warehouse.',
    accent: 'blue',
    rows: [
      {
        type: 'PP',
        status: 'Open',
        description: 'When the reverse pickup request is successfully created and registered in the system.',
      },
      {
        type: 'PP',
        status: 'Scheduled',
        description: "When the pickup from the customer's location has been scheduled.",
      },
      {
        type: 'PP',
        status: 'Dispatched',
        description: 'When the field executive is dispatched to pick up the shipment from the customer.',
      },
      {
        type: 'PU',
        status: 'In Transit',
        description: 'When the reverse consignment has been picked up and is in transit to the facility.',
      },
      {
        type: 'PU',
        status: 'Pending',
        description: 'When the reverse shipment has reached the origin DC but is not yet dispatched to the client.',
      },
      {
        type: 'PU',
        status: 'Dispatched',
        description:
          'When the reverse shipment is dispatched for delivery back to the client warehouse.',
      },
      {
        type: 'DL',
        status: 'DTO',
        description: 'Delivered To Origin; when the reverse shipment is successfully delivered back to the client.',
      },
      {
        type: 'CN',
        status: 'Canceled',
        description: 'When the reverse shipment is cancelled by the client or seller in the journey.',
      },
      {
        type: 'CN',
        status: 'Closed',
        description: 'When the reverse shipment request is closed by the client or seller.',
      },
    ],
  },
]

const integrationSteps = [
  {
    step: '01',
    title: 'API Keys',
    api: 'Settings > API Setup > Existing API Token',
    description:
      'Obtain your API key from your Delhivery POC or from the Delhivery ONE Panel by viewing or copying the existing API token.',
  },
  {
    step: '02',
    title: 'Fetch Waybill',
    api: 'Bulk Waybill API',
    description:
      'Fetch waybill numbers in advance when order creation requires pre-assigned waybills.',
  },
  {
    step: '03',
    title: 'Serviceability and TAT',
    api: 'Pincode Serviceability API + TAT API',
    description:
      'Check whether the destination pincode is serviceable and estimate transit time between origin and destination.',
  },
  {
    step: '04',
    title: 'Warehouse Setup',
    api: 'Warehouse Creation API + Warehouse Updation API',
    description:
      'Register your warehouse or pickup location first, then use the update API whenever address or pickup details change.',
  },
  {
    step: '05',
    title: 'Shipping Cost Calculation',
    api: 'Shipping Cost API',
    description:
      'Get an estimated shipping charge before creating the shipment so your checkout and ops flow stay aligned.',
  },
  {
    step: '06',
    title: 'Shipment Creation',
    api: 'Shipment Creation API',
    description:
      'Create the shipment once the address, serviceability, pricing, and warehouse details are ready.',
  },
  {
    step: '07',
    title: 'Shipment Update and Cancellation',
    api: 'Shipment Update API + Shipment Cancellation API',
    description:
      'Use updates for edits and cancel only before the shipment is dispatched.',
  },
  {
    step: '08',
    title: 'Pickup Request Creation',
    api: 'PUR Creation API',
    description:
      'Create a pickup request for Delhivery operations to initiate the physical handoff from your location.',
  },
  {
    step: '09',
    title: 'Shipping Label Generation',
    api: 'Shipping Label API',
    description:
      'Generate the shipping label for packing, scanning, and dispatch readiness.',
  },
  {
    step: '10',
    title: 'Shipment Tracking',
    api: 'Track API',
    description:
      'Track shipment progress through the Delhivery network and map those statuses into your own order system.',
  },
  {
    step: '11',
    title: 'Download Document',
    api: 'Document Download API',
    description:
      'Download PODs, QC images, and other related documents when they become available.',
  },
]

function LifecycleBadge({ type }) {
  const tone = lifecycleLegend.find((item) => item.code === type) || lifecycleLegend[0]

  return (
    <Badge colorScheme={tone.colorScheme} variant="subtle" px={2} py={1} borderRadius="full">
      {tone.code}
    </Badge>
  )
}

function LifecycleSection({ section }) {
  return (
    <Box border="1px" borderColor="gray.200" borderRadius="2xl" bg="white" shadow="sm" overflow="hidden">
      <Box px={5} py={4} bg={`${section.accent}.50`} borderBottom="1px" borderColor="gray.100">
        <Text fontSize="sm" fontWeight="semibold" color={`${section.accent}.700`} textTransform="uppercase" letterSpacing="0.14em">
          {section.title}
        </Text>
        <Text mt={2} color="gray.700" lineHeight="7">
          {section.subtitle}
        </Text>
      </Box>
      <TableContainer>
        <Table variant="simple" size="sm">
          <Thead>
            <Tr>
              <Th width="120px">Status Type</Th>
              <Th width="150px">Status</Th>
              <Th>Description</Th>
            </Tr>
          </Thead>
          <Tbody>
            {section.rows.map((row) => (
              <Tr key={`${section.title}-${row.type}-${row.status}`}>
                <Td>
                  <LifecycleBadge type={row.type} />
                </Td>
                <Td fontWeight="semibold" color="gray.800">
                  {row.status}
                </Td>
                <Td color="gray.600" whiteSpace="normal">
                  {row.description}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
    </Box>
  )
}

export default function DelhiveryLifecyclePanel() {
  return (
    <VStack align="stretch" spacing={6}>
      <Box
        borderRadius="3xl"
        px={{ base: 5, md: 8 }}
        py={{ base: 6, md: 8 }}
        bg="linear-gradient(135deg, #0f172a 0%, #1d4ed8 55%, #0ea5e9 100%)"
        color="white"
        shadow="lg"
      >
        <Stack spacing={4}>
          <Box>
            <Text
              fontSize="sm"
              fontWeight="semibold"
              textTransform="uppercase"
              letterSpacing="0.24em"
              color="cyan.200"
            >
              Delhivery ONE
            </Text>
            <Text mt={3} fontSize={{ base: '2xl', md: '4xl' }} fontWeight="bold" lineHeight="1.1">
              Package Lifecycle Panel
            </Text>
            <Text mt={4} maxW="3xl" fontSize="md" lineHeight="8" color="whiteAlpha.900">
              This panel maps the B2C package lifecycle for Delhivery shipments from order
              creation to delivery, return to origin, or reverse pickup completion. It is
              meant to help teams align tracking logic, webhook handling, and operational
              visibility.
            </Text>
          </Box>

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
            <Box bg="whiteAlpha.200" border="1px" borderColor="whiteAlpha.300" borderRadius="2xl" p={4}>
              <Text fontSize="sm" color="cyan.100" mb={1}>
                Entry points
              </Text>
              <Text fontWeight="semibold">Manifest API or Delhivery ONE Panel</Text>
            </Box>
            <Box bg="whiteAlpha.200" border="1px" borderColor="whiteAlpha.300" borderRadius="2xl" p={4}>
              <Text fontSize="sm" color="cyan.100" mb={1}>
                Journey coverage
              </Text>
              <Text fontWeight="semibold">Forward, RTO, and reverse pickup flows</Text>
            </Box>
            <Box bg="whiteAlpha.200" border="1px" borderColor="whiteAlpha.300" borderRadius="2xl" p={4}>
              <Text fontSize="sm" color="cyan.100" mb={1}>
                Visibility use
              </Text>
              <Text fontWeight="semibold">Tracking, support, and webhook mapping</Text>
            </Box>
          </SimpleGrid>
        </Stack>
      </Box>

      <Box p={5} border="1px" borderColor="gray.200" borderRadius="2xl" bg="white">
        <Text fontSize="md" fontWeight="semibold" color="gray.800">
          B2C integration flow
        </Text>
        <Text mt={2} color="gray.600" lineHeight="7">
          These steps follow a practical integration order for Delhivery B2C shipments, from
          credentials and setup through shipment creation, tracking, and document retrieval.
        </Text>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
        {integrationSteps.map((item) => (
          <Box key={item.step} p={5} border="1px" borderColor="gray.200" borderRadius="2xl" bg="white" shadow="sm">
            <Text fontSize="sm" fontWeight="bold" color="cyan.600" letterSpacing="0.2em">
              STEP {item.step}
            </Text>
            <Text mt={3} fontSize="lg" fontWeight="bold" color="gray.800">
              {item.title}
            </Text>
            <Badge mt={3} colorScheme="blue" variant="subtle" px={3} py={1} borderRadius="full">
              {item.api}
            </Badge>
            <Text mt={4} color="gray.600" lineHeight="7">
              {item.description}
            </Text>
          </Box>
        ))}
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4}>
        {lifecycleLegend.map((item) => (
          <Box key={item.code} p={5} border="1px" borderColor="gray.200" borderRadius="2xl" bg="white">
            <Badge colorScheme={item.colorScheme} px={3} py={1} borderRadius="full">
              {item.code}
            </Badge>
            <Text mt={3} fontSize="lg" fontWeight="bold" color="gray.800">
              {item.label}
            </Text>
            <Text mt={2} color="gray.600" lineHeight="7">
              {item.detail}
            </Text>
          </Box>
        ))}
      </SimpleGrid>

      <Box p={5} border="1px" borderColor="gray.200" borderRadius="2xl" bg="white">
        <Text fontSize="md" fontWeight="semibold" color="gray.800">
          Lifecycle overview
        </Text>
        <Text mt={2} color="gray.600" lineHeight="7">
          Forward shipments begin with <strong>UD</strong> states, RTO conversion uses{' '}
          <strong>RT</strong> states, and reverse pickup flows use <strong>PP</strong> and{' '}
          <strong>PU</strong> states. <strong>DL</strong> marks delivery milestones, while{' '}
          <strong>CN</strong> covers reverse pickup cancellation or closure.
        </Text>
      </Box>

      <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={5}>
        {lifecycleSections.map((section) => (
          <LifecycleSection key={section.title} section={section} />
        ))}
      </SimpleGrid>
    </VStack>
  )
}
