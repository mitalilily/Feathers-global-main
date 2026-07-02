import {
  Box,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import React, { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import type { BankAccount } from '../../../../types/user.types'
import CustomIconLoadingButton from '../../../UI/button/CustomLoadingButton'
import CustomInput from '../../../UI/inputs/CustomInput'
import CustomDialog from '../../../UI/modal/CustomModal'
import FileUploader from '../../../UI/uploader/FileUploader'
import { BRAND_GRADIENT } from '../UserProfileForm'

type BankAccountFormValues = Partial<BankAccount> & {
  chequeImageKey?: string
}

interface DialogProps {
  open: boolean
  onClose: () => void
  onAdd: (data: BankAccount) => void
  addingAccount?: boolean
  initialData?: Partial<BankAccount> // 🆕 For edit mode
}

const extractStoredFileName = (value?: string | null) => {
  const rawValue = String(value ?? '').trim()
  if (!rawValue) return ''

  const normalizedValue = rawValue.split('?')[0]
  const segments = normalizedValue.split('/').filter(Boolean)
  const lastSegment = segments.at(-1) ?? normalizedValue

  try {
    return decodeURIComponent(lastSegment)
  } catch {
    return lastSegment
  }
}

const buildDefaultValues = (data?: Partial<BankAccount>): BankAccountFormValues => ({
  accountType: data?.accountType ?? 'SAVINGS',
  ...data,
  chequeImageUrl: data?.chequeImageUrl ?? '',
  chequeImageKey: extractStoredFileName(data?.chequeImageUrl),
})

export const AddBankAccountDialog: React.FC<DialogProps> = ({
  open,
  onClose,
  onAdd,
  addingAccount = false,
  initialData,
}) => {
  const resolveMode = (data?: Partial<BankAccount>): 'bank' | 'upi' =>
    data?.accountNumber ? 'bank' : data?.upiId ? 'upi' : 'bank'

  const {
    register,
    handleSubmit,
    setValue,
    control,
    watch,
    setError,
    clearErrors,
    reset,
    formState: { errors },
  } = useForm<BankAccountFormValues>({
    defaultValues: buildDefaultValues(initialData),
  })

  const [mode, setMode] = useState<'bank' | 'upi'>(() => resolveMode(initialData))

  useEffect(() => {
    register('chequeImageUrl')
    register('chequeImageKey')
  }, [register])

  useEffect(() => {
    reset(buildDefaultValues(initialData))
    setMode(resolveMode(initialData))
  }, [initialData, reset])

  const submit = handleSubmit(async (d) => {
    const normalizedUpiId = String(d.upiId ?? '')
      .trim()
      .toLowerCase()
    const normalizedAccountNumber = String(d.accountNumber ?? '').trim()
    const normalizedChequeImageUrl = String(d.chequeImageUrl ?? '').trim()
    const shouldUseBankDetails = mode === 'bank' && !!normalizedAccountNumber

    if (!normalizedUpiId && !shouldUseBankDetails) {
      setError('accountNumber', {
        type: 'required',
        message: 'Provide either bank account details or a UPI ID',
      })
      return setError('upiId', {
        type: 'required',
        message: 'Provide either UPI ID or bank account details',
      })
    }

    if (shouldUseBankDetails && (!d.ifsc || !d.bankName || !d.branch)) return
    if (shouldUseBankDetails && !normalizedChequeImageUrl)
      return setError('chequeImageUrl', {
        type: 'required',
        message: 'Cheque image is required',
      })
    if (!shouldUseBankDetails && !normalizedUpiId)
      return setError('upiId', {
        type: 'required',
        message: 'UPI ID is required',
      })

    const newAcc = {
      ...initialData,
      status: 'pending',
      isPrimary: initialData?.isPrimary ?? false,
      accountHolder: d.accountHolder,
      accountNumber: shouldUseBankDetails ? normalizedAccountNumber : null,
      ifsc: shouldUseBankDetails ? d.ifsc ?? null : null,
      bankName: shouldUseBankDetails ? d.bankName ?? null : null,
      branch: shouldUseBankDetails ? d.branch ?? null : null,
      accountType: shouldUseBankDetails ? d.accountType ?? 'SAVINGS' : undefined,
      upiId: normalizedUpiId || null,
      chequeImageUrl: shouldUseBankDetails ? normalizedChequeImageUrl || null : null,
    } as BankAccount

    await onAdd(newAcc as BankAccount)
    reset()
  })

  return (
    <CustomDialog
      open={open}
      onClose={onClose}
      title={initialData ? 'Edit Bank Account' : 'Add Bank Account'}
    >
      <Box component="form" onSubmit={submit}>
        <Stack spacing={2.5} mt={1}>
          {/* Mode Switch */}
          <Box>
            <Typography variant="body2" color="#4A5568" fontWeight={600} mb={1.5}>
              Choose account type:
            </Typography>
            <ToggleButtonGroup
              exclusive
              value={mode}
              onChange={(_, val) => val && setMode(val)}
              size="medium"
              fullWidth
              sx={{
                background: '#F5F7FA',
                border: '1px solid #E0E6ED',
                borderRadius: 2,
                p: 0.5,
                '& .MuiToggleButton-root': {
                  flex: 1,
                  border: 'none',
                  color: '#4A5568',
                  fontWeight: 600,
                  borderRadius: 1.5,
                  py: 1.2,
                  transition: 'all 0.3s ease',
                  '&.Mui-selected': {
                    color: '#FFFFFF',
                    background: BRAND_GRADIENT,
                    boxShadow: '0 4px 12px rgba(51, 51, 105, 0.2)',
                  },
                  '&:hover': {
                    backgroundColor: '#E0E6ED',
                  },
                  '&.Mui-selected:hover': {
                    background: BRAND_GRADIENT,
                  },
                },
              }}
            >
              <ToggleButton value="bank">Bank Account</ToggleButton>
              <ToggleButton value="upi">UPI Only</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Account Holder */}
          <CustomInput
            label="Account Holder"
            placeholder="Enter account holder's name"
            fullWidth
            required
            error={!!errors.accountHolder}
            helperText={errors.accountHolder?.message as string}
            {...register('accountHolder', {
              required: 'Account Holder is required',
              onChange: (e) => setValue('accountHolder', e.target.value.toUpperCase()),
            })}
          />

          <CustomInput
            label={mode === 'upi' ? 'UPI ID' : 'UPI ID (Optional)'}
            placeholder="e.g., yourname@upi"
            required={mode === 'upi'}
            fullWidth
            error={!!errors.upiId}
            helperText={errors.upiId?.message as string}
            {...register('upiId', {
              required: mode === 'upi' && 'UPI ID is required',
              onChange: (e) => {
                setValue('upiId', e.target.value.toLowerCase(), {
                  shouldValidate: true,
                })
                clearErrors(['upiId', 'accountNumber'])
              },
            })}
          />

          {/* Bank Fields */}
          {mode === 'bank' && (
            <>
              <CustomInput
                label="Account Number"
                placeholder="e.g., 1234567890"
                required
                fullWidth
                error={!!errors.accountNumber}
                helperText={errors.accountNumber?.message as string}
                {...register('accountNumber', {
                  required: mode === 'bank' && 'Account number is required',
                  pattern: {
                    value: /^[0-9]{9,18}$/,
                    message: '9–18 digits only',
                  },
                  onChange: () => clearErrors(['accountNumber', 'upiId']),
                })}
              />
              <CustomInput
                label="IFSC"
                placeholder="e.g., HDFC0001234"
                required
                fullWidth
                error={!!errors.ifsc}
                helperText={errors.ifsc?.message as string}
                {...register('ifsc', {
                  required: mode === 'bank' && 'IFSC is required',
                  pattern: {
                    value: /^[A-Z]{4}0[A-Z0-9]{6}$/,
                    message: 'Invalid IFSC',
                  },
                })}
              />
              <CustomInput
                label="Bank Name"
                placeholder="e.g., HDFC Bank"
                required
                fullWidth
                error={!!errors.bankName}
                helperText={errors.bankName?.message as string}
                {...register('bankName', {
                  required: mode === 'bank' && 'Bank Name is required',
                })}
              />
              <CustomInput
                label="Branch"
                placeholder="e.g., Indiranagar"
                required
                fullWidth
                error={!!errors.branch}
                helperText={errors.branch?.message as string}
                {...register('branch', {
                  required: mode === 'bank' && 'Branch is required',
                })}
              />

              <Box>
                <Typography variant="body2" fontWeight={600} mb={1.5} color="#1A1A1A">
                  Account Type
                </Typography>
                <Controller
                  name="accountType"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup row {...field}>
                      <FormControlLabel
                        value="SAVINGS"
                        control={
                          <Radio
                            sx={{
                              color: '#047b85',
                              '&.Mui-checked': {
                                color: '#3DD598',
                              },
                            }}
                          />
                        }
                        label={
                          <Typography variant="body2" color="#1A1A1A" fontWeight={500}>
                            Savings
                          </Typography>
                        }
                      />
                      <FormControlLabel
                        value="CURRENT"
                        control={
                          <Radio
                            sx={{
                              color: '#047b85',
                              '&.Mui-checked': {
                                color: '#3DD598',
                              },
                            }}
                          />
                        }
                        label={
                          <Typography variant="body2" color="#1A1A1A" fontWeight={500}>
                            Current
                          </Typography>
                        }
                      />
                    </RadioGroup>
                  )}
                />
              </Box>

              <Stack gap={1.5}>
                <Typography variant="body2" fontWeight={600} color="#1A1A1A">
                  Upload Cancelled Cheque{' '}
                  <Typography component="span" color="#E74C3C" fontWeight={700}>
                    *
                  </Typography>
                </Typography>
                <FileUploader
                  variant="button"
                  accept="image/*,.pdf"
                  folderKey="ir"
                  placeholder={watch('chequeImageKey')}
                  error={!!errors.chequeImageUrl}
                  onUploaded={(files) => {
                    const uploadedFile = files[0]

                    setValue('chequeImageUrl', uploadedFile?.url ?? '', {
                      shouldValidate: true,
                    })
                    setValue(
                      'chequeImageKey',
                      uploadedFile?.originalName ??
                        extractStoredFileName(uploadedFile?.url || uploadedFile?.key),
                      {
                        shouldValidate: true,
                      },
                    )
                    if (uploadedFile) {
                      clearErrors('chequeImageUrl')
                    }
                  }}
                />
                {errors.chequeImageUrl && (
                  <Typography variant="caption" color="#E74C3C" fontWeight={600}>
                    {errors.chequeImageUrl.message as string}
                  </Typography>
                )}
              </Stack>
            </>
          )}

          {/* Submit button */}
          <Box mt={1}>
            <CustomIconLoadingButton
              loading={addingAccount}
              text={initialData ? 'Update Account' : 'Save Account'}
              loadingText={initialData ? 'Updating...' : 'Adding account...'}
              type="submit"
              styles={{
                width: '100%',
                py: 1.5,
                fontSize: '0.95rem',
              }}
            />
          </Box>
        </Stack>
      </Box>
    </CustomDialog>
  )
}
