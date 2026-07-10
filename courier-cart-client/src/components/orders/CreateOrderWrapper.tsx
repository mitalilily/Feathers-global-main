import { Box, Button, Container, Stack, Tab, Tabs, Typography } from '@mui/material'
import { useEffect, useState, type SyntheticEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import useEmployeePermissions from '../../hooks/User/useEmployeePermissions'
import B2BOrderForm from './b2b/B2BOrderForm'
import B2COrderFormSteps from './b2c/B2COrderForm'
import ReversePickupForm from './reverse/ReversePickupForm'

const getRequestedOrderType = (value: string | null): 'b2c' | 'b2b' =>
  value === 'b2b' ? 'b2b' : 'b2c'

const CreateOrderWrapper = () => {
  const [searchParams] = useSearchParams()
  const requestedType = getRequestedOrderType(searchParams.get('type'))
  const [activeTab, setActiveTab] = useState<'b2c' | 'b2b'>(requestedType)
  const [pickupMode, setPickupMode] = useState<'forward' | 'reverse'>('forward')
  const { canAddReturnOrders, canViewReturnOrders } = useEmployeePermissions()

  useEffect(() => {
    setActiveTab(requestedType)
  }, [requestedType])

  const handleTabChange = (_event: SyntheticEvent, newValue: 'b2c' | 'b2b') => {
    setActiveTab(newValue)
    if (newValue === 'b2c') {
      setPickupMode('forward')
    }
  }

  return (
    <Container
      maxWidth={false}
      sx={{
        px: { xs: 0, sm: 0.25, md: 0.4 },
        py: 0,
        height: { md: 'calc(100dvh - 52px)' },
      }}
    >
      <Box
        sx={{
          flex: 1,
          bgcolor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: { xs: 1.5, sm: 2 },
          boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
          p: { xs: 0.65, sm: 0.75, md: 0.85 },
          minHeight: { xs: 'calc(100dvh - 52px)', md: '100%' },
          height: { md: '100%' },
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: 1,
            borderColor: 'divider',
            mb: 0.55,
            gap: 0.75,
            flexWrap: { xs: 'wrap', sm: 'nowrap' },
            minHeight: 30,
          }}
        >
          <Typography variant="body2" fontWeight={700} color="text.primary">
            Create Order
          </Typography>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            aria-label="order type tabs"
            sx={{
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.78rem',
                minHeight: 28,
                px: { xs: 0.85, sm: 1.1 },
              },
              '& .Mui-selected': {
                color: '#047b85',
              },
              '& .MuiTabs-indicator': {
                backgroundColor: '#047b85',
                height: 3,
              },
            }}
          >
            <Tab label="B2C Order" value="b2c" />
            <Tab label="B2B Order" value="b2b" />
          </Tabs>
        </Box>

        <Box sx={{ height: { md: 'calc(100% - 36px)' }, minHeight: 0 }}>
          {activeTab === 'b2c' ? (
            <Stack sx={{ height: '100%', minHeight: 0 }} spacing={1}>
              {pickupMode === 'forward' ? (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      onClick={() => setPickupMode('forward')}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 700,
                        borderRadius: 999,
                        px: 2,
                        boxShadow: 'none',
                      }}
                    >
                      Forward Order
                    </Button>
                    {canViewReturnOrders ? (
                      <Button
                        variant="outlined"
                        onClick={() => canAddReturnOrders && setPickupMode('reverse')}
                        disabled={!canAddReturnOrders}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 700,
                          borderRadius: 999,
                          px: 2,
                        }}
                      >
                        Reverse Pickup
                      </Button>
                    ) : null}
                  </Stack>
                </Box>
              ) : null}

              <Box sx={{ flex: 1, minHeight: 0 }}>
                {pickupMode === 'forward' || !canViewReturnOrders || !canAddReturnOrders ? (
                  <B2COrderFormSteps />
                ) : (
                  <ReversePickupForm
                    onSwitchToForward={() => setPickupMode('forward')}
                    onSwitchToReverse={() => setPickupMode('reverse')}
                  />
                )}
              </Box>
            </Stack>
          ) : (
            <B2BOrderForm />
          )}
        </Box>
      </Box>
    </Container>
  )
}

export default CreateOrderWrapper
