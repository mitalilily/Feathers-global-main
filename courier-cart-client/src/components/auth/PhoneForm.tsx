import {
  Box,
  FormControlLabel,
  Link,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { FiMail } from 'react-icons/fi'
import { useRequestOtp } from '../../hooks/useOTP'
import { TERMS_AND_CONDITIONS } from '../../utils/constants'
import CustomIconLoadingButton from '../UI/button/CustomLoadingButton'
import CustomCheckbox from '../UI/inputs/CustomCheckbox'
import CustomInput from '../UI/inputs/CustomInput'
import CustomModal from '../UI/modal/CustomModal'
import { toast } from '../UI/Toast'
import OtpForm from './OtpForm'
import PasswordLoginForm from './PasswordLoginForm'

const BRAND_ORANGE = '#E85500'
const BRAND_DARK = '#141414'

const primaryButtonStyles = {
  width: '100%',
  borderRadius: 4,
  background: `linear-gradient(135deg, ${BRAND_ORANGE} 0%, #C23E00 100%)`,
  boxShadow: 'none',
  minHeight: 52,
}

const secondaryButtonStyles = {
  width: '100%',
  border: '1px solid rgba(20, 20, 20, 0.1)',
  backgroundColor: '#ffffff',
  color: BRAND_DARK,
  borderRadius: 4,
  minHeight: 48,
}

export default function PhoneForm() {
  const activeEmail = sessionStorage.getItem('activeEmail')
  const [step, setStep] = useState<number>(0)
  const [preferredLoginMethod, setPreferredLoginMethod] = useState<'phone' | 'password'>('phone')
  const [email, setEmail] = useState('')
  const [termsChecked, setTermsChecked] = useState(false)
  const [openTerms, setOpenTerms] = useState(false)

  const { mutate: sendOtpRequest, isPending } = useRequestOtp()

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value.trim())
  }, [])

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const isValidEmail = email.length > 0 && emailRegex.test(email)

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()

      if (!termsChecked) {
        toast.open({
          message: 'Please accept the Terms and Conditions to continue.',
          severity: 'warning',
          position: { vertical: 'top', horizontal: 'center' },
        })
        return
      }

      setPreferredLoginMethod('phone')
      sessionStorage.setItem('preferredMethod', 'phone')

      sendOtpRequest(email.toLowerCase().trim(), {
        onSuccess: () => setStep(1),
        onError: (err: any) => {
          const msg = err?.response?.data?.error || 'OTP request failed'
          toast.open({
            message: msg,
            severity: 'error',
            position: { vertical: 'top', horizontal: 'center' },
          })
        },
      })
    },
    [email, termsChecked, sendOtpRequest],
  )

  useEffect(() => {
    if (activeEmail) setEmail(activeEmail)
  }, [activeEmail])

  const termsLabel = (
    <Typography fontSize="13px" display="flex" alignItems="center" gap="3px" color="#6E6763">
      I agree to{' '}
      <Link
        component="button"
        underline="hover"
        onClick={() => setOpenTerms(true)}
        sx={{ cursor: 'pointer', color: BRAND_ORANGE, fontWeight: 800 }}
      >
        Terms and Conditions
      </Link>
    </Typography>
  )

  const renderOtpEntry = () =>
    step === 0 ? (
      <Box component="form" onSubmit={handleSubmit} width="100%">
        <Stack spacing={2}>
          <Box
            sx={{
              p: 1.5,
              border: '1px solid rgba(17,17,19,0.08)',
              background: '#faf7f4',
            }}
          >
            <Typography
              sx={{
                fontSize: '0.75rem',
                fontWeight: 800,
                color: BRAND_ORANGE,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                mb: 0.6,
              }}
            >
              Email Verification
            </Typography>

            <Typography sx={{ color: '#6E6763', fontSize: '0.88rem', lineHeight: 1.6 }}>
              We’ll send a one-time code to your registered work email for secure access.
            </Typography>
          </Box>

          <CustomInput
            type="email"
            label="Work Email"
            value={email}
            name="email"
            id="email"
            onChange={handleEmailChange}
            required
            error={email.length > 0 && !isValidEmail}
            helperText={email.length > 0 && !isValidEmail ? 'Enter a valid email address.' : ''}
            autoFocus
            prefix={<FiMail color={BRAND_ORANGE} size={15} />}
          />

          <FormControlLabel
            sx={{ m: 0, alignItems: 'flex-start' }}
            control={
              <CustomCheckbox
                checked={termsChecked}
                onChange={(e) => setTermsChecked(e.target.checked)}
                color="primary"
              />
            }
            label={
              <Typography mt={0.35} variant="body2">
                {termsLabel}
              </Typography>
            }
          />

          <CustomIconLoadingButton
            type="submit"
            styles={primaryButtonStyles}
            textColor="#ffffff"
            disabled={!email || !termsChecked || isPending || !isValidEmail}
            text="Send Verification Code"
            loading={isPending}
            loadingText="Sending..."
          />
        </Stack>
      </Box>
    ) : (
      <OtpForm email={email} onEditEmail={() => setStep(0)} />
    )

  return (
    <Stack spacing={2.2} alignItems="stretch">
      <Stack spacing={1.2}>
        <Typography
          sx={{
            fontSize: '1.05rem',
            fontWeight: 800,
            color: '#17171A',
            letterSpacing: '-0.01em',
          }}
        >
          Choose how you want to sign in
        </Typography>
      </Stack>

      <Box
        sx={{
          border: '1px solid rgba(17,17,19,0.08)',
          background: '#fff',
        }}
      >
        <Box
          sx={{
            px: 1.2,
            py: 1.2,
            borderBottom: '1px solid rgba(17,17,19,0.08)',
            background: '#f7f1ed',
          }}
        >
          <ToggleButtonGroup
            value={preferredLoginMethod}
            exclusive
            onChange={(_, value) => {
              if (!value) return
              setPreferredLoginMethod(value)
              setStep(0)
            }}
            fullWidth
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 1,
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                fontWeight: 800,
                border: '1px solid rgba(17,17,19,0.08) !important',
                color: '#6f6a67',
                px: 1.4,
                py: 1.15,
                justifyContent: 'center',
                backgroundColor: '#fffaf7',
                '&.Mui-selected': {
                  color: BRAND_DARK,
                  backgroundColor: '#ffffff',
                  boxShadow: 'inset 0 0 0 1px rgba(217,4,22,0.18)',
                },
              },
            }}
          >
            <ToggleButton value="phone">Email OTP</ToggleButton>
            <ToggleButton value="password">Email + Password</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box sx={{ p: { xs: 1.3, sm: 1.6 } }}>
          {preferredLoginMethod === 'phone' ? (
            renderOtpEntry()
          ) : (
            <PasswordLoginForm step={step} setOpenTerms={setOpenTerms} setStep={setStep} />
          )}
        </Box>
      </Box>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap: 1.2,
          flexDirection: { xs: 'column', sm: 'row' },
        }}
      >
        <Typography sx={{ fontSize: '0.8rem', color: '#6E6763', lineHeight: 1.6 }}>
          Need account policy details before signing in?
        </Typography>
        <CustomIconLoadingButton
          styles={secondaryButtonStyles}
          onClick={() => setOpenTerms(true)}
          variant="text"
          text="View Terms and Policies"
        />
      </Box>

      <CustomModal
        open={openTerms}
        onClose={() => setOpenTerms(false)}
        title="Terms and Conditions"
      >
        <Typography
          variant="body2"
          sx={{
            whiteSpace: 'pre-line',
            maxHeight: '60vh',
            overflowY: 'auto',
            pr: 1,
          }}
        >
          {TERMS_AND_CONDITIONS}
        </Typography>
      </CustomModal>
    </Stack>
  )
}
