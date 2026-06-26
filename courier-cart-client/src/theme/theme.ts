import { alpha, createTheme } from '@mui/material/styles'

const BRAND_ORANGE = '#E85500'
const BRAND_ORANGE_DARK = '#C23E00'
const BRAND_ORANGE_LIGHT = '#FF8C3C'
const BRAND_GREEN = '#28A800'
const BRAND_GREEN_DARK = '#1A7500'
const BRAND_GREEN_LIGHT = '#6FE000'
const BRAND_INK = '#141414'
const BRAND_SLATE = '#34343B'
const BRAND_MUTED = '#777780'
const BRAND_CANVAS = '#F7F5F2'
const BRAND_SURFACE = '#FFFFFF'
const BRAND_SURFACE_ALT = '#FAF8F5'
const BRAND_BORDER = '#EAE5DC'

const theme = createTheme({
  breakpoints: {
    values: {
      xs: 300,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1536,
    },
  },
  palette: {
    mode: 'light',
    primary: {
      main: BRAND_ORANGE,
      light: BRAND_ORANGE_LIGHT,
      dark: BRAND_ORANGE_DARK,
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: BRAND_GREEN,
      light: BRAND_GREEN_LIGHT,
      dark: BRAND_GREEN_DARK,
      contrastText: '#FFFFFF',
    },
    background: {
      default: BRAND_CANVAS,
      paper: BRAND_SURFACE,
    },
    text: {
      primary: BRAND_INK,
      secondary: BRAND_MUTED,
      disabled: '#AAA4A0',
    },
    divider: BRAND_BORDER,
    error: {
      main: '#C62828',
    },
    warning: {
      main: '#C97A12',
    },
    info: {
      main: '#2563EB',
    },
    success: {
      main: BRAND_GREEN,
    },
  },
  shape: {
    borderRadius: 6,
  },
  typography: {
    fontFamily: '"Manrope", "Segoe UI", sans-serif',
    h1: { color: BRAND_INK, fontWeight: 800, letterSpacing: '-0.04em' },
    h2: { color: BRAND_INK, fontWeight: 800, letterSpacing: '-0.04em' },
    h3: { color: BRAND_INK, fontWeight: 800, letterSpacing: '-0.03em' },
    h4: { color: BRAND_INK, fontWeight: 800, letterSpacing: '-0.03em' },
    h5: { color: BRAND_INK, fontWeight: 760, letterSpacing: '-0.02em' },
    h6: { color: BRAND_INK, fontWeight: 760, letterSpacing: '-0.02em' },
    subtitle1: { color: BRAND_SLATE, fontWeight: 700 },
    subtitle2: { color: BRAND_MUTED, fontWeight: 700, letterSpacing: '0.03em' },
    body1: { color: BRAND_SLATE, lineHeight: 1.65 },
    body2: { color: BRAND_MUTED, lineHeight: 1.55 },
    button: { fontWeight: 800, textTransform: 'none', letterSpacing: '0.01em' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': {
          colorScheme: 'light',
        },
        body: {
          color: BRAND_INK,
          background: `linear-gradient(180deg, ${BRAND_CANVAS} 0%, #F0EAE0 100%)`,
        },
        '#root': {
          minHeight: '100vh',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        rounded: {
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 8,
          backgroundColor: alpha(BRAND_SURFACE, 0.98),
          border: `1px solid ${BRAND_BORDER}`,
          boxShadow: '0 22px 60px rgba(20, 20, 20, 0.08)',
        },
      },
    },
    MuiContainer: {
      styleOverrides: {
        root: {
          paddingLeft: '0 !important',
          paddingRight: '0 !important',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 6,
          paddingInline: 18,
          minHeight: 42,
          fontWeight: 800,
          '&.Mui-disabled': {
            opacity: 0.72,
          },
        },
        containedPrimary: {
          background: `linear-gradient(135deg, ${BRAND_ORANGE} 0%, ${BRAND_ORANGE_DARK} 100%)`,
          color: '#FFFFFF',
          '&:hover': {
            background: `linear-gradient(135deg, ${BRAND_ORANGE_DARK} 0%, #9A3000 100%)`,
            boxShadow: `0 16px 32px ${alpha(BRAND_ORANGE, 0.32)}`,
          },
        },
        containedSecondary: {
          background: `linear-gradient(135deg, ${BRAND_GREEN} 0%, ${BRAND_GREEN_DARK} 100%)`,
          color: '#FFFFFF',
          '&:hover': {
            background: `linear-gradient(135deg, ${BRAND_GREEN_DARK} 0%, #105000 100%)`,
            boxShadow: `0 16px 30px ${alpha(BRAND_GREEN, 0.28)}`,
          },
        },
        outlined: {
          borderWidth: 1,
          borderColor: alpha(BRAND_INK, 0.12),
          color: BRAND_INK,
          backgroundColor: alpha(BRAND_SURFACE, 0.86),
          '&:hover': {
            borderWidth: 1,
            borderColor: alpha(BRAND_ORANGE, 0.28),
            backgroundColor: alpha(BRAND_ORANGE, 0.04),
          },
        },
        text: {
          color: BRAND_ORANGE_DARK,
          '&:hover': {
            backgroundColor: alpha(BRAND_ORANGE, 0.06),
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 800,
          letterSpacing: '0.03em',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          backgroundColor: alpha(BRAND_SURFACE_ALT, 0.96),
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
          '& fieldset': {
            borderColor: alpha(BRAND_INK, 0.1),
          },
          '&:hover fieldset': {
            borderColor: alpha(BRAND_ORANGE, 0.26),
          },
          '&.Mui-focused': {
            backgroundColor: BRAND_SURFACE,
            boxShadow: `0 0 0 4px ${alpha(BRAND_ORANGE, 0.08)}`,
          },
          '&.Mui-focused fieldset': {
            borderColor: BRAND_ORANGE,
          },
        },
        input: {
          paddingTop: 13,
          paddingBottom: 13,
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: BRAND_MUTED,
          fontWeight: 600,
          '&.Mui-focused': {
            color: BRAND_ORANGE,
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(BRAND_SURFACE, 0.92),
          color: BRAND_INK,
          border: `1px solid ${alpha(BRAND_INK, 0.06)}`,
          backdropFilter: 'blur(16px)',
          boxShadow: '0 12px 32px rgba(20, 20, 20, 0.06)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: alpha(BRAND_INK, 0.08),
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: BRAND_SURFACE_ALT,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          color: BRAND_INK,
          fontWeight: 800,
          fontSize: '0.78rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          borderBottom: `1px solid ${alpha(BRAND_INK, 0.08)}`,
        },
        body: {
          color: BRAND_SLATE,
          borderBottom: `1px solid ${alpha(BRAND_INK, 0.06)}`,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: alpha(BRAND_ORANGE, 0.025),
          },
        },
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        toolbar: {
          paddingInline: 8,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: 2,
          background: `linear-gradient(90deg, ${BRAND_ORANGE} 0%, ${BRAND_ORANGE_LIGHT} 100%)`,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          minHeight: 46,
          fontWeight: 800,
          color: BRAND_MUTED,
          '&.Mui-selected': {
            color: BRAND_ORANGE_DARK,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
          border: `1px solid ${alpha(BRAND_INK, 0.08)}`,
          boxShadow: '0 28px 70px rgba(20, 20, 20, 0.14)',
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
          border: `1px solid ${alpha(BRAND_INK, 0.08)}`,
          boxShadow: '0 24px 50px rgba(20, 20, 20, 0.12)',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
  },
})

export default theme
