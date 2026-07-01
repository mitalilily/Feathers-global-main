import { Grid } from '@mui/material'
import { useFormContext } from 'react-hook-form'
import CustomInput from '../UI/inputs/CustomInput'

export default function B2BRateCalculator() {
  const {
    register,
    formState: { errors },
  } = useFormContext()

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 6 }}>
        <CustomInput
          label="Total Weight (kg)"
          type="number"
          {...register('totalWeight', {
            required: 'Total weight is required',
            min: { value: 0.1, message: 'Weight must be greater than 0' },
          })}
          error={!!errors.totalWeight}
          helperText={errors.totalWeight?.message as string}
          fullWidth
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <CustomInput
          label="Number of Boxes"
          type="number"
          {...register('numberOfBoxes', {
            required: 'Number of boxes is required',
            min: { value: 1, message: 'At least one box is required' },
          })}
          error={!!errors.numberOfBoxes}
          helperText={errors.numberOfBoxes?.message as string}
          fullWidth
        />
      </Grid>
    </Grid>
  )
}
