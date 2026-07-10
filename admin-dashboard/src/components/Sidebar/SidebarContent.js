import { ChevronDownIcon } from '@chakra-ui/icons'
import { Box, Button, Collapse, Flex, Stack, Text, useColorModeValue } from '@chakra-ui/react'
import React, { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { BRAND } from '../../constants/brand'
import BrandMark from '../Brand/BrandMark'

const SidebarContent = ({ logoText, routes, sidebarWidth }) => {
  const location = useLocation()
  const [state, setState] = React.useState({})

  const sidebarBg = useColorModeValue(
    `linear-gradient(180deg, ${BRAND.colors.paper} 0%, ${BRAND.colors.surface} 100%)`,
    '#111113',
  )
  const sidebarBorder = useColorModeValue('rgba(215, 238, 241, 0.95)', 'rgba(255,255,255,0.06)')
  const sidebarShadow = useColorModeValue('14px 0 32px rgba(7, 25, 35, 0.08)', '14px 0 34px rgba(5, 4, 10, 0.45)')
  const activeBg = useColorModeValue('rgba(4,123,133,0.08)', 'rgba(255,255,255,0.08)')
  const hoverBg = useColorModeValue('rgba(4,123,133,0.05)', 'rgba(255,255,255,0.05)')
  const activeBorder = useColorModeValue('rgba(4,123,133,0.18)', 'rgba(255,255,255,0.12)')
  const hoverBorder = useColorModeValue('rgba(4,123,133,0.12)', 'rgba(255,255,255,0.08)')
  const iconBg = useColorModeValue('rgba(4,123,133,0.08)', 'rgba(255,255,255,0.06)')
  const iconActiveBg = useColorModeValue('rgba(4,123,133,0.16)', 'rgba(217,4,22,0.18)')
  const textColor = useColorModeValue(BRAND.colors.text, 'rgba(255,255,255,0.8)')
  const activeTextColor = useColorModeValue(BRAND.colors.tealDark, 'white')
  const iconColor = useColorModeValue(BRAND.colors.muted, 'rgba(255,255,255,0.56)')
  const dividerColor = useColorModeValue(BRAND.colors.border, 'rgba(255,255,255,0.08)')
  const thumbColor = useColorModeValue('rgba(4,123,133,0.22)', 'rgba(255,255,255,0.18)')
  const brandCardBg = useColorModeValue('rgba(255,255,255,0.92)', 'rgba(255,255,255,0.04)')
  const brandCardBorder = useColorModeValue(BRAND.colors.border, 'rgba(255,255,255,0.08)')
  const brandText = useColorModeValue(BRAND.colors.ink, 'white')
  const collapsedLogoBg = useColorModeValue('rgba(4,123,133,0.08)', 'rgba(255,255,255,0.08)')

  const activeRoute = (routeName) => location.pathname.startsWith(routeName)

  const toggleCollapse = (key) => {
    setState((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
    routes.forEach((route) => {
      if (route.category && route.views) {
        const isChildActive = route.views.some((view) =>
          location.pathname.startsWith(view.layout + view.path.split('/:')[0]),
        )
        if (isChildActive) {
          setState((prev) => ({ ...prev, [route.state]: true }))
        }
      }
    })
  }, [location.pathname, routes])

  const collapsed = sidebarWidth <= 160
  const compact = sidebarWidth > 160 && sidebarWidth < 220
  const textSize = compact ? 'sm' : 'sm'
  const showText = !collapsed

  const renderLinkButton = (prop, isActive) => (
    <Button
      justifyContent={collapsed ? 'center' : 'flex-start'}
      w="100%"
      bg={isActive ? activeBg : 'transparent'}
      borderRadius="10px"
      mb="1"
      px={collapsed ? '2' : '3'}
      py="10px"
      h="auto"
      border="1px solid"
      borderColor={isActive ? 'rgba(4,123,133,0.18)' : 'transparent'}
      _hover={{
        bg: hoverBg,
        transform: 'translateX(2px)',
        borderColor: hoverBorder,
      }}
      _active={{ transform: 'scale(0.98)' }}
      transition="all 0.2s ease"
    >
      <Flex align="center" gap="10px" w="100%">
        {prop.icon && (
          <Box
            p="6px"
            borderRadius="8px"
            bg={isActive ? iconActiveBg : iconBg}
            color={isActive ? '#FFFFFF' : iconColor}
            fontSize={collapsed ? '20px' : '18px'}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            {prop.icon}
          </Box>
        )}
        {showText && (
          <Text color={isActive ? activeTextColor : textColor} fontWeight={isActive ? '700' : '600'} fontSize={textSize}>
            {prop.name}
          </Text>
        )}
      </Flex>
    </Button>
  )

  const renderLinks = (items) =>
    items
      .filter((prop) => prop.show !== false)
      .map((prop) => {
        if (prop.redirect) return null

        if (prop.category) {
          const isChildActive = prop.views.some((view) =>
            location.pathname.startsWith(view.layout + view.path.split('/:')[0]),
          )

          return (
            <Box key={prop.name} mb="1">
              <Button
                onClick={() => toggleCollapse(prop.state)}
                justifyContent={collapsed ? 'center' : 'space-between'}
                w="100%"
                bg={isChildActive ? activeBg : 'transparent'}
                borderRadius="10px"
                mb="1"
                px={collapsed ? '2' : '3'}
                py="10px"
                h="auto"
                border="1px solid"
                borderColor={isChildActive ? activeBorder : 'transparent'}
                _hover={{
                  bg: hoverBg,
                  transform: 'translateX(2px)',
                }}
                transition="all 0.2s ease"
              >
                <Flex align="center" gap="10px" w="100%">
                  <Box
                    p="6px"
                    borderRadius="8px"
                    bg={isChildActive ? iconActiveBg : iconBg}
                    color={isChildActive ? '#FFFFFF' : iconColor}
                    fontSize={collapsed ? '20px' : '18px'}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    {prop.icon}
                  </Box>
                  {showText && (
                    <Text
                      color={isChildActive ? activeTextColor : textColor}
                      fontWeight={isChildActive ? '700' : '600'}
                      fontSize={textSize}
                      textAlign="left"
                      flex="1"
                    >
                      {prop.name}
                    </Text>
                  )}
                </Flex>
                {showText && (
                  <Box
                    transition="transform 0.2s"
                    transform={state[prop.state] ? 'rotate(180deg)' : 'rotate(0deg)'}
                    color={isChildActive ? BRAND.colors.teal : iconColor}
                  >
                    <ChevronDownIcon />
                  </Box>
                )}
              </Button>
              <Collapse in={state[prop.state]} animateOpacity>
                <Box pl={showText ? '12px' : '0'} pr={showText ? '8px' : '0'} mt="1">
                  <Stack spacing="1">{renderLinks(prop.views)}</Stack>
                </Box>
              </Collapse>
            </Box>
          )
        }

        const isActive = activeRoute(prop.layout + prop.path)
        return (
          <NavLink to={prop.layout + prop.path} key={prop.name}>
            {renderLinkButton(prop, isActive)}
          </NavLink>
        )
      })

  return (
    <Box
      pt="20px"
      pb="20px"
      h="100vh"
      w={`${sidebarWidth}px`}
      bg={sidebarBg}
      borderRight="1px solid"
      borderColor={sidebarBorder}
      boxShadow={sidebarShadow}
      position="fixed"
      left="0"
      top="0"
      transition="width 0.25s ease"
      overflowY="auto"
      overflowX="hidden"
      pr="2"
      css={{
        scrollbarWidth: 'thin',
        '&::-webkit-scrollbar': { width: '5px' },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': {
          background: thumbColor,
          borderRadius: '4px',
        },
      }}
    >
      <Box mb="20px" px="14px" textAlign="center" transition="all 0.3s ease">
        {showText ? (
          <Flex
            align="center"
            justify="center"
            gap="10px"
            px="12px"
            py="10px"
            borderRadius="14px"
            bg={brandCardBg}
            border="1px solid"
            borderColor={brandCardBorder}
          >
            <BrandMark compact showTagline size={34} />
          </Flex>
        ) : (
          <Box mx="auto" p="2px" borderRadius="10px" bg={collapsedLogoBg}>
            <BrandMark markOnly size={36} />
          </Box>
        )}
      </Box>

      <Box h="1px" bg={dividerColor} mx="14px" mb="14px" />

      <Stack direction="column" spacing="0.5" px="10px">
        {renderLinks(routes)}
      </Stack>
    </Box>
  )
}

export default SidebarContent
