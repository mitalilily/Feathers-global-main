import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons'
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  Heading,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  VStack,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react'
import { jwtDecode } from 'jwt-decode'
import { useEffect, useState } from 'react'
import { FiCheckCircle } from 'react-icons/fi'
import { useHistory } from 'react-router-dom'
import { loginAdmin } from '../../services/auth.service'
import { useAuthStore } from '../../store/useAuthStore'
import { BRAND } from '../../constants/brand'

function isTokenValid(token) {
  try {
    const decoded = jwtDecode(token)
    return decoded.exp > Date.now() / 1000
  } catch {
    return false
  }
}

function SignIn() {
  const pageBg = useColorModeValue(BRAND.colors.surface, '#111113')
  const shellBg = useColorModeValue('white', '#18181B')
  const shellBorder = useColorModeValue('rgba(215,238,241,0.95)', 'rgba(255,255,255,0.08)')
  const leftBg = useColorModeValue(
    'linear-gradient(145deg, #013f49 0%, #047b85 52%, #0d4f66 100%)',
    '#111113',
  )
  const leftBorder = useColorModeValue('rgba(255,255,255,0.12)', 'rgba(255,255,255,0.08)')
  const textPrimary = useColorModeValue(BRAND.colors.ink, 'white')
  const textSecondary = useColorModeValue('rgba(255,255,255,0.88)', 'rgba(255,255,255,0.72)')
  const inputBg = useColorModeValue('#F8FCFD', 'rgba(255,255,255,0.04)')
  const inputBorder = useColorModeValue('rgba(4,123,133,0.12)', 'rgba(255,255,255,0.1)')
  const iconHoverBg = useColorModeValue('rgba(4,123,133,0.08)', 'rgba(255,255,255,0.08)')

  const [email, setEmail] = useState(BRAND.adminEmail)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const toast = useToast()
  const history = useHistory()
  const login = useAuthStore((state) => state.login)

  useEffect(() => {
    document.title = `${BRAND.name} Admin | Sign In`
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const data = await loginAdmin(email, password)
      login(data.token, data?.user?.id, data.refreshToken)

      toast({
        title: 'Login successful',
        status: 'success',
        duration: 2000,
        isClosable: true,
      })

      history.push('/admin/dashboard')
    } catch (err) {
      toast({
        title: 'Login failed',
        description: err.response?.data?.error || 'Something went wrong',
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const accessToken = localStorage.getItem('accessToken')
    const refreshToken = localStorage.getItem('refreshToken')

    if (accessToken && refreshToken && isTokenValid(refreshToken)) {
      history.replace('/admin/dashboard')
    }
  }, [history])

  return (
    <Flex
      minH="100vh"
      bg={pageBg}
      align="center"
      justify="center"
      px={{ base: 4, md: 6 }}
      py={{ base: 6, md: 8 }}
      position="relative"
      overflow="hidden"
    >
      <Box
        position="absolute"
        inset="0"
        bgImage={useColorModeValue(
          'radial-gradient(circle at 10% 10%, rgba(4,123,133,0.08) 0%, transparent 42%), radial-gradient(circle at 92% 0%, rgba(255,130,28,0.08) 0%, transparent 34%)',
          'radial-gradient(circle at 10% 10%, rgba(4,123,133,0.16) 0%, transparent 42%), radial-gradient(circle at 92% 0%, rgba(255,255,255,0.06) 0%, transparent 34%)',
        )}
      />

      <Grid
        templateColumns={{ base: '1fr', lg: '1.05fr 0.95fr' }}
        w="100%"
        maxW="1200px"
        bg={shellBg}
        border="1px solid"
        borderColor={shellBorder}
        borderRadius={{ base: '16px', lg: '20px' }}
        boxShadow={useColorModeValue('0 24px 64px rgba(7,25,35,0.1)', '0 24px 60px rgba(5,4,10,0.42)')}
        overflow="hidden"
        zIndex="1"
      >
        <GridItem bg={leftBg} borderRight={{ base: 'none', lg: '1px solid' }} borderColor={leftBorder}>
          <VStack align="stretch" spacing={0} h="100%" p={{ base: 6, md: 8, lg: 10 }}>
            <HStack spacing={4} mb={{ base: 8, md: 10 }}>
              <Box
                as="img"
                src={BRAND.logo}
                alt={BRAND.name}
                h="54px"
                w="54px"
                objectFit="contain"
                borderRadius="10px"
                bg="white"
                p="1"
                border="1px solid rgba(17,17,19,0.08)"
              />
              <VStack align="start" spacing={0.5}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.18em" textTransform="uppercase" color="rgba(255,255,255,0.72)">
                  {BRAND.name}
                </Text>
                <Text fontSize="sm" fontWeight="700" color="white">
                  Admin Control Center
                </Text>
              </VStack>
            </HStack>

            <VStack align="start" spacing={5} maxW="560px">
              <Heading fontSize={{ base: '3xl', md: '4xl' }} lineHeight="1.02" letterSpacing="-0.04em" color="white">
                Run {BRAND.name} operations from one sharper admin command layer.
              </Heading>
              <Text color="rgba(255,255,255,0.88)" fontSize="md" lineHeight="1.9">
                Oversee pricing, users, serviceability, support, billing, and logistics execution
                from a cleaner admin console built for daily operational control.
              </Text>
            </VStack>

            <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={4} mt={{ base: 8, md: 10 }}>
              {[
                { title: 'Pricing', body: 'manage courier logic, plans, and platform commercials' },
                { title: 'Operations', body: 'review orders, NDR, RTO, and exception workflows' },
                { title: 'Support', body: 'track users, tickets, notifications, and admin actions' },
              ].map((item) => (
                <Box
                  key={item.title}
                  p={4}
                  borderRadius="10px"
                  bg="rgba(255,255,255,0.1)"
                  border="1px solid rgba(255,255,255,0.16)"
                >
                  <Text fontSize="sm" fontWeight="800" color="white">
                    {item.title}
                  </Text>
                  <Text mt={2} fontSize="sm" lineHeight="1.7" color="rgba(255,255,255,0.82)">
                    {item.body}
                  </Text>
                </Box>
              ))}
            </Grid>

            <VStack align="start" spacing={3} mt="auto" pt={{ base: 8, md: 12 }}>
              {[
                'Unified workspace for pricing, operations, and support',
                'Cleaner navigation across all admin routes',
                'Secure sign-in flow for platform administrators',
              ].map((item) => (
                <HStack key={item} spacing={3} align="start">
                  <Box pt="1">
                    <FiCheckCircle color="#F86B78" size={15} />
                  </Box>
                  <Text color="rgba(255,255,255,0.95)" fontSize="sm" fontWeight="600">
                    {item}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </VStack>
        </GridItem>

        <GridItem bg={shellBg}>
          <Flex h="100%" align="center" justify="center" px={{ base: 5, md: 8 }} py={{ base: 7, md: 9 }}>
            <Box as="form" onSubmit={handleSubmit} w="100%" maxW="440px">
              <VStack spacing={6} align="stretch">
                <Box>
                  <Text fontSize="xs" fontWeight="800" letterSpacing="0.16em" color="brand.500" mb={2}>
                    Secure Access
                  </Text>
                  <Heading fontSize={{ base: '2xl', md: '3xl' }} fontWeight="800" color={textPrimary} lineHeight="1.08" letterSpacing="-0.03em">
                    Sign in to {BRAND.name} Admin
                  </Heading>
                  <Text mt={2} color={textSecondary} fontSize="sm" lineHeight="1.8">
                    Enter your administrator credentials to continue to the {BRAND.name} control center.
                  </Text>
                </Box>

                <FormControl isRequired>
                  <FormLabel fontSize="sm" fontWeight="700" color={textPrimary} mb={2}>
                    Email
                  </FormLabel>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={BRAND.adminEmail}
                    h="50px"
                    borderRadius="10px"
                    bg={inputBg}
                    borderColor={inputBorder}
                    _hover={{ borderColor: 'brand.400' }}
                    _focus={{
                      borderColor: 'brand.500',
                      boxShadow: '0 0 0 3px rgba(4,123,133,0.12)',
                    }}
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel fontSize="sm" fontWeight="700" color={textPrimary} mb={2}>
                    Password
                  </FormLabel>
                  <InputGroup>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      h="50px"
                      borderRadius="10px"
                      bg={inputBg}
                      borderColor={inputBorder}
                      pr="48px"
                      _hover={{ borderColor: 'brand.400' }}
                      _focus={{
                        borderColor: 'brand.500',
                        boxShadow: '0 0 0 3px rgba(4,123,133,0.12)',
                      }}
                    />
                    <InputRightElement h="50px" pr="8px">
                      <IconButton
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                        variant="ghost"
                        size="sm"
                        color={textSecondary}
                        onClick={() => setShowPassword(!showPassword)}
                        _hover={{ bg: iconHoverBg, color: 'brand.500' }}
                      />
                    </InputRightElement>
                  </InputGroup>
                </FormControl>

                <Button
                  type="submit"
                  h="50px"
                  borderRadius="10px"
                  bg="brand.500"
                  color="white"
                  fontWeight="700"
                  isLoading={loading}
                  loadingText="Signing in"
                  _hover={{ bg: 'brand.600' }}
                  _active={{ bg: 'brand.700' }}
                >
                  Sign In
                </Button>
              </VStack>
            </Box>
          </Flex>
        </GridItem>
      </Grid>
    </Flex>
  )
}

export default SignIn
