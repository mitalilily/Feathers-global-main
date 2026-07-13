import { Box } from '@mui/material'
import Checkbox, { type CheckboxProps } from '@mui/material/Checkbox'

const CHECKBOX_BLUE = '#0052B8'

const CustomTick = ({ checked }: { checked?: boolean }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="#FFFFFF"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: checked ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.85)',
      pointerEvents: 'none',
      opacity: checked ? 1 : 0,
      transition: 'opacity 0.12s ease, transform 0.12s ease',
    }}
  >
    <polyline points="3 8.4 6.6 12 13 4.4" />
  </svg>
)

export default function CustomCheckbox(props: CheckboxProps) {
  const checkboxSx: CheckboxProps['sx'] = {
    padding: '8px',
    '&:hover': {
      backgroundColor: 'rgba(0, 82, 184, 0.06)',
    },
    '&.Mui-focusVisible': {
      outline: `2px solid ${CHECKBOX_BLUE}`,
      outlineOffset: '2px',
      borderRadius: '4px',
    },
    '& .MuiTouchRipple-root': {
      color: 'rgba(0, 82, 184, 0.22)',
    },
  }

  return (
    <Checkbox
      {...props}
      disableRipple={false}
      color="primary"
      icon={
        <Box
          sx={{
            width: 16,
            height: 16,
            borderRadius: '2px',
            border: '1.5px solid #8EA3BC',
            boxSizing: 'border-box',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            backgroundColor: '#FFFFFF',
            transition: 'all 0.2s ease',
            '&:hover': {
              borderColor: CHECKBOX_BLUE,
              boxShadow: '0 0 0 3px rgba(0, 82, 184, 0.12)',
            },
          }}
        />
      }
      checkedIcon={
        <Box
          sx={{
            width: 16,
            height: 16,
            borderRadius: '2px',
            border: `1.5px solid ${CHECKBOX_BLUE}`,
            boxSizing: 'border-box',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            backgroundColor: CHECKBOX_BLUE,
            transition: 'all 0.2s ease',
            overflow: 'hidden',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)',
            '&:hover': {
              borderColor: CHECKBOX_BLUE,
              boxShadow: '0 0 0 3px rgba(0, 82, 184, 0.16), inset 0 1px 0 rgba(255,255,255,0.22)',
            },
          }}
        >
          <CustomTick checked />
        </Box>
      }
      sx={Array.isArray(props.sx) ? [checkboxSx, ...props.sx] : [checkboxSx, props.sx]}
    />
  )
}
