import { Box, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useEffect, useState } from 'react'
import { FiEdit2, FiMail } from 'react-icons/fi'
import { useAuth } from '../../context/auth/AuthContext'
import { useVerifyEmailOtp } from '../../hooks/useRequestPasswordLogin'
import CustomIconLoadingButton from '../UI/button/CustomLoadingButton'
import CustomInput from '../UI/inputs/CustomInput'
import { toast } from '../UI/Toast'

const BRAND_NAVY = '#047b85'
const BRAND_ORANGE = '#ff821c'

const primaryButtonStyles = {
  width: '100%',
  borderRadius: '12px',
  background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, #047b85 100%)`,
  boxShadow: '0 10px 24px rgba(13, 59, 142, 0.24)',
}

const secondaryButtonStyles = {
  width: '100%',
  border: `1px solid ${alpha(BRAND_NAVY, 0.28)}`,
  color: BRAND_NAVY,
  backgroundColor: alpha(BRAND_NAVY, 0.05),
  borderRadius: '12px',
}

interface IEmailVerificationProps {
  email: string
  onEditEmail: () => void
  password: string
  resendMail: () => void
}

export default function EmailVerificationForm({
  email,
  password,
  onEditEmail,
  resendMail,
}: IEmailVerificationProps) {
  const { setTokens, setUserId } = useAuth()

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(30)

  const { mutate: verifyEmailOtp, isPending } = useVerifyEmailOtp()

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  const handleSubmit = () => {
    setTouched(true)

    if (!code) {
      setError('Verification code is required.')
      return
    }

    verifyEmailOtp(
      { email, otp: code, password },
      {
        onSuccess: ({ token, refreshToken, user }) => {
          setTokens(token, refreshToken, user)
          setUserId(user?.id)
          sessionStorage.setItem('activeEmail', email)
          setError('')
          toast.open({
            message: 'Email verified successfully',
            severity: 'success',
          })
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (err: any) => {
          setError(err?.response?.data?.message || 'Invalid code. Please try again.')
        },
      },
    )
  }

  const handleResend = () => {
    resendMail()
    setResendCooldown(30)
  }

  return (
    <Stack spacing={2.2} width="100%">
      <Box
        sx={{
          p: 1.6,
          borderRadius: 2.5,
          backgroundColor: alpha(BRAND_ORANGE, 0.13),
          border: `1px solid ${alpha(BRAND_ORANGE, 0.24)}`,
        }}
      >
        <Typography variant="body2" sx={{ color: '#7d4100', lineHeight: 1.6 }}>
          Verification mail sent to <strong>{email}</strong>.
          <Box
            component="span"
            sx={{ ml: 0.8, display: 'inline-flex', alignItems: 'center', cursor: 'pointer', color: BRAND_NAVY }}
            onClick={onEditEmail}
          >
            <FiEdit2 size={13} style={{ marginRight: 4 }} />
            Edit
          </Box>
        </Typography>
      </Box>

      <CustomInput
        label="Email Verification Code"
        type="text"
        prefix={<FiMail color={BRAND_NAVY} size={15} />}
        value={code}
        onChange={(e) => {
          setCode(e.target.value)
          if (touched) setError('')
        }}
        onBlur={() => setTouched(true)}
        required
        helperText={touched && error}
        error={touched && !!error}
      />

      <CustomIconLoadingButton
        text="Verify email and continue"
        onClick={handleSubmit}
        styles={primaryButtonStyles}
        loading={isPending}
        loadingText="Verifying..."
        textColor="#ffffff"
        variant="solid"
      />

      <CustomIconLoadingButton
        onClick={handleResend}
        textColor={BRAND_NAVY}
        text={resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
        disabled={resendCooldown > 0}
        loadingText="Please wait..."
        styles={secondaryButtonStyles}
        variant="text"
      />
    </Stack>
  )
}
