/*eslint-disable*/
import { HamburgerIcon } from '@chakra-ui/icons'
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerOverlay,
  Flex,
  Stack,
  Text,
  useColorModeValue,
  useDisclosure,
} from '@chakra-ui/react'
import IconBox from 'components/Icons/IconBox'
import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { BRAND } from '../../constants/brand'
import BrandMark from '../Brand/BrandMark'

function SidebarResponsive(props) {
  const location = useLocation()
  const mainPanel = React.useRef()

  const activeRoute = (routeName) => (location.pathname === routeName ? 'active' : '')

  const drawerBg = useColorModeValue(
    `linear-gradient(180deg, ${BRAND.colors.paper} 0%, ${BRAND.colors.surface} 100%)`,
    '#111113',
  )
  const activeBg = useColorModeValue('rgba(4,123,133,0.12)', 'rgba(217, 4, 22, 0.16)')
  const hoverBg = useColorModeValue('rgba(4,123,133,0.06)', 'rgba(148, 163, 184, 0.14)')
  const textColor = useColorModeValue(BRAND.colors.text, 'gray.100')
  const iconColor = useColorModeValue(BRAND.colors.muted, 'gray.300')
  const activeTextColor = '#FFFFFF'
  const dividerColor = useColorModeValue(BRAND.colors.border, 'rgba(148, 163, 184, 0.24)')

  const createLinks = (routes) => {
    return routes
      .filter((prop) => prop.show !== false)
      .map((prop) => {
        if (prop.redirect) return null

        if (prop.category) {
          return (
            <Box key={prop.name}>
              <Text color={textColor} fontWeight="700" mb="10px" ps="12px" pt="6px">
                {document.documentElement.dir === 'rtl' ? prop.rtlName : prop.name}
              </Text>
              {createLinks(prop.views)}
            </Box>
          )
        }

        const isActive = activeRoute(prop.layout + prop.path) === 'active'

        return (
          <NavLink to={prop.layout + prop.path} key={prop.name}>
            <Button
              boxSize="initial"
              justifyContent="flex-start"
              alignItems="center"
              bg={isActive ? activeBg : 'transparent'}
              mb="8px"
              px="12px"
              py="11px"
              borderRadius="10px"
              w="100%"
              border="1px solid"
              borderColor={isActive ? 'rgba(4,123,133,0.18)' : 'transparent'}
              _hover={{ bg: hoverBg, transform: 'translateX(2px)' }}
              _active={{ bg: 'inherit', transform: 'none' }}
              _focus={{ boxShadow: 'none' }}
              transition="all 0.2s ease"
            >
              <Flex align="center">
                <IconBox
                  bg={isActive ? 'rgba(4,123,133,0.16)' : 'rgba(255,255,255,0.06)'}
                  color={isActive ? activeTextColor : iconColor}
                  h="30px"
                  w="30px"
                  me="12px"
                  borderRadius="8px"
                >
                  {prop.icon}
                </IconBox>
                <Text color={isActive ? activeTextColor : textColor} my="auto" fontSize="sm" fontWeight={isActive ? '700' : '600'}>
                  {document.documentElement.dir === 'rtl' ? prop.rtlName : prop.name}
                </Text>
              </Flex>
            </Button>
          </NavLink>
        )
      })
  }

  const { logoText, routes } = props
  const links = <>{createLinks(routes)}</>

  const brand = (
    <Box pt="24px" mb="10px">
      <Flex align="center" justify="center" gap="10px" mb="16px" fontWeight="bold">
        <BrandMark markOnly size={32} />
        <Text fontSize="sm" color={textColor} fontWeight="700">
          {logoText}
        </Text>
      </Flex>
      <Box h="1px" bg={dividerColor} mx="4px" mb="12px" />
    </Box>
  )

  const { isOpen, onOpen, onClose } = useDisclosure()
  const btnRef = React.useRef()
  const hamburgerColor = props.secondary ? 'white' : useColorModeValue('gray.600', 'gray.200')

  return (
    <Flex display={{ sm: 'flex', xl: 'none' }} ref={mainPanel} alignItems="center">
      <HamburgerIcon
        color={hamburgerColor}
        w="20px"
        h="20px"
        ref={btnRef}
        cursor="pointer"
        onClick={onOpen}
      />
      <Drawer
        isOpen={isOpen}
        onClose={onClose}
        placement={document.documentElement.dir === 'rtl' ? 'right' : 'left'}
        finalFocusRef={btnRef}
      >
        <DrawerOverlay bg="blackAlpha.500" backdropFilter="blur(5px)" />
        <DrawerContent w="280px" maxW="280px" borderRadius="0 18px 18px 0" bg={drawerBg}>
          <DrawerCloseButton _focus={{ boxShadow: 'none' }} color={textColor} />
          <DrawerBody px="14px" pt="2">
            <Box maxW="100%" h="100vh">
              {brand}
              <Stack direction="column" mb="40px">
                <Box>{links}</Box>
              </Stack>
            </Box>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Flex>
  )
}

export default SidebarResponsive
