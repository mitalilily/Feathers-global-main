import {
  alpha,
  Box,
  Checkbox,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import React, { useEffect } from 'react'
import { Controller, useForm, type SubmitHandler } from 'react-hook-form'
import type { IEmployeePayload } from '../../../api/employee.service'
import {
  DEFAULT_EMPLOYEE_MODULE_ACCESS,
  EMPLOYEE_PERMISSION_GROUPS,
  mergeEmployeeModuleAccess,
  type EmployeeModuleAccess,
  type EmployeePermissionGroupKey,
} from '../../../constants/employeePermissions'
import { useCreateEmployee, useUpdateEmployee } from '../../../hooks/User/useUserManagement'
import { glassStyles } from '../../UI/accordion/FormSectionAccordion'
import CustomIconLoadingButton from '../../UI/button/CustomLoadingButton'
import PageHeading from '../../UI/heading/PageHeading'
import CustomInput from '../../UI/inputs/CustomInput'
import PasswordField from '../../UI/inputs/PasswordField'
import CustomDialog from '../../UI/modal/CustomModal'

type FormValues = {
  name: string
  email: string
  phone?: string
  password: string
  confirmPassword: string
  role: string
  access: EmployeeModuleAccess
}

interface UserFormProps {
  open: boolean
  onClose: () => void
  defaultValues?: IEmployeePayload
}

const UserForm: React.FC<UserFormProps> = ({ open, onClose, defaultValues }) => {
  const isEdit = Boolean(defaultValues?.id)
  const {
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: defaultValues || {
      name: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      role: 'employee',
      access: DEFAULT_EMPLOYEE_MODULE_ACCESS,
    },
  })

  const { mutate: createEmployee, isPending } = useCreateEmployee()
  const { mutate: updateEmployee, isPending: isUpdating } = useUpdateEmployee()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const submitHandler: SubmitHandler<any> = (data) => {
    if (!isEdit && data.password !== data.confirmPassword) {
      alert('Passwords do not match')
      return
    }

    const payload = {
      ...data,
      moduleAccess: data.access,
    }

    if (isEdit && defaultValues?.id) {
      updateEmployee(
        { id: defaultValues.id, data: payload },
        {
          onSuccess: () => {
            onClose()
            reset()
          },
        },
      )
    } else {
      createEmployee(payload, {
        onSuccess: () => {
          onClose()
          reset()
        },
      })
    }
  }

  useEffect(() => {
    if (defaultValues) {
      reset({
        ...defaultValues,
        access: mergeEmployeeModuleAccess(defaultValues.moduleAccess as EmployeeModuleAccess | null),
        password: '',
        confirmPassword: '',
      })
    }
  }, [defaultValues, reset])

  const access = watch('access')
  const mergedAccess = mergeEmployeeModuleAccess(access)

  const isAllSelected = EMPLOYEE_PERMISSION_GROUPS.every((group) =>
    group.permissions.every((permission) => {
      const groupAccess = mergedAccess[group.key] as Record<string, boolean> | undefined
      return groupAccess?.[permission.key] === true
    }),
  )

  const toggleGroup = (groupKey: EmployeePermissionGroupKey, nextValue: boolean) => {
    const currentGroup = {
      ...(mergedAccess[groupKey] as Record<string, boolean>),
    }

    const group = EMPLOYEE_PERMISSION_GROUPS.find((item) => item.key === groupKey)
    group?.permissions.forEach((permission) => {
      currentGroup[permission.key] = nextValue
    })

    setValue(`access.${groupKey}`, currentGroup, { shouldDirty: true })
  }

  const toggleAllPermissions = (nextValue: boolean) => {
    EMPLOYEE_PERMISSION_GROUPS.forEach((group) => {
      toggleGroup(group.key, nextValue)
    })
  }

  return (
    <CustomDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Employee' : 'Add New Employee'}
      width="87vh"
      footer={
        <CustomIconLoadingButton
          text={isEdit ? 'Update' : 'Save'}
          loadingText={isEdit ? 'Updating...' : 'Please wait..'}
          loading={isEdit ? isUpdating : isPending}
          onClick={handleSubmit(submitHandler)}
        />
      }
    >
      <form onSubmit={handleSubmit(submitHandler)}>
        <Box display="flex" flexDirection="column" gap={3}>
          {/* User Details */}
          <Paper sx={{ ...glassStyles, p: 2 }} elevation={3}>
            <PageHeading title="User Details" fontSize={19} />
            <Box mt={2} display="flex" flexDirection="column" gap={1}>
              <Controller
                name="name"
                control={control}
                rules={{ required: 'First name is required' }}
                render={({ field }) => (
                  <CustomInput
                    {...field}
                    label="Name"
                    placeholder="Enter full name"
                    required
                    helperText={errors.name?.message}
                    error={!!errors.name?.message}
                  />
                )}
              />

              <Controller
                name="email"
                control={control}
                rules={{
                  required: 'Email is required',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Invalid email address',
                  },
                }}
                render={({ field }) => (
                  <CustomInput
                    {...field}
                    label="Email"
                    placeholder="Enter email"
                    required
                    helperText={errors.email?.message}
                    error={!!errors.email?.message}
                  />
                )}
              />

              <Controller
                name="phone"
                control={control}
                rules={{
                  required: 'Phone number is required',
                  pattern: {
                    value: /^[0-9]{10}$/, // exactly 10 digits
                    message: 'Phone must be exactly 10 digits',
                  },
                }}
                render={({ field }) => (
                  <CustomInput
                    {...field}
                    label="Phone"
                    placeholder="Enter phone number"
                    helperText={errors.phone?.message}
                    error={!!errors.phone?.message}
                  />
                )}
              />

              {/* Password Field */}
              <PasswordField
                isEdit={isEdit}
                control={control}
                errors={errors}
                watchPassword={watch('password')}
              />

              <Controller
                name="confirmPassword"
                control={control}
                rules={{
                  required: isEdit ? false : 'Confirm your password',
                  validate: (val) => val === watch('password') || 'Passwords do not match',
                }}
                render={({ field }) => (
                  <CustomInput
                    {...field}
                    type="password"
                    label="Confirm Password"
                    placeholder="Re-enter password"
                    required
                    helperText={errors.confirmPassword?.message}
                    error={!!errors.confirmPassword?.message}
                  />
                )}
              />
            </Box>
          </Paper>

          {/* Permissions */}
          <Paper
            sx={{
              p: 2,
              bgcolor: 'background.paper',
              borderRadius: 2,
              boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
            }}
            elevation={3}
          >
            <PageHeading title="Permissions" fontSize={18} />
            <Stack spacing={2.2} mt={2}>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  background: alpha('#047b85', 0.04),
                  border: `1px solid ${alpha('#047b85', 0.12)}`,
                }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={isAllSelected}
                      indeterminate={!isAllSelected && EMPLOYEE_PERMISSION_GROUPS.some((group) =>
                        group.permissions.some((permission) => {
                          const groupAccess = mergedAccess[group.key] as Record<string, boolean> | undefined
                          return groupAccess?.[permission.key] === true
                        }),
                      )}
                      onChange={(event) => toggleAllPermissions(event.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography sx={{ fontWeight: 800, color: '#17171A' }}>Select all permissions</Typography>
                      <Typography sx={{ fontSize: '0.78rem', color: '#6B7280' }}>
                        Quickly grant or revoke access across every module.
                      </Typography>
                    </Box>
                  }
                  sx={{ m: 0, alignItems: 'flex-start' }}
                />
              </Box>

              {EMPLOYEE_PERMISSION_GROUPS.map((group, groupIndex) => {
                const groupAccess = mergedAccess[group.key] as Record<string, boolean> | undefined
                const selectedCount = group.permissions.filter(
                  (permission) => groupAccess?.[permission.key] === true,
                ).length
                const allSelected = selectedCount === group.permissions.length
                const partiallySelected = selectedCount > 0 && !allSelected

                return (
                  <React.Fragment key={group.key}>
                    {groupIndex > 0 ? <Divider /> : null}
                    <Box>
                      <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        justifyContent="space-between"
                        alignItems={{ xs: 'flex-start', md: 'center' }}
                        gap={1}
                        mb={1.4}
                      >
                        <Box>
                          <Typography sx={{ fontSize: '0.96rem', fontWeight: 800, color: '#17171A' }}>
                            {group.label}
                          </Typography>
                          <Typography sx={{ fontSize: '0.78rem', color: '#6B7280' }}>
                            {selectedCount} of {group.permissions.length} permission
                            {group.permissions.length > 1 ? 's' : ''} enabled
                          </Typography>
                        </Box>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={allSelected}
                              indeterminate={partiallySelected}
                              onChange={(event) => toggleGroup(group.key, event.target.checked)}
                            />
                          }
                          label="Select all"
                          sx={{ mr: 0 }}
                        />
                      </Stack>

                      <Box
                        display="grid"
                        gridTemplateColumns={{
                          xs: '1fr',
                          sm: 'repeat(2, minmax(0, 1fr))',
                          lg: 'repeat(3, minmax(0, 1fr))',
                        }}
                        gap={1.1}
                      >
                        {group.permissions.map((permission) => (
                          <Controller
                            key={`${group.key}.${permission.key}`}
                            name={`access.${group.key}.${permission.key}` as const}
                            control={control}
                            render={({ field }) => (
                              <Paper
                                variant="outlined"
                                sx={{
                                  p: 1.25,
                                  borderRadius: 2,
                                  borderColor: field.value ? alpha('#047b85', 0.35) : 'rgba(17, 17, 19, 0.10)',
                                  background: field.value
                                    ? alpha('#047b85', 0.05)
                                    : 'rgba(255,255,255,0.86)',
                                }}
                              >
                                <FormControlLabel
                                  control={
                                    <Checkbox
                                      checked={Boolean(field.value)}
                                      onChange={(event) => field.onChange(event.target.checked)}
                                    />
                                  }
                                  label={
                                    <Box>
                                      <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: '#17171A' }}>
                                        {permission.label}
                                      </Typography>
                                    </Box>
                                  }
                                  sx={{ m: 0, width: '100%', alignItems: 'flex-start' }}
                                />
                              </Paper>
                            )}
                          />
                        ))}
                      </Box>
                    </Box>
                  </React.Fragment>
                )
              })}
            </Stack>
          </Paper>
        </Box>
      </form>
    </CustomDialog>
  )
}

export default UserForm
