import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  Spinner,
  Text,
  useToast,
  VStack,
} from '@chakra-ui/react'
import { useEffect, useState } from 'react'
import {
  useCourierCredentials,
  useUpdateDelhiveryCredentials,
  useUpdateEkartCredentials,
  useUpdateShadowfaxCredentials,
  useUpdateXpressbeesAwbRange,
  useUpdateXpressbeesCredentials,
} from 'hooks/useCouriers'

const CourierCredentials = () => {
  const toast = useToast()
  const { data, isLoading, error } = useCourierCredentials()
  const updateDelhivery = useUpdateDelhiveryCredentials()
  const updateEkart = useUpdateEkartCredentials()
  const updateShadowfax = useUpdateShadowfaxCredentials()
  const updateXpressbees = useUpdateXpressbeesCredentials()
  const updateXpressbeesAwbRange = useUpdateXpressbeesAwbRange()

  const [form, setForm] = useState({
    apiBase: '',
    clientName: '',
    apiKey: '',
  })
  const [ekartForm, setEkartForm] = useState({
    apiBase: '',
    clientId: '',
    username: '',
    password: '',
    webhookSecret: '',
  })
  const [xpressbeesForm, setXpressbeesForm] = useState({
    apiBase: '',
    username: '',
    password: '',
    apiKey: '',
    authBearer: '',
    secretKey: '',
    xbKey: '',
    xbAccessKey: '',
    businessAccountName: '',
    pickupVendorCode: '',
    businessUnit: 'ECOM',
    businessFlow: 'FORWARD',
    businessService: '',
    businessServices: 'SD,SDD,NDD,AIR,SFC,IntraSDD',
    manifestServiceType: 'SD',
    manifestPickupType: 'Vendor',
    pincodeBusinessUnit: 'eComm',
    pincodeBusinessFlow: 'Forward',
    pickupBusinessService: 'PickUp',
    deliveryBusinessService: 'Delivery',
    serviceabilityVersion: 'v1',
    trackingVersion: 'v1',
    webhookSecret: '',
  })
  const [xpressbeesAwbForm, setXpressbeesAwbForm] = useState({
    startAwb: '',
    endAwb: '',
  })
  const [shadowfaxForm, setShadowfaxForm] = useState({
    apiBase: '',
    clientName: '',
    apiKey: '',
    webhookSecret: '',
  })
  useEffect(() => {
    if (data?.delhivery) {
      setForm({
        apiBase: data.delhivery.apiBase || '',
        clientName: data.delhivery.clientName || '',
        apiKey: '',
      })
    }
    if (data?.ekart) {
      setEkartForm({
        apiBase: data.ekart.apiBase || '',
        clientId: data.ekart.clientId || '',
        username: data.ekart.username || '',
        password: '',
        webhookSecret: '',
      })
    }
    if (data?.xpressbees) {
      setXpressbeesForm({
        apiBase: data.xpressbees.apiBase || '',
        username: data.xpressbees.username || '',
        password: '',
        apiKey: '',
        authBearer: '',
        secretKey: '',
        xbKey: '',
        xbAccessKey: '',
        businessAccountName: data.xpressbees.businessAccountName || '',
        pickupVendorCode: data.xpressbees.pickupVendorCode || '',
        businessUnit: data.xpressbees.businessUnit || 'ECOM',
        businessFlow: data.xpressbees.businessFlow || 'FORWARD',
        businessService: data.xpressbees.businessService || '',
        businessServices: data.xpressbees.businessServices || 'SD,SDD,NDD,AIR,SFC,IntraSDD',
        manifestServiceType: data.xpressbees.manifestServiceType || 'SD',
        manifestPickupType: data.xpressbees.manifestPickupType || 'Vendor',
        pincodeBusinessUnit: data.xpressbees.pincodeBusinessUnit || 'eComm',
        pincodeBusinessFlow: data.xpressbees.pincodeBusinessFlow || 'Forward',
        pickupBusinessService: data.xpressbees.pickupBusinessService || 'PickUp',
        deliveryBusinessService: data.xpressbees.deliveryBusinessService || 'Delivery',
        serviceabilityVersion: data.xpressbees.serviceabilityVersion || 'v1',
        trackingVersion: data.xpressbees.trackingVersion || 'v1',
        webhookSecret: '',
      })
    }
    if (data?.shadowfax) {
      setShadowfaxForm({
        apiBase: data.shadowfax.apiBase || '',
        clientName: data.shadowfax.clientName || '',
        apiKey: '',
        webhookSecret: '',
      })
    }
  }, [data])

  const handleSaveDelhivery = () => {
    updateDelhivery.mutate(
      {
        apiBase: form.apiBase,
        clientName: form.clientName,
        ...(form.apiKey ? { apiKey: form.apiKey } : {}),
      },
      {
        onSuccess: () => {
          toast({
            title: 'Delhivery credentials updated',
            status: 'success',
          })
          setForm((prev) => ({ ...prev, apiKey: '' }))
        },
        onError: (err) => {
          toast({
            title: 'Failed to update credentials',
            description: err?.message,
            status: 'error',
          })
        },
      },
    )
  }

  const handleSaveEkart = () => {
    updateEkart.mutate(
      {
        apiBase: ekartForm.apiBase,
        clientId: ekartForm.clientId,
        username: ekartForm.username,
        ...(ekartForm.password ? { password: ekartForm.password } : {}),
        ...(ekartForm.webhookSecret ? { webhookSecret: ekartForm.webhookSecret } : {}),
      },
      {
        onSuccess: () => {
          toast({ title: 'Ekart credentials updated', status: 'success' })
          setEkartForm((prev) => ({ ...prev, password: '', webhookSecret: '' }))
        },
        onError: (err) => {
          toast({
            title: 'Failed to update Ekart credentials',
            description: err?.message,
            status: 'error',
          })
        },
      },
    )
  }

  const handleSaveXpressbees = () => {
    updateXpressbees.mutate(
      {
        apiBase: xpressbeesForm.apiBase,
        username: xpressbeesForm.username,
        ...(xpressbeesForm.password ? { password: xpressbeesForm.password } : {}),
        ...(xpressbeesForm.apiKey ? { apiKey: xpressbeesForm.apiKey } : {}),
        ...(xpressbeesForm.authBearer ? { authBearer: xpressbeesForm.authBearer } : {}),
        ...(xpressbeesForm.secretKey ? { secretKey: xpressbeesForm.secretKey } : {}),
        ...(xpressbeesForm.xbKey ? { xbKey: xpressbeesForm.xbKey } : {}),
        ...(xpressbeesForm.xbAccessKey ? { xbAccessKey: xpressbeesForm.xbAccessKey } : {}),
        businessAccountName: xpressbeesForm.businessAccountName,
        pickupVendorCode: xpressbeesForm.pickupVendorCode,
        businessUnit: xpressbeesForm.businessUnit,
        businessFlow: xpressbeesForm.businessFlow,
        businessService: xpressbeesForm.businessService,
        businessServices: xpressbeesForm.businessServices,
        manifestServiceType: xpressbeesForm.manifestServiceType,
        manifestPickupType: xpressbeesForm.manifestPickupType,
        pincodeBusinessUnit: xpressbeesForm.pincodeBusinessUnit,
        pincodeBusinessFlow: xpressbeesForm.pincodeBusinessFlow,
        pickupBusinessService: xpressbeesForm.pickupBusinessService,
        deliveryBusinessService: xpressbeesForm.deliveryBusinessService,
        serviceabilityVersion: xpressbeesForm.serviceabilityVersion,
        trackingVersion: xpressbeesForm.trackingVersion,
        ...(xpressbeesForm.webhookSecret
          ? { webhookSecret: xpressbeesForm.webhookSecret }
          : {}),
      },
      {
        onSuccess: () => {
          toast({ title: 'Xpressbees credentials updated', status: 'success' })
          setXpressbeesForm((prev) => ({
            ...prev,
            password: '',
            apiKey: '',
            authBearer: '',
            secretKey: '',
            xbKey: '',
            xbAccessKey: '',
            webhookSecret: '',
          }))
        },
        onError: (err) => {
          toast({
            title: 'Failed to update Xpressbees credentials',
            description: err?.message,
            status: 'error',
          })
        },
      },
    )
  }

  const handleSaveXpressbeesAwbRange = () => {
    const startAwb = xpressbeesAwbForm.startAwb.trim()
    const endAwb = xpressbeesAwbForm.endAwb.trim()

    if (!startAwb || !endAwb) {
      toast({
        title: 'AWB range required',
        description: 'Enter both starting and ending AWB numbers.',
        status: 'warning',
      })
      return
    }

    updateXpressbeesAwbRange.mutate(
      { startAwb, endAwb },
      {
        onSuccess: () => {
          toast({ title: 'Xpressbees AWB range updated', status: 'success' })
          setXpressbeesAwbForm({ startAwb: '', endAwb: '' })
        },
        onError: (err) => {
          toast({
            title: 'Failed to update Xpressbees AWB range',
            description: err?.message,
            status: 'error',
          })
        },
      },
    )
  }

  const handleSaveShadowfax = () => {
    updateShadowfax.mutate(
      {
        apiBase: shadowfaxForm.apiBase,
        clientName: shadowfaxForm.clientName,
        ...(shadowfaxForm.apiKey ? { apiKey: shadowfaxForm.apiKey } : {}),
        ...(shadowfaxForm.webhookSecret ? { webhookSecret: shadowfaxForm.webhookSecret } : {}),
      },
      {
        onSuccess: () => {
          toast({ title: 'Shadowfax credentials updated', status: 'success' })
          setShadowfaxForm((prev) => ({ ...prev, apiKey: '', webhookSecret: '' }))
        },
        onError: (err) => {
          toast({
            title: 'Failed to update Shadowfax credentials',
            description: err?.message,
            status: 'error',
          })
        },
      },
    )
  }

  if (isLoading) return <Spinner size="md" />
  if (error) return <Text color="red.500">Failed to load courier credentials</Text>

  const xpressbeesManualAwb = data?.xpressbees?.manualAwb || {}
  const xpressbeesAwbRange = xpressbeesManualAwb?.range || null
  const xpressbeesAwbStatus = xpressbeesManualAwb?.active
    ? 'Active'
    : xpressbeesManualAwb?.configured
      ? 'Inactive'
      : 'Not configured'

  return (
    <Flex direction="column" pt={{ base: '120px', md: '75px' }} gap={4}>
      <Text fontSize="xl" fontWeight="bold">
        Courier Credentials
      </Text>

      <Flex gap={4} flexWrap="wrap">
        <Box
          borderWidth="1px"
          borderRadius="lg"
          p={5}
          minW="320px"
          flex="1"
          maxW="520px"
          mb={{ base: 4, md: 0 }}
        >
          <VStack spacing={4} align="stretch">
            <Flex justify="space-between" align="center">
              <Text fontWeight="semibold">Delhivery</Text>
              <Badge colorScheme={data?.delhivery?.hasApiKey ? 'green' : 'orange'}>
                {data?.delhivery?.hasApiKey ? 'Configured' : 'Missing API Key'}
              </Badge>
            </Flex>

            <FormControl>
              <FormLabel>API Base URL</FormLabel>
              <Input
                value={form.apiBase}
                onChange={(e) => setForm((prev) => ({ ...prev, apiBase: e.target.value }))}
                placeholder="https://track.delhivery.com"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Client Name</FormLabel>
              <Input
                value={form.clientName}
                onChange={(e) => setForm((prev) => ({ ...prev, clientName: e.target.value }))}
                placeholder="Your Delhivery client name"
              />
            </FormControl>

            <FormControl>
              <FormLabel>API Key</FormLabel>
              <Input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder={data?.delhivery?.apiKeyMasked || 'Enter Delhivery API key'}
              />
              {!!data?.delhivery?.apiKeyMasked && (
                <Text fontSize="xs" color="gray.500" mt={1}>
                  Current key: {data.delhivery.apiKeyMasked}
                </Text>
              )}
            </FormControl>

            <Text fontSize="xs" color="gray.500">
              Standard Delhivery credentials. Leave the API key blank to keep the existing secret.
            </Text>

            <Button
              colorScheme="blue"
              onClick={handleSaveDelhivery}
              isLoading={updateDelhivery.isPending}
              alignSelf="flex-start"
            >
              Save Delhivery Credentials
            </Button>
          </VStack>
        </Box>

        <Box borderWidth="1px" borderRadius="lg" p={5} minW="320px" flex="1" maxW="520px">
          <VStack spacing={4} align="stretch">
            <Flex justify="space-between" align="center">
              <Text fontWeight="semibold">Shadowfax</Text>
              <Badge colorScheme={data?.shadowfax?.hasApiKey ? 'green' : 'orange'}>
                {data?.shadowfax?.hasApiKey ? 'Configured' : 'Missing API Key'}
              </Badge>
            </Flex>

            <FormControl>
              <FormLabel>API Base URL</FormLabel>
              <Input
                value={shadowfaxForm.apiBase}
                onChange={(e) =>
                  setShadowfaxForm((prev) => ({ ...prev, apiBase: e.target.value }))
                }
                placeholder="https://dale.shadowfax.in/api"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Client Name</FormLabel>
              <Input
                value={shadowfaxForm.clientName}
                onChange={(e) =>
                  setShadowfaxForm((prev) => ({ ...prev, clientName: e.target.value }))
                }
                placeholder="Your Shadowfax client/account name"
              />
            </FormControl>

            <FormControl>
              <FormLabel>API Token</FormLabel>
              <Input
                type="password"
                value={shadowfaxForm.apiKey}
                onChange={(e) =>
                  setShadowfaxForm((prev) => ({ ...prev, apiKey: e.target.value }))
                }
                placeholder={data?.shadowfax?.apiKeyMasked || 'Enter Shadowfax API token'}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Webhook Secret</FormLabel>
              <Input
                type="password"
                value={shadowfaxForm.webhookSecret}
                onChange={(e) =>
                  setShadowfaxForm((prev) => ({ ...prev, webhookSecret: e.target.value }))
                }
                placeholder="Optional shared webhook secret"
              />
            </FormControl>

            <Button
              colorScheme="blue"
              onClick={handleSaveShadowfax}
              isLoading={updateShadowfax.isPending}
              alignSelf="flex-start"
            >
              Save Shadowfax Credentials
            </Button>
          </VStack>
        </Box>

        <Box borderWidth="1px" borderRadius="lg" p={5} minW="320px" flex="1" maxW="520px">
          <VStack spacing={4} align="stretch">
            <Flex justify="space-between" align="center">
              <Text fontWeight="semibold">Ekart Logistics</Text>
              <Badge colorScheme={data?.ekart?.hasPassword ? 'green' : 'orange'}>
                {data?.ekart?.hasPassword ? 'Credentials set' : 'Missing password'}
              </Badge>
            </Flex>

            <FormControl>
              <FormLabel>API Base URL</FormLabel>
              <Input
                value={ekartForm.apiBase}
                onChange={(e) => setEkartForm((prev) => ({ ...prev, apiBase: e.target.value }))}
                placeholder="https://app.elite.ekartlogistics.in"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Client ID</FormLabel>
              <Input
                value={ekartForm.clientId}
                onChange={(e) => setEkartForm((prev) => ({ ...prev, clientId: e.target.value }))}
                placeholder="Your Ekart client ID"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Username</FormLabel>
              <Input
                value={ekartForm.username}
                onChange={(e) => setEkartForm((prev) => ({ ...prev, username: e.target.value }))}
                placeholder="Ekart username"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Password</FormLabel>
              <Input
                type="password"
                value={ekartForm.password}
                onChange={(e) => setEkartForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Enter Ekart password (saved securely)"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Webhook Secret</FormLabel>
              <Input
                type="password"
                value={ekartForm.webhookSecret}
                onChange={(e) =>
                  setEkartForm((prev) => ({ ...prev, webhookSecret: e.target.value }))
                }
                placeholder="Leave blank to keep existing webhook secret"
              />
              {data?.ekart?.hasWebhookSecret && (
                <Text fontSize="xs" color="gray.500" mt={1}>
                  Webhook secret already configured on Ekart.
                </Text>
              )}
            </FormControl>

            <Text fontSize="xs" color="gray.500">
              Ekart requires client ID + username/password for token generation. Leave password blank to keep the saved secret.
            </Text>

            <Button
              colorScheme="blue"
              onClick={handleSaveEkart}
              isLoading={updateEkart.isPending}
              alignSelf="flex-start"
            >
              Save Ekart Credentials
            </Button>
          </VStack>
        </Box>

        <Box borderWidth="1px" borderRadius="lg" p={5} minW="320px" flex="1" maxW="520px">
          <VStack spacing={4} align="stretch">
            <Flex justify="space-between" align="center">
              <Text fontWeight="semibold">Xpressbees</Text>
              <Badge
                colorScheme={
                  data?.xpressbees?.hasApiKey ||
                  (data?.xpressbees?.hasPassword && data?.xpressbees?.hasSecretKey)
                    ? 'green'
                    : 'orange'
                }
              >
                {data?.xpressbees?.hasApiKey
                  ? 'API key set'
                  : data?.xpressbees?.hasPassword && data?.xpressbees?.hasSecretKey
                    ? 'Login configured'
                    : 'Missing token config'}
              </Badge>
            </Flex>

            <Box borderTopWidth="1px" pt={4}>
              <Flex justify="space-between" align="center" gap={3} mb={3}>
                <Text fontWeight="semibold">Manual AWB Range</Text>
                <Badge
                  colorScheme={
                    xpressbeesManualAwb?.active
                      ? 'green'
                      : xpressbeesManualAwb?.configured
                        ? 'orange'
                        : 'gray'
                  }
                >
                  {xpressbeesAwbStatus}
                </Badge>
              </Flex>

              <Flex gap={3} flexWrap="wrap" mb={4}>
                <Box minW="140px" flex="1">
                  <Text fontSize="xs" color="gray.500">
                    Current AWB
                  </Text>
                  <Text fontWeight="semibold" wordBreak="break-all">
                    {xpressbeesAwbRange?.currentAwb || 'Not configured'}
                  </Text>
                </Box>
                <Box minW="140px" flex="1">
                  <Text fontSize="xs" color="gray.500">
                    Range
                  </Text>
                  <Text fontWeight="semibold" wordBreak="break-all">
                    {xpressbeesAwbRange
                      ? `${xpressbeesAwbRange.startAwb} - ${xpressbeesAwbRange.endAwb}`
                      : 'Not configured'}
                  </Text>
                </Box>
                <Box minW="110px">
                  <Text fontSize="xs" color="gray.500">
                    Remaining
                  </Text>
                  <Text fontWeight="semibold">{xpressbeesAwbRange?.remainingCount ?? 0}</Text>
                </Box>
                <Box minW="110px">
                  <Text fontSize="xs" color="gray.500">
                    Used
                  </Text>
                  <Text fontWeight="semibold">{xpressbeesAwbRange?.usedCount ?? 0}</Text>
                </Box>
                <Box minW="110px">
                  <Text fontSize="xs" color="gray.500">
                    Failed
                  </Text>
                  <Text fontWeight="semibold">{xpressbeesAwbRange?.failedCount ?? 0}</Text>
                </Box>
              </Flex>

              <Flex gap={3} direction={{ base: 'column', md: 'row' }}>
                <FormControl>
                  <FormLabel>AWB Starting Number</FormLabel>
                  <Input
                    value={xpressbeesAwbForm.startAwb}
                    onChange={(e) =>
                      setXpressbeesAwbForm((prev) => ({ ...prev, startAwb: e.target.value }))
                    }
                    inputMode="numeric"
                    placeholder="Starting AWB"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>AWB Ending Number</FormLabel>
                  <Input
                    value={xpressbeesAwbForm.endAwb}
                    onChange={(e) =>
                      setXpressbeesAwbForm((prev) => ({ ...prev, endAwb: e.target.value }))
                    }
                    inputMode="numeric"
                    placeholder="Ending AWB"
                  />
                </FormControl>
              </Flex>

              <Button
                colorScheme="blue"
                variant="outline"
                onClick={handleSaveXpressbeesAwbRange}
                isLoading={updateXpressbeesAwbRange.isPending}
                mt={3}
                alignSelf="flex-start"
              >
                Save Manual AWB Range
              </Button>
            </Box>

            <FormControl>
              <FormLabel>API Base URL</FormLabel>
              <Input
                value={xpressbeesForm.apiBase}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({ ...prev, apiBase: e.target.value }))
                }
                placeholder="https://shipment.xpressbees.com"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Username / Email</FormLabel>
              <Input
                value={xpressbeesForm.username}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({ ...prev, username: e.target.value }))
                }
                placeholder="Xpressbees username or email"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Password</FormLabel>
              <Input
                type="password"
                value={xpressbeesForm.password}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="Leave blank to keep existing password"
              />
            </FormControl>

            <FormControl>
              <FormLabel>API Key / Token</FormLabel>
              <Input
                type="password"
                value={xpressbeesForm.apiKey}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({ ...prev, apiKey: e.target.value }))
                }
                placeholder={data?.xpressbees?.apiKeyMasked || 'Enter Xpressbees API key'}
              />
              {!!data?.xpressbees?.apiKeyMasked && (
                <Text fontSize="xs" color="gray.500" mt={1}>
                  Current key: {data.xpressbees.apiKeyMasked}
                </Text>
              )}
            </FormControl>

            <FormControl>
              <FormLabel>Auth Bearer</FormLabel>
              <Input
                type="password"
                value={xpressbeesForm.authBearer}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({ ...prev, authBearer: e.target.value }))
                }
                placeholder="Leave blank to keep existing auth bearer"
              />
              {data?.xpressbees?.hasAuthBearer && (
                <Text fontSize="xs" color="gray.500" mt={1}>
                  Auth bearer already configured on Xpressbees.
                </Text>
              )}
            </FormControl>

            <FormControl>
              <FormLabel>Secret Key</FormLabel>
              <Input
                type="password"
                value={xpressbeesForm.secretKey}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({ ...prev, secretKey: e.target.value }))
                }
                placeholder="Leave blank to keep existing secret key"
              />
              {data?.xpressbees?.hasSecretKey && (
                <Text fontSize="xs" color="gray.500" mt={1}>
                  Secret key already configured on Xpressbees.
                </Text>
              )}
            </FormControl>

            <FormControl>
              <FormLabel>XB Key</FormLabel>
              <Input
                type="password"
                value={xpressbeesForm.xbKey}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({ ...prev, xbKey: e.target.value }))
                }
                placeholder="Leave blank to keep existing XB key"
              />
              {data?.xpressbees?.hasXbKey && (
                <Text fontSize="xs" color="gray.500" mt={1}>
                  XB key already configured on Xpressbees.
                </Text>
              )}
            </FormControl>

            <FormControl>
              <FormLabel>XB Access Key</FormLabel>
              <Input
                type="password"
                value={xpressbeesForm.xbAccessKey}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({ ...prev, xbAccessKey: e.target.value }))
                }
                placeholder="Leave blank to keep existing XB access key"
              />
              {data?.xpressbees?.hasXbAccessKey && (
                <Text fontSize="xs" color="gray.500" mt={1}>
                  XB access key already configured on Xpressbees.
                </Text>
              )}
            </FormControl>

            <FormControl>
              <FormLabel>Business Account Name</FormLabel>
              <Input
                value={xpressbeesForm.businessAccountName}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({
                    ...prev,
                    businessAccountName: e.target.value,
                  }))
                }
                placeholder="Required for pre-ship manifest"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Pickup Vendor Code</FormLabel>
              <Input
                value={xpressbeesForm.pickupVendorCode}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({ ...prev, pickupVendorCode: e.target.value }))
                }
                placeholder="Default pickup vendor code"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Business Unit</FormLabel>
              <Input
                value={xpressbeesForm.businessUnit}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({ ...prev, businessUnit: e.target.value }))
                }
                placeholder="ECOM"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Business Flow</FormLabel>
              <Input
                value={xpressbeesForm.businessFlow}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({ ...prev, businessFlow: e.target.value }))
                }
                placeholder="FORWARD"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Business Services</FormLabel>
              <Input
                value={xpressbeesForm.businessServices}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({ ...prev, businessServices: e.target.value }))
                }
                placeholder="SD,SDD,NDD,AIR,SFC,IntraSDD"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Manifest Service Type</FormLabel>
              <Input
                value={xpressbeesForm.manifestServiceType}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({
                    ...prev,
                    manifestServiceType: e.target.value,
                  }))
                }
                placeholder="SD, SFC, AIR, SDD, NDD"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Manifest Pickup Type</FormLabel>
              <Input
                value={xpressbeesForm.manifestPickupType}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({
                    ...prev,
                    manifestPickupType: e.target.value,
                  }))
                }
                placeholder="Vendor"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Pincode Business Unit</FormLabel>
              <Input
                value={xpressbeesForm.pincodeBusinessUnit}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({
                    ...prev,
                    pincodeBusinessUnit: e.target.value,
                  }))
                }
                placeholder="eComm"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Pincode Business Flow</FormLabel>
              <Input
                value={xpressbeesForm.pincodeBusinessFlow}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({
                    ...prev,
                    pincodeBusinessFlow: e.target.value,
                  }))
                }
                placeholder="Forward"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Pickup Business Service</FormLabel>
              <Input
                value={xpressbeesForm.pickupBusinessService}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({
                    ...prev,
                    pickupBusinessService: e.target.value,
                  }))
                }
                placeholder="PickUp"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Delivery Business Service</FormLabel>
              <Input
                value={xpressbeesForm.deliveryBusinessService}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({
                    ...prev,
                    deliveryBusinessService: e.target.value,
                  }))
                }
                placeholder="Delivery"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Serviceability Version</FormLabel>
              <Input
                value={xpressbeesForm.serviceabilityVersion}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({
                    ...prev,
                    serviceabilityVersion: e.target.value,
                  }))
                }
                placeholder="v1"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Tracking Version</FormLabel>
              <Input
                value={xpressbeesForm.trackingVersion}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({ ...prev, trackingVersion: e.target.value }))
                }
                placeholder="v1"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Webhook Secret</FormLabel>
              <Input
                type="password"
                value={xpressbeesForm.webhookSecret}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({ ...prev, webhookSecret: e.target.value }))
                }
                placeholder="Leave blank to keep existing webhook secret"
              />
              {data?.xpressbees?.hasWebhookSecret && (
                <Text fontSize="xs" color="gray.500" mt={1}>
                  Webhook secret already configured on Xpressbees.
                </Text>
              )}
            </FormControl>

            <Text fontSize="xs" color="gray.500">
              Leave password, token, auth bearer, secret key, XB key, XB access key, or webhook
              secret blank to keep the saved value.
            </Text>

            <Button
              colorScheme="blue"
              onClick={handleSaveXpressbees}
              isLoading={updateXpressbees.isPending}
              alignSelf="flex-start"
            >
              Save Xpressbees Credentials
            </Button>
          </VStack>
        </Box>

      </Flex>
    </Flex>
  )
}

export default CourierCredentials
