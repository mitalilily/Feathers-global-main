import { Box, FormControlLabel, Link, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useCallback, useEffect, useState } from 'react'
import { FiMail } from 'react-icons/fi'
import { BRAND } from '../../config/brand'
import { useRequestOtp } from '../../hooks/useOTP'
import { TERMS_AND_CONDITIONS } from '../../utils/constants'
import CustomIconLoadingButton from '../UI/button/CustomLoadingButton'
import CustomCheckbox from '../UI/inputs/CustomCheckbox'
import CustomInput from '../UI/inputs/CustomInput'
import CustomModal from '../UI/modal/CustomModal'
import { toast } from '../UI/Toast'
import OtpForm from './OtpForm'

const { teal, orange, ink, muted, paper } = BRAND.colors

const primaryButtonStyles = {
  width: '100%',
  borderRadius: 2,
  background: `linear-gradient(135deg, ${teal} 0%, ${BRAND.colors.tealDark} 100%)`,
  boxShadow: `0 14px 28px ${alpha(teal, 0.18)}`,
  minHeight: 52,
}

const secondaryButtonStyles = {
  width: '100%',
  border: `1px solid ${alpha(teal, 0.22)}`,
  backgroundColor: alpha(paper, 0.86),
  color: teal,
  borderRadius: 2,
  minHeight: 46,
}

type RequestOtpResponse = {
  devOtp?: string
  otp?: string
}

export default function PhoneForm() {
  const activeEmail = sessionStorage.getItem('activeEmail')
  const [step, setStep] = useState<number>(0)
  const [email, setEmail] = useState('')
  const [termsChecked, setTermsChecked] = useState(false)
  const [openTerms, setOpenTerms] = useState(false)
  const [debugOtp, setDebugOtp] = useState('')

  const { mutate: sendOtpRequest, isPending } = useRequestOtp()

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value.trim())
    setDebugOtp('')
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

      const normalizedEmail = email.toLowerCase().trim()

      sendOtpRequest(normalizedEmail, {
        onSuccess: (data: RequestOtpResponse) => {
          const otpFromResponse = data?.devOtp ?? data?.otp ?? ''
          setDebugOtp(otpFromResponse)
          sessionStorage.setItem('preferredMethod', 'email_otp')
          setStep(1)
        },
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
    <Typography fontSize="13px" display="flex" alignItems="center" gap="3px" color={muted}>
      I agree to{' '}
      <Link
        component="button"
        underline="hover"
        onClick={() => setOpenTerms(true)}
        sx={{ cursor: 'pointer', color: teal, fontWeight: 800 }}
      >
        Terms and Conditions
      </Link>
    </Typography>
  )

  return (
    <Stack spacing={2.2} alignItems="stretch">
      {step === 0 ? (
        <Box component="form" onSubmit={handleSubmit} width="100%">
          <Stack spacing={2}>
            <Box
              sx={{
                p: 1.6,
                border: `1px solid ${alpha(teal, 0.14)}`,
                background: `linear-gradient(180deg, ${alpha(BRAND.colors.tealSoft, 0.82)}, ${alpha(paper, 0.92)})`,
                borderRadius: 2,
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  color: orange,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  mb: 0.6,
                }}
              >
                Email OTP
              </Typography>

              <Typography sx={{ color: muted, fontSize: '0.88rem', lineHeight: 1.65 }}>
                Use your registered work email. The temporary OTP is also shown on this screen for
                testing.
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
              prefix={<FiMail color={teal} size={15} />}
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
              loadingText="Generating..."
            />
          </Stack>
        </Box>
      ) : (
        <OtpForm email={email} debugOtp={debugOtp} onDebugOtpChange={setDebugOtp} onEditEmail={() => setStep(0)} />
      )}

      <Box
        sx={{
          p: 1.5,
          borderRadius: 2,
          border: `1px solid ${alpha(teal, 0.12)}`,
          background: alpha(paper, 0.72),
        }}
      >
        <Typography sx={{ fontSize: '0.8rem', color: muted, lineHeight: 1.6 }}>
          Need account policy details before signing in?
        </Typography>
        <Box sx={{ mt: 1 }}>
          <CustomIconLoadingButton
            styles={secondaryButtonStyles}
            onClick={() => setOpenTerms(true)}
            variant="text"
            text="View Terms and Policies"
          />
        </Box>
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
            color: ink,
          }}
        >
          {TERMS_AND_CONDITIONS}
        </Typography>
      </CustomModal>
    </Stack>
  )
}
