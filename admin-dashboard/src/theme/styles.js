import { mode } from '@chakra-ui/theme-tools'
import colors from './foundations/colors'

export const globalStyles = {
  colors: {
    ...colors,
  },
  styles: {
    global: (props) => ({
      body: {
        bg: mode('#F1ECE8', '#111113')(props),
        color: mode('gray.800', 'gray.100')(props),
        fontFamily: "'Open Sans', 'Segoe UI', sans-serif",
        backgroundImage: mode(
          'radial-gradient(circle at 8% 10%, rgba(217,4,22,0.08) 0%, transparent 34%), radial-gradient(circle at 95% 0%, rgba(52,52,59,0.08) 0%, transparent 26%)',
          'radial-gradient(circle at 10% 8%, rgba(217,4,22,0.18) 0%, transparent 38%), radial-gradient(circle at 90% 0%, rgba(255,255,255,0.06) 0%, transparent 24%)',
        ),
      },
      html: {
        fontFamily: "'Open Sans', 'Segoe UI', sans-serif",
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
