/*eslint-disable*/
// chakra imports
import { Box, useColorModeValue } from '@chakra-ui/react'
import React from 'react'
import SidebarContent from './SidebarContent'
import { BRAND } from '../../constants/brand'

function Sidebar(props) {
  const mainPanel = React.useRef()
  let variantChange = '0.2s linear'

  const { logoText, routes, sidebarVariant, sidebarWidth } = props

  //  BRAND
  let sidebarBg = 'none'
  let sidebarRadius = '0px'
  let sidebarMargins = '0px'
  if (sidebarVariant === 'opaque') {
    sidebarBg = useColorModeValue('#111113', '#111113')
    sidebarRadius = '18px'
    sidebarMargins = '16px 0px 16px 16px'
  }

  // SIDEBAR
  return (
    <Box ref={mainPanel}>
      <Box display={{ sm: 'none', xl: 'block' }} position="fixed">
        <Box
          bg={sidebarBg}
          transition={variantChange}
          w={`${sidebarWidth}px`} // ✅ dynamic width from Dashboard
          maxW="400px"
          minW="200px"
          ms={{ sm: '16px' }}
          my={{ sm: '16px' }}
          h="calc(100vh - 32px)"
          ps="20px"
          pe="20px"
          m={sidebarMargins}
          borderRadius={sidebarRadius}
        >
          <SidebarContent
            sidebarWidth={sidebarWidth}
            routes={routes}
            logoText={logoText || BRAND.name}
            sidebarVariant={sidebarVariant}
          />
        </Box>
      </Box>
    </Box>
  )
}

export default Sidebar
