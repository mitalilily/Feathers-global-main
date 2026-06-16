import { mode } from '@chakra-ui/theme-tools'
import colors from './foundations/colors'
import { BRAND, brandGradient } from '../constants/brand'

export const globalStyles = {
  colors: {
    ...colors,
  },
  styles: {
    global: (props) => ({
      body: {
        bg: mode(BRAND.colors.surface, '#111113')(props),
        color: mode(BRAND.colors.text, 'gray.100')(props),
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        backgroundImage: mode(brandGradient, 'radial-gradient(circle at 10% 8%, rgba(4,123,133,0.16) 0%, transparent 38%), radial-gradient(circle at 90% 0%, rgba(255,255,255,0.06) 0%, transparent 24%)')(props),
      },
      html: {
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      },
      '#root': {
        minHeight: '100vh',
      },
      '::selection': {
        background: mode('brand.200', 'brand.600')(props),
      },
    }),
  },
}
