import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
  alpha,
} from '@mui/material'
import { type DragEvent, useEffect, useMemo, useState } from 'react'
import { MdDelete, MdDragIndicator, MdExpandMore, MdSave } from 'react-icons/md'
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

const presetProfiles: Array<{ name: ProfileName; label: string; description: string }> = [
  { name: 'fastest', label: 'Fastest', description: 'Sort serviceable couriers by delivery speed.' },
  { name: 'economical', label: 'Economical', description: 'Sort serviceable couriers by lowest rate.' },
  { name: 'personalised', label: 'Personalised', description: 'Use your saved custom courier order.' },
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

const courierDragKey = (courier: PriorityCourier) =>
  [
    courier.courierId,
    courier.integration_type,
    courier.serviceProvider,
    courier.max_slab_weight,
    courier.name,
  ]
    .map((value) => String(value ?? '').trim())
    .join('__')

const conditionLabel = (condition: CourierPriorityCondition) => {
  const type = conditionTypes.find((item) => item.value === condition.type)?.label || condition.type
  if (condition.type === 'weight') {
    return `${type}: ${condition.min || '0'}kg - ${condition.max || '∞'}kg`
  }
  const value = Array.isArray(condition.value) ? condition.value.join(', ') : condition.value
  return `${type}: ${value || 'Any'}`
}

const CourierPriorityPage = () => {
  const { data: rawRules, isLoading } = useCourierPriorities()
  const { data: allCouriers = [] } = useAllCouriersWithDetails()
  const createRule = useCreateCourierPriority()
  const updateRule = useUpdateCourierPriority()

  const rules: CourierPriorityRule[] = Array.isArray(rawRules) ? rawRules : rawRules?.id ? [rawRules] : []
  const presetProfile = rules.find((rule) => rule.rule_type === 'profile' || !rule.rule_type)
  const autoRules = rules.filter((rule) => rule.rule_type === 'rule')

  const defaultCouriers = useMemo(
    () => allCouriers.map((courier: any, index: number) => normalizeCourier(courier, index)),
    [allCouriers],
  )

  const [selectedPreset, setSelectedPreset] = useState<ProfileName>('fastest')
  const [ruleName, setRuleName] = useState('')
  const [conditions, setConditions] = useState<CourierPriorityCondition[]>([])
  const [priorityCouriers, setPriorityCouriers] = useState<PriorityCourier[]>([])
  const [draggedCourierKey, setDraggedCourierKey] = useState<string | null>(null)

  useEffect(() => {
    const savedName = String(presetProfile?.name || '') as ProfileName
    if (['fastest', 'economical', 'personalised'].includes(savedName)) {
      setSelectedPreset(savedName)
    }
    if (presetProfile?.name === 'personalised' && presetProfile.personalised_order?.length) {
      setPriorityCouriers(presetProfile.personalised_order)
    }
  }, [presetProfile?.id])

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

  const moveCourier = (from: number, to: number) => {
    setPriorityCouriers(
      moveItem(effectivePriorityCouriers, from, to).map((courier, courierIndex) => ({
        ...courier,
        priority: courierIndex + 1,
      })),
    )
  }

  const handleCourierDragStart = (courier: PriorityCourier) => {
    setDraggedCourierKey(courierDragKey(courier))
  }

  const handleCourierDragOver = (event: DragEvent, hoverIndex: number) => {
    event.preventDefault()
    if (!draggedCourierKey) return

    const activeIndex = effectivePriorityCouriers.findIndex(
      (courier) => courierDragKey(courier) === draggedCourierKey,
    )

    if (activeIndex < 0 || activeIndex === hoverIndex) return
    moveCourier(activeIndex, hoverIndex)
  }

  const handleCourierDragEnd = () => {
    setDraggedCourierKey(null)
  }

  const savePreset = () => {
    createRule.mutate({
      name: selectedPreset,
      rule_type: 'profile',
      personalised_order:
        selectedPreset === 'personalised'
          ? effectivePriorityCouriers.map((courier, index) => ({ ...courier, priority: index + 1 }))
          : undefined,
    })
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
    <Stack gap={2} p={2.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <PageHeading title="Courier Priority" />
        <Button
          variant="contained"
          size="small"
          startIcon={<MdSave />}
          onClick={savePreset}
          disabled={createRule.isPending}
        >
          Save preset
        </Button>
      </Stack>

      <Accordion defaultExpanded disableGutters sx={{ borderRadius: 2.5, overflow: 'hidden', '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<MdExpandMore />}>
          <Box>
            <Typography fontWeight={900}>Existing preset rules</Typography>
            <Typography variant="caption" color="text.secondary">
              Fastest, economical, and personalised courier priority presets.
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={1.25}>
            {presetProfiles.map((profile) => {
              const selected = selectedPreset === profile.name
              return (
                <Paper
                  key={profile.name}
                  onClick={() => setSelectedPreset(profile.name)}
                  sx={{
                    flex: 1,
                    p: 1.25,
                    borderRadius: 2,
                    cursor: 'pointer',
                    border: `1px solid ${selected ? '#047b85' : '#E5E7EB'}`,
                    bgcolor: selected ? alpha('#047b85', 0.07) : '#fff',
                  }}
                >
                  <Typography fontWeight={900}>{profile.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {profile.description}
                  </Typography>
                </Paper>
              )
            })}
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Accordion disableGutters sx={{ borderRadius: 2.5, overflow: 'hidden', '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<MdExpandMore />}>
          <Box>
            <Typography fontWeight={900}>Create auto assign rule</Typography>
            <Typography variant="caption" color="text.secondary">
              Open this only when you want to create a new matching rule.
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stack direction={{ xs: 'column', lg: 'row' }} gap={2} alignItems="flex-start">
            <Card sx={{ p: 1.75, borderRadius: 2.5, flex: 1, width: '100%' }}>
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="h6" fontWeight={900}>
                  Create Auto Assign Rule
                </Typography>
                <Typography variant="caption" color="primary">
                  Note: a rule once created cannot be edited. You can only activate/deactivate it.
                </Typography>
              </Box>
              <Button
                variant="contained"
                size="small"
                onClick={createAutoRule}
                disabled={!ruleName.trim() || createRule.isPending || !effectivePriorityCouriers.length}
              >
                Save
              </Button>
            </Stack>

            <TextField
              label="Rule name"
              placeholder="Enter rule name"
              value={ruleName}
              onChange={(event) => setRuleName(event.target.value)}
              size="small"
              sx={{ maxWidth: 420 }}
            />

            <Divider />

            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography fontWeight={900}>Add shipment conditions</Typography>
                <TextField
                  select
                  size="small"
                  value=""
                  onChange={(event) => addCondition(event.target.value)}
                  SelectProps={{ displayEmpty: true }}
                  sx={{ minWidth: 180 }}
                >
                  <MenuItem value="">+ Add condition</MenuItem>
                  {conditionTypes.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>

              {!conditions.length && <Alert severity="info">No conditions added. This rule will match every eligible order.</Alert>}

              {conditions.map((condition, index) => {
                const options = valueOptions[condition.type] || []
                return (
                  <Stack
                    key={`${condition.type}-${index}`}
                    direction={{ xs: 'column', md: 'row' }}
                    gap={1}
                    alignItems={{ xs: 'stretch', md: 'center' }}
                  >
                    <TextField
                      select
                      size="small"
                      label="Condition"
                      value={condition.type}
                      onChange={(event) =>
                        updateCondition(index, { type: event.target.value, value: '', min: '', max: '' })
                      }
                      sx={{ minWidth: 170 }}
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
                          size="small"
                          label="Min kg"
                          type="number"
                          value={condition.min ?? ''}
                          onChange={(event) => updateCondition(index, { min: event.target.value })}
                        />
                        <TextField
                          size="small"
                          label="Max kg"
                          type="number"
                          value={condition.max ?? ''}
                          onChange={(event) => updateCondition(index, { max: event.target.value })}
                        />
                      </>
                    ) : options.length ? (
                      <TextField
                        select
                        size="small"
                        label="Value"
                        value={String(condition.value ?? '')}
                        onChange={(event) => updateCondition(index, { value: event.target.value })}
                        sx={{ minWidth: 170 }}
                      >
                        {options.map((option) => (
                          <MenuItem key={option} value={option}>
                            {option.toUpperCase()}
                          </MenuItem>
                        ))}
                      </TextField>
                    ) : (
                      <TextField
                        size="small"
                        label="Value"
                        placeholder="comma separated"
                        value={Array.isArray(condition.value) ? condition.value.join(',') : condition.value ?? ''}
                        onChange={(event) =>
                          updateCondition(index, {
                            value: event.target.value
                              .split(',')
                              .map((value) => value.trim())
                              .filter(Boolean),
                          })
                        }
                        sx={{ minWidth: 240 }}
                      />
                    )}
                    <IconButton size="small" onClick={() => removeCondition(index)}>
                      <MdDelete />
                    </IconButton>
                  </Stack>
                )
              })}
            </Stack>

            <Divider />

            <Box>
              <Typography fontWeight={900} mb={1}>
                Set courier priority
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
                  gap: 1,
                  maxHeight: 310,
                  overflow: 'auto',
                  pr: 0.5,
                }}
              >
                {effectivePriorityCouriers.map((courier, index) => (
                  <Paper
                    key={`${courierDragKey(courier)}-${index}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', courierDragKey(courier))
                      handleCourierDragStart(courier)
                    }}
                    onDragOver={(event) => handleCourierDragOver(event, index)}
                    onDrop={(event) => {
                      event.preventDefault()
                      handleCourierDragEnd()
                    }}
                    onDragEnd={handleCourierDragEnd}
                    sx={{
                      p: 1,
                      borderRadius: 2,
                      border: '1px solid #E5E7EB',
                      cursor: 'grab',
                      opacity: draggedCourierKey === courierDragKey(courier) ? 0.55 : 1,
                      transition: 'border-color 120ms ease, box-shadow 120ms ease, opacity 120ms ease',
                      userSelect: 'none',
                      '&:active': { cursor: 'grabbing' },
                      '&:hover': {
                        borderColor: '#047b85',
                        boxShadow: '0 8px 22px rgba(4, 123, 133, 0.12)',
                      },
                    }}
                  >
                    <Stack direction="row" alignItems="center" gap={0.75}>
                      <Chip label={index + 1} color="primary" size="small" />
                      <Typography fontWeight={800} fontSize={13} sx={{ flex: 1 }} noWrap>
                        {courier.name}
                      </Typography>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          color: 'text.secondary',
                        }}
                      >
                        <MdDragIndicator size={18} />
                      </Box>
                    </Stack>
                  </Paper>
                ))}
              </Box>
            </Box>
          </Stack>
            </Card>

            <Card sx={{ p: 1.75, borderRadius: 2.5, width: { xs: '100%', lg: 360 } }}>
          <Typography variant="h6" fontWeight={900}>
            Summary
          </Typography>
          <Divider sx={{ my: 1.25 }} />
          <Typography fontWeight={800}>Rule: {ruleName.trim() || '--'}</Typography>
          <Stack direction="row" gap={0.75} flexWrap="wrap" mt={1}>
            {conditions.length ? (
              conditions.map((condition, index) => <Chip key={index} size="small" label={conditionLabel(condition)} />)
            ) : (
              <Typography variant="body2" color="text.secondary">
                No conditions added.
              </Typography>
            )}
          </Stack>
          <Divider sx={{ my: 1.25 }} />
          <Typography variant="body2" color="text.secondary">
            Top priority courier
          </Typography>
          <Typography fontWeight={900}>{effectivePriorityCouriers[0]?.name || 'No courier available'}</Typography>
            </Card>
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Accordion disableGutters sx={{ borderRadius: 2.5, overflow: 'hidden', '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<MdExpandMore />}>
          <Box>
            <Typography fontWeight={900}>Created rules</Typography>
            <Typography variant="caption" color="text.secondary">
              {autoRules.length ? `${autoRules.length} auto assign rule(s)` : 'No rules created yet'}
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          {!autoRules.length ? (
            <Typography color="text.secondary">No rules created yet.</Typography>
          ) : (
            <Stack spacing={1}>
              {autoRules.map((rule) => (
                <Stack
                  key={rule.id}
                  direction={{ xs: 'column', md: 'row' }}
                  alignItems={{ xs: 'flex-start', md: 'center' }}
                  gap={1}
                  sx={{ p: 1.25, border: '1px solid #E5E7EB', borderRadius: 2 }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography fontWeight={900}>{rule.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {(rule.conditions || []).length || 'No'} conditions · {(rule.personalised_order || []).length} couriers
                    </Typography>
                  </Box>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
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
        </AccordionDetails>
      </Accordion>
    </Stack>
  )
}

export default CourierPriorityPage
