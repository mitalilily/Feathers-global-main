import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { MdArrowDownward, MdArrowUpward, MdDelete } from 'react-icons/md'
import {
  type CourierPriorityCondition,
  type CourierPriorityRule,
} from '../../../api/courierPriority.service'
import { useAllCouriersWithDetails } from '../../../hooks/Integrations/useCouriers'
import {
  useCourierPriorities,
  useCreateCourierPriority,
  useUpdateCourierPriority,
} from '../../../hooks/useCourierPriority'
import PageHeading from '../../UI/heading/PageHeading'

type PriorityCourier = NonNullable<CourierPriorityRule['personalised_order']>[number]
export type ProfileName = 'fastest' | 'economical' | 'personalised'

const conditionTypes = [
  { value: 'payment_mode', label: 'Payment Mode' },
  { value: 'weight', label: 'Weight' },
  { value: 'zone', label: 'Zone Wise' },
  { value: 'channel', label: 'Channel' },
  { value: 'order_tags', label: 'Order Tags' },
  { value: 'product_sku', label: 'Product SKU' },
]

const valueOptions: Record<string, string[]> = {
  payment_mode: ['cod', 'prepaid'],
  zone: ['a', 'b', 'c', 'd', 'e', 'local', 'regional', 'national'],
  channel: ['manual', 'shopify', 'woocommerce', 'api'],
}

const normalizeCourier = (courier: any, index: number): PriorityCourier => ({
  courierId: courier.id ?? courier.courierId,
  name: courier.name ?? courier.displayName ?? `Courier ${index + 1}`,
  priority: index + 1,
  integration_type: courier.serviceProvider ?? courier.integration_type,
  serviceProvider: courier.serviceProvider ?? courier.integration_type,
  max_slab_weight: courier.max_slab_weight ?? null,
})

const moveItem = <T,>(items: T[], from: number, to: number) => {
  if (to < 0 || to >= items.length) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

const CourierPriorityPage = () => {
  const { data: rawRules, isLoading } = useCourierPriorities()
  const { data: allCouriers = [] } = useAllCouriersWithDetails()
  const createRule = useCreateCourierPriority()
  const updateRule = useUpdateCourierPriority()

  const rules: CourierPriorityRule[] = Array.isArray(rawRules) ? rawRules : rawRules?.id ? [rawRules] : []
  const autoRules = rules.filter((rule) => rule.rule_type === 'rule')

  const defaultCouriers = useMemo(
    () => allCouriers.map((courier: any, index: number) => normalizeCourier(courier, index)),
    [allCouriers],
  )

  const [ruleName, setRuleName] = useState('')
  const [conditions, setConditions] = useState<CourierPriorityCondition[]>([])
  const [priorityCouriers, setPriorityCouriers] = useState<PriorityCourier[]>([])

  const effectivePriorityCouriers = priorityCouriers.length ? priorityCouriers : defaultCouriers

  const addCondition = (type = 'payment_mode') => {
    setConditions((current) => [...current, { type, value: '' }])
  }

  const updateCondition = (index: number, patch: Partial<CourierPriorityCondition>) => {
    setConditions((current) =>
      current.map((condition, conditionIndex) =>
        conditionIndex === index ? { ...condition, ...patch } : condition,
      ),
    )
  }

  const removeCondition = (index: number) => {
    setConditions((current) => current.filter((_, conditionIndex) => conditionIndex !== index))
  }

  const moveCourier = (index: number, direction: -1 | 1) => {
    setPriorityCouriers(
      moveItem(effectivePriorityCouriers, index, index + direction).map((courier, courierIndex) => ({
        ...courier,
        priority: courierIndex + 1,
      })),
    )
  }

  const createAutoRule = () => {
    const cleanedName = ruleName.trim()
    if (!cleanedName) return
    createRule.mutate(
      {
        name: cleanedName,
        rule_type: 'rule',
        conditions,
        is_active: true,
        sort_order: autoRules.length + 1,
        personalised_order: effectivePriorityCouriers.map((courier, index) => ({
          ...courier,
          priority: index + 1,
        })),
      },
      {
        onSuccess: () => {
          setRuleName('')
          setConditions([])
          setPriorityCouriers([])
        },
      },
    )
  }

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="50vh">
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Stack gap={3} p={3}>
      <PageHeading title="Courier Priority / Auto Assign Rules" />
      <Alert severity="info">
        Create rules for auto courier assignment. Rules are matched in order. Existing rules cannot
        be edited; only activate/deactivate them.
      </Alert>

      <Card sx={{ p: 2.5, borderRadius: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={800}>
            Create Auto Assign Rule
          </Typography>
          <TextField
            label="Rule name"
            value={ruleName}
            onChange={(event) => setRuleName(event.target.value)}
            fullWidth
          />

          <Divider />

          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography fontWeight={800}>Shipment conditions</Typography>
            <Button variant="outlined" onClick={() => addCondition()}>
              Add condition
            </Button>
          </Stack>

          {!conditions.length && (
            <Typography color="text.secondary">
              No conditions added. This rule will match every eligible order.
            </Typography>
          )}

          {conditions.map((condition, index) => {
            const options = valueOptions[condition.type] || []
            return (
              <Stack key={`${condition.type}-${index}`} direction={{ xs: 'column', md: 'row' }} gap={1}>
                <TextField
                  select
                  label="Condition"
                  value={condition.type}
                  onChange={(event) =>
                    updateCondition(index, { type: event.target.value, value: '', min: '', max: '' })
                  }
                  sx={{ minWidth: 200 }}
                >
                  {conditionTypes.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </TextField>
                {condition.type === 'weight' ? (
                  <>
                    <TextField
                      label="Min kg"
                      type="number"
                      value={condition.min ?? ''}
                      onChange={(event) => updateCondition(index, { min: event.target.value })}
                    />
                    <TextField
                      label="Max kg"
                      type="number"
                      value={condition.max ?? ''}
                      onChange={(event) => updateCondition(index, { max: event.target.value })}
                    />
                  </>
                ) : options.length ? (
                  <TextField
                    select
                    label="Value"
                    value={String(condition.value ?? '')}
                    onChange={(event) => updateCondition(index, { value: event.target.value })}
                    sx={{ minWidth: 200 }}
                  >
                    {options.map((option) => (
                      <MenuItem key={option} value={option}>
                        {option.toUpperCase()}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <TextField
                    label="Value"
                    helperText="Use comma separated values for tags/SKUs"
                    value={Array.isArray(condition.value) ? condition.value.join(',') : condition.value ?? ''}
                    onChange={(event) =>
                      updateCondition(index, {
                        value: event.target.value
                          .split(',')
                          .map((value) => value.trim())
                          .filter(Boolean),
                      })
                    }
                    sx={{ minWidth: 280 }}
                  />
                )}
                <IconButton onClick={() => removeCondition(index)}>
                  <MdDelete />
                </IconButton>
              </Stack>
            )
          })}

          <Divider />

          <Typography fontWeight={800}>Courier priority</Typography>
          <Stack spacing={1}>
            {effectivePriorityCouriers.map((courier, index) => (
              <Stack
                key={`${courier.courierId}-${courier.integration_type}-${index}`}
                direction="row"
                alignItems="center"
                gap={1}
                sx={{ p: 1, border: '1px solid #E5E7EB', borderRadius: 2 }}
              >
                <Chip label={`#${index + 1}`} color="primary" size="small" />
                <Typography sx={{ flex: 1 }} fontWeight={700}>
                  {courier.name}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  {courier.integration_type || courier.serviceProvider || 'courier'}
                </Typography>
                <IconButton disabled={index === 0} onClick={() => moveCourier(index, -1)}>
                  <MdArrowUpward />
                </IconButton>
                <IconButton
                  disabled={index === effectivePriorityCouriers.length - 1}
                  onClick={() => moveCourier(index, 1)}
                >
                  <MdArrowDownward />
                </IconButton>
              </Stack>
            ))}
          </Stack>

          <Button
            variant="contained"
            disabled={!ruleName.trim() || createRule.isPending || !effectivePriorityCouriers.length}
            onClick={createAutoRule}
            sx={{ alignSelf: 'flex-end' }}
          >
            {createRule.isPending ? 'Saving...' : 'Save Rule'}
          </Button>
        </Stack>
      </Card>

      <Card sx={{ p: 2.5, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={800} mb={2}>
          Existing auto assign rules
        </Typography>
        {!autoRules.length ? (
          <Typography color="text.secondary">No rules created yet.</Typography>
        ) : (
          <Stack spacing={1.5}>
            {autoRules.map((rule) => (
              <Stack
                key={rule.id}
                direction={{ xs: 'column', md: 'row' }}
                alignItems={{ xs: 'flex-start', md: 'center' }}
                gap={1}
                sx={{ p: 1.5, border: '1px solid #E5E7EB', borderRadius: 2 }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography fontWeight={800}>{rule.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {(rule.conditions || []).length || 'No'} conditions ·{' '}
                    {(rule.personalised_order || []).length} couriers
                  </Typography>
                </Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={rule.is_active !== false}
                      onChange={(event) =>
                        rule.id &&
                        updateRule.mutate({
                          id: rule.id as any,
                          data: { is_active: event.target.checked },
                        })
                      }
                    />
                  }
                  label={rule.is_active !== false ? 'Active' : 'Inactive'}
                />
              </Stack>
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  )
}

export default CourierPriorityPage
