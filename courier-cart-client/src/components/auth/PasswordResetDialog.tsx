import { Box, Link, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useEffect, useState } from 'react'
import { FiMail, FiShield } from 'react-icons/fi'
import { BRAND } from '../../config/brand'
import { useResetPassword, useRequestPasswordReset } from '../../hooks/useRequestPasswordLogin'
import CustomIconLoadingButton from '../UI/button/CustomLoadingButton'
import CustomInput from '../UI/inputs/CustomInput'
import CustomModal from '../UI/modal/CustomModal'
import { toast } from '../UI/Toast'

const { teal, tealDark, paper, muted, tealSoft } = BRAND.colors

type ResetStep = 'email' | 'code'

interface PasswordResetDialogProps {
  open: boolean
  initialEmail?: string
  onClose: () => void
}

export default function PasswordResetDialog({
  open,
  initialEmail = '',
  onClose,
}: PasswordResetDialogProps) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [step, setStep] = useState<ResetStep>('email')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  const { mutate: requestReset, isPending: sendingCode } = useRequestPasswordReset()
  const { mutate: resetPassword, isPending: savingPassword } = useResetPassword()

  useEffect(() => {
    if (!open) return

    setStep('email')
    setEmail(initialEmail.trim())
    setToken('')
    setNewPassword('')
    setConfirmPassword('')
    setResendCooldown(0)
  }, [open, initialEmail])

  useEffect(() => {
    if (resendCooldown <= 0) return undefined

    const timer = window.setTimeout(() => setResendCooldown((current) => current - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendCooldown])

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const isValidEmail = emailRegex.test(email.trim())

  const requestResetCode = () => {
    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail || !isValidEmail) {
      toast.open({
        message: 'Enter a valid registered email address.',
        severity: 'warning',
        position: { vertical: 'top', horizontal: 'center' },
      })
      return
    }

    requestReset(normalizedEmail, {
      onSuccess: () => {
        setStep('code')
        setResendCooldown(30)
        toast.open({
          message: 'If the email exists, a reset code has been sent.',
          severity: 'success',
          position: { vertical: 'top', horizontal: 'center' },
        })
      },
      onError: (error: any) => {
        toast.open({
          message: error?.response?.data?.error || 'Failed to send reset code',
          severity: 'error',
          position: { vertical: 'top', horizontal: 'center' },
        })
      },
    })
  }

  const submitNewPassword = () => {
    const trimmedEmail = email.trim().toLowerCase()

    if (!trimmedEmail || !isValidEmail) {
      toast.open({
        message: 'Enter the registered email address first.',
        severity: 'warning',
        position: { vertical: 'top', horizontal: 'center' },
      })
      return
    }

    if (!token.trim()) {
      toast.open({
        message: 'Enter the reset code sent to your email.',
        severity: 'warning',
        position: { vertical: 'top', horizontal: 'center' },
      })
      return
    }

    if (newPassword.length < 8) {
      toast.open({
        message: 'Use a stronger password with at least 8 characters.',
        severity: 'warning',
        position: { vertical: 'top', horizontal: 'center' },
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast.open({
        message: 'Passwords do not match.',
        severity: 'warning',
        position: { vertical: 'top', horizontal: 'center' },
      })
      return
    }

    resetPassword(
      { email: trimmedEmail, token: token.trim(), newPassword },
      {
        onSuccess: () => {
          toast.open({
            message: 'Password updated successfully. Please sign in again.',
            severity: 'success',
            position: { vertical: 'top', horizontal: 'center' },
          })
          onClose()
        },
        onError: (error: any) => {
          toast.open({
            message: error?.response?.data?.error || 'Password reset failed',
            severity: 'error',
            position: { vertical: 'top', horizontal: 'center' },
          })
        },
      },
    )
  }

  const body = (
    <Stack
      spacing={2}
      sx={{
        touchAction: 'pan-y pinch-zoom',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
        maxHeight: { xs: 'calc(100dvh - 126px)', sm: '62vh' },
        overflowY: 'auto',
        pr: 0.5,
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '52px 1fr',
          gap: 1.4,
          alignItems: 'center',
          p: 1.5,
          borderRadius: 1.5,
          border: `1px solid ${alpha(teal, 0.12)}`,
          background: `linear-gradient(135deg, ${alpha(tealSoft, 0.74)} 0%, ${alpha(paper, 0.96)} 100%)`,
        }}
      >
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color: teal,
            background: alpha(paper, 0.9),
            boxShadow: `inset 0 0 0 1px ${alpha(teal, 0.12)}`,
            fontSize: 22,
          }}
        >
          <FiShield />
        </Box>
        <Box minWidth={0}>
          <Typography sx={{ color: '#102344', fontSize: 15.5, fontWeight: 900, lineHeight: 1.25 }}>
            Reset your password using the registered email
          </Typography>
          <Typography sx={{ mt: 0.45, color: muted, fontSize: 14.5, lineHeight: 1.5 }}>
            We will send a reset code to the e-mail already linked to your account.
          </Typography>
        </Box>
      </Box>

      {step === 'email' ? (
        <Stack spacing={1.5}>
          <CustomInput
            label="Registered Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            prefix={<FiMail color={teal} size={15} />}
            required
            autoComplete="email"
          />

          <CustomIconLoadingButton
            type="button"
            onClick={requestResetCode}
            loading={sendingCode}
            loadingText="Sending..."
            text="Send reset code"
            textColor="#ffffff"
            styles={{
              width: '100%',
              borderRadius: 1.25,
              minHeight: 48,
              background: `linear-gradient(135deg, ${teal} 0%, ${tealDark} 100%)`,
              boxShadow: `0 14px 24px ${alpha(teal, 0.18)}`,
            }}
          />

          <Typography sx={{ color: muted, fontSize: 13.5, lineHeight: 1.55 }}>
            Enter the registered mail on file and we’ll generate a one-time reset code.
          </Typography>
        </Stack>
      ) : (
        <Stack spacing={1.4}>
          <Box
            sx={{
              p: 1.35,
              borderRadius: 1.4,
              backgroundColor: alpha(tealSoft, 0.65),
              border: `1px solid ${alpha(teal, 0.12)}`,
            }}
          >
            <Typography variant="body2" sx={{ color: '#263a59', lineHeight: 1.6 }}>
              Code sent to <strong>{email.trim() || 'your registered email'}</strong>.
              <Link
                component="button"
                type="button"
                underline="hover"
                onClick={() => setStep('email')}
                sx={{ ml: 1, color: teal, fontWeight: 800 }}
              >
                Edit email
              </Link>
            </Typography>
          </Box>

          <CustomInput
            label="Reset code"
            type="text"
            value={token}
            onChange={(event) => setToken(event.target.value.trim())}
            placeholder="Enter the code from your email"
            required
          />

          <CustomInput
            label="New password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Create a new password"
            required
            autoComplete="new-password"
          />

          <CustomInput
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Re-enter the new password"
            required
            autoComplete="new-password"
          />

          <Stack spacing={1.2}>
            <CustomIconLoadingButton
              type="button"
              onClick={submitNewPassword}
              loading={savingPassword}
              loadingText="Saving..."
              text="Update password"
              textColor="#ffffff"
              styles={{
                width: '100%',
                borderRadius: 1.25,
                minHeight: 48,
                background: `linear-gradient(135deg, ${teal} 0%, ${tealDark} 100%)`,
                boxShadow: `0 14px 24px ${alpha(teal, 0.18)}`,
              }}
            />

            <CustomIconLoadingButton
              type="button"
              onClick={requestResetCode}
              disabled={resendCooldown > 0}
              loading={sendingCode}
              loadingText="Sending..."
              text={resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
              variant="text"
              styles={{
                width: '100%',
                borderRadius: 1.25,
                minHeight: 48,
                backgroundColor: alpha('#111827', 0.03),
              }}
            />
          </Stack>
        </Stack>
      )}
    </Stack>
  )

  return (
    <CustomModal open={open} onClose={onClose} title="Password reset" fullScreen={isMobile}>
      {body}
    </CustomModal>
  )
}
