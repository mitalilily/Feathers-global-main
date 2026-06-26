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
          fontWeight: '600',
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
            bg: 'rgba(4, 123, 133, 0.08)',
          },
        },
      },
      baseStyle: {
        borderRadius: '14px',
        fontWeight: '600',
        _focus: {
          boxShadow: 'none',
        },
      },
    },
  },
}
