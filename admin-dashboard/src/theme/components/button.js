export const buttonStyles = {
  components: {
    Button: {
      variants: {
        'no-hover': {
          _hover: {
            boxShadow: 'none',
          },
        },
        'transparent-with-icon': {
          bg: 'transparent',
          fontWeight: '700',
          borderRadius: '14px',
          cursor: 'pointer',
          _active: {
            bg: 'transparent',
            transform: 'none',
            borderColor: 'transparent',
          },
          _focus: {
            boxShadow: 'none',
          },
          _hover: {
            bg: 'rgba(111, 34, 198, 0.06)',
          },
        },
      },
      baseStyle: {
        borderRadius: '14px',
        fontWeight: '700',
        _focus: {
          boxShadow: 'none',
        },
      },
    },
  },
}
