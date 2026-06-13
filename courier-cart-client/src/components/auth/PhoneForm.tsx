import {
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useCallback, useEffect, useState } from 'react'
import { FiFileText, FiLock, FiMail, FiSend, FiShield } from 'react-icons/fi'
import { BRAND } from '../../config/brand'
import { useRequestOtp } from '../../hooks/useOTP'
import { TERMS_AND_CONDITIONS } from '../../utils/constants'
import CustomCheckbox from '../UI/inputs/CustomCheckbox'
import CustomModal from '../UI/modal/CustomModal'
import { toast } from '../UI/Toast'
import OtpForm from './OtpForm'
import PasswordLoginForm from './PasswordLoginForm'

const { teal, tealDark, ink, paper, tealSoft } = BRAND.colors

type RequestOtpResponse = {
  devOtp?: string
  otp?: string
}

type AuthMode = 'otp' | 'password'

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    minHeight: 52,
    borderRadius: 1.25,
    background: paper,
    color: ink,
    boxShadow: `inset 0 1px 0 ${alpha('#ffffff', 0.9)}`,
    '& fieldset': {
      borderColor: alpha('#5b7796', 0.28),
    },
    '&:hover fieldset': {
      borderColor: alpha(teal, 0.55),
    },
    '&.Mui-focused fieldset': {
      borderColor: teal,
      borderWidth: 1.5,
    },
  },
  '& .MuiOutlinedInput-input': {
    py: 1.35,
    fontSize: 16,
    color: ink,
    fontWeight: 500,
    '&::placeholder': {
      color: '#7890ad',
      opacity: 0.82,
    },
  },
  '& .MuiFormHelperText-root': {
    ml: 0,
    mt: 0.65,
    fontWeight: 600,
  },
}

const tabButtonSx = {
  minHeight: 52,
  borderRadius: 1,
  textTransform: 'none',
  fontWeight: 900,
  fontSize: 15,
  gap: 1,
}

export default function PhoneForm() {
  const activeEmail = sessionStorage.getItem('activeEmail')
  const [authMode, setAuthMode] = useState<AuthMode>('otp')
  const [otpStep, setOtpStep] = useState<number>(0)
  const [passwordStep, setPasswordStep] = useState<number>(0)
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
          if (otpFromResponse) {
            console.log('[AUTH OTP]', { email: normalizedEmail, otp: otpFromResponse })
          }
          setDebugOtp(otpFromResponse)
          sessionStorage.setItem('preferredMethod', 'email_otp')
          setOtpStep(1)
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
    <Typography component="span" fontSize="15px" color="#263a59" sx={{ lineHeight: 1.45 }}>
      I agree to{' '}
      <Link
        component="button"
        type="button"
        underline="hover"
        onClick={(event) => {
          event.preventDefault()
          setOpenTerms(true)
        }}
        sx={{
          cursor: 'pointer',
          color: teal,
          fontWeight: 900,
          verticalAlign: 'baseline',
        }}
      >
        Terms and Conditions
      </Link>
    </Typography>
  )

  const termsModal = (
    <CustomModal open={openTerms} onClose={() => setOpenTerms(false)} title="Terms and Conditions">
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
  )

  if (authMode === 'otp' && otpStep === 1) {
    return (
      <>
        <OtpForm email={email} debugOtp={debugOtp} onDebugOtpChange={setDebugOtp} onEditEmail={() => setOtpStep(0)} />
        {termsModal}
      </>
    )
  }

  return (
    <Stack spacing={{ xs: 1.35, md: 1.45 }} alignItems="stretch">
      <Box
        sx={{
          width: 'fit-content',
          maxWidth: '100%',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          px: 1.55,
          py: 0.9,
          borderRadius: 1,
          color: '#ff6200',
          background: 'linear-gradient(135deg, rgba(255,130,28,0.12), rgba(255,221,174,0.26))',
          fontSize: 14,
          fontWeight: 900,
        }}
      >
        <FiShield size={18} />
        Secure email verification enabled
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 0.65,
          p: 0.3,
          borderRadius: 1.35,
          border: `1px solid ${alpha('#9eb2c8', 0.32)}`,
          background: alpha(paper, 0.64),
        }}
      >
        <Button
          type="button"
          onClick={() => setAuthMode('otp')}
          sx={{
            ...tabButtonSx,
            color: authMode === 'otp' ? teal : '#102344',
            border: `1px solid ${authMode === 'otp' ? teal : 'transparent'}`,
            background: authMode === 'otp' ? paper : 'transparent',
            boxShadow: authMode === 'otp' ? `0 12px 22px ${alpha(teal, 0.08)}` : 'none',
            '&:hover': {
              background: authMode === 'otp' ? paper : alpha(tealSoft, 0.44),
            },
          }}
        >
          <FiMail size={20} />
          Email OTP
        </Button>
        <Button
          type="button"
          onClick={() => setAuthMode('password')}
          sx={{
            ...tabButtonSx,
            color: authMode === 'password' ? teal : '#102344',
            border: `1px solid ${authMode === 'password' ? teal : 'transparent'}`,
            background: authMode === 'password' ? paper : 'transparent',
            boxShadow: authMode === 'password' ? `0 12px 22px ${alpha(teal, 0.08)}` : 'none',
            '&:hover': {
              background: authMode === 'password' ? paper : alpha(tealSoft, 0.44),
            },
          }}
        >
          <FiLock size={19} />
          Email + Password
        </Button>
      </Box>

      {authMode === 'otp' ? (
        <Box component="form" onSubmit={handleSubmit} width="100%">
          <Stack spacing={{ xs: 1.35, md: 1.45 }}>
            <Box>
              <Typography sx={{ color: '#081932', fontSize: 14, fontWeight: 900, mb: 0.9 }}>
                Work Email <Box component="span" sx={{ color: '#e1261c' }}>*</Box>
              </Typography>
              <TextField
                type="email"
                value={email}
                name="email"
                id="email"
                onChange={handleEmailChange}
                required
                error={email.length > 0 && !isValidEmail}
                helperText={email.length > 0 && !isValidEmail ? 'Enter a valid email address.' : ''}
                placeholder="you@company.com"
                autoFocus
                fullWidth
                sx={fieldSx}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start" sx={{ color: '#385373', mr: 0.7 }}>
                        <FiMail size={22} />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Box>

            <FormControlLabel
              sx={{ m: 0, alignItems: 'center' }}
              control={
                <CustomCheckbox
                  checked={termsChecked}
                  onChange={(e) => setTermsChecked(e.target.checked)}
                  color="primary"
                  sx={{ ml: -1 }}
                />
              }
              label={termsLabel}
            />

            <Button
              type="submit"
              disabled={!email || !termsChecked || isPending || !isValidEmail}
              sx={{
                width: '100%',
                minHeight: 50,
                borderRadius: 1,
                textTransform: 'none',
                color: paper,
                fontSize: 15.5,
                fontWeight: 900,
                gap: 1.1,
                background: `linear-gradient(135deg, ${teal} 0%, ${tealDark} 100%)`,
                boxShadow: `0 16px 26px ${alpha(teal, 0.18)}`,
                '&:hover': {
                  background: `linear-gradient(135deg, ${tealDark} 0%, ${teal} 100%)`,
                },
                '&:disabled': {
                  color: paper,
                  background: '#94b8bd',
                  boxShadow: 'none',
                },
              }}
            >
              {isPending ? <CircularProgress size={18} thickness={4} sx={{ color: 'currentColor' }} /> : <FiSend size={20} />}
              {isPending ? 'Generating...' : 'Send verification code'}
            </Button>

            <Divider
              sx={{
                color: '#263a59',
                fontSize: 14,
                '&::before, &::after': {
                  borderColor: alpha('#9eb2c8', 0.34),
                },
              }}
            >
              or
            </Divider>

            <Button
              type="button"
              onClick={() => setOpenTerms(true)}
              sx={{
                width: '100%',
                minHeight: 50,
                borderRadius: 1,
                textTransform: 'none',
                color: '#102344',
                fontSize: 15.5,
                fontWeight: 900,
                gap: 1,
                border: `1px solid ${alpha('#9eb2c8', 0.42)}`,
                background: paper,
                '&:hover': {
                  borderColor: alpha(teal, 0.45),
                  background: alpha(tealSoft, 0.32),
                },
              }}
            >
              <FiFileText size={20} />
              View terms and policies
            </Button>

          </Stack>
        </Box>
      ) : (
        <PasswordLoginForm setStep={setPasswordStep} step={passwordStep} setOpenTerms={setOpenTerms} />
      )}

      {termsModal}
    </Stack>
  )
}
