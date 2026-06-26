import { Box, Flex, Stack, Text, useColorModeValue } from '@chakra-ui/react'
import { BRAND } from '../../constants/brand'

export default function BrandMark({
  compact = false,
  showTagline = false,
  align = 'center',
  size = 40,
  markOnly = false,
}) {
  const titleColor = useColorModeValue(BRAND.colors.ink, 'white')
  const subtitleColor = useColorModeValue(BRAND.colors.muted, 'gray.400')
  const pillBg = useColorModeValue('rgba(4, 123, 133, 0.08)', 'rgba(255, 255, 255, 0.08)')

  if (markOnly) {
    return (
      <Box
        as="img"
        src={BRAND.mark}
        alt={BRAND.name}
        w={`${size}px`}
        h={`${size}px`}
        objectFit="contain"
      />
    )
  }

  return (
    <Flex align="center" justify={align} gap={compact ? '10px' : '14px'}>
      <Box
        as="img"
        src={BRAND.logo}
        alt={BRAND.name}
        w={`${Math.round(size * 1.1)}px`}
        h={`${Math.round(size * 1.1)}px`}
        objectFit="contain"
        borderRadius="14px"
        bg={pillBg}
        p="2px"
      />
      <Stack spacing={0.5} align={align === 'center' ? 'center' : 'start'}>
        <Text fontSize={compact ? 'sm' : 'md'} fontWeight="800" color={titleColor} letterSpacing="-0.02em">
          {BRAND.name}
        </Text>
        {showTagline ? (
          <Text fontSize="xs" fontWeight="700" textTransform="uppercase" letterSpacing="0.12em" color={subtitleColor}>
            Admin Console
          </Text>
        ) : null}
      </Stack>
    </Flex>
  )
}
