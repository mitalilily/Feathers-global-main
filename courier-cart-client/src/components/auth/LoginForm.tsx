import { alpha, Box, Stack, Typography } from '@mui/material'
import { FiCheckCircle, FiMapPin, FiTruck } from 'react-icons/fi'
import { BRAND, brandGradient } from '../../config/brand'
import PhoneForm from './PhoneForm'

const { teal, tealDark, orange, amberSoft, skySoft, ink, text, muted, paper } = BRAND.colors

export default function LoginForm() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: brandGradient,
        px: { xs: 1.5, sm: 3 },
        py: { xs: 2, sm: 4 },
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 1180,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '0.94fr 1.06fr' },
          borderRadius: { xs: 3, md: 4 },
          border: `1px solid ${alpha(teal, 0.16)}`,
          background: alpha(paper, 0.9),
          boxShadow: '0 24px 70px rgba(15, 44, 67, 0.12)',
          overflow: 'hidden',
          backdropFilter: 'blur(18px)',
        }}
      >
        <Box
          sx={{
            px: { xs: 2.2, sm: 4, md: 5 },
            py: { xs: 3.4, md: 5.5 },
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minWidth: 0,
          }}
        >
          <Box component="img" src={BRAND.logo} alt={BRAND.name} sx={{ width: 174, mb: 2.8 }} />

          <Typography
            sx={{
              fontSize: '0.74rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: orange,
              fontWeight: 800,
              mb: 1,
            }}
          >
            Merchant Workspace
          </Typography>

          <Typography
            sx={{
              color: ink,
              fontWeight: 800,
              fontSize: { xs: '1.75rem', sm: '2.1rem' },
              lineHeight: 1.18,
              mb: 1,
            }}
          >
            Welcome back
          </Typography>

          <Typography sx={{ color: muted, fontSize: '0.96rem', lineHeight: 1.7, mb: 3 }}>
            Sign in to manage shipments, tracking, billing, and marketplace operations.
          </Typography>

          <PhoneForm />
        </Box>

        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            position: 'relative',
            minHeight: 610,
            overflow: 'hidden',
            background:
              `linear-gradient(135deg, ${alpha(teal, 0.96)} 0%, ${alpha(tealDark, 0.98)} 58%, #012f38 100%)`,
            color: '#ffffff',
            p: { md: 4.5, lg: 5 },
            alignItems: 'stretch',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background:
                `linear-gradient(90deg, ${alpha('#ffffff', 0.08)} 1px, transparent 1px) 0 0 / 58px 58px, linear-gradient(${alpha('#ffffff', 0.07)} 1px, transparent 1px) 0 0 / 58px 58px`,
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              width: 300,
              height: 300,
              right: -120,
              top: -100,
              borderRadius: '50%',
              background: alpha(amberSoft, 0.24),
              filter: 'blur(4px)',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              width: 260,
              height: 260,
              left: -110,
              bottom: -90,
              borderRadius: '50%',
              background: alpha(skySoft, 0.24),
            }}
          />

          <Stack
            sx={{
              position: 'relative',
              zIndex: 1,
              width: '100%',
              justifyContent: 'space-between',
              minWidth: 0,
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '2rem', lineHeight: 1.18 }}>
                One workspace for cleaner shipping decisions.
              </Typography>
              <Typography sx={{ mt: 1.8, color: alpha('#ffffff', 0.76), lineHeight: 1.8 }}>
                Reliable order movement, operational visibility, and finance controls in a calmer
                dashboard.
              </Typography>
            </Box>

            <Box
              sx={{
                position: 'relative',
                minHeight: 270,
                borderRadius: 3,
                border: `1px solid ${alpha('#ffffff', 0.22)}`,
                background: alpha('#ffffff', 0.1),
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
                overflow: 'hidden',
                p: 2.2,
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  inset: '18px 22px',
                  borderRadius: 2,
                  border: `1px dashed ${alpha('#ffffff', 0.28)}`,
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  left: '14%',
                  top: '28%',
                  width: '72%',
                  height: 2,
                  background: `linear-gradient(90deg, ${orange}, ${skySoft})`,
                  transform: 'rotate(-8deg)',
                  boxShadow: `0 10px 26px ${alpha('#000', 0.18)}`,
                }}
              />
              {[
                { label: 'Booked', left: '12%', top: '22%', icon: <FiMapPin /> },
                { label: 'In transit', left: '46%', top: '42%', icon: <FiTruck /> },
                { label: 'Delivered', left: '68%', top: '18%', icon: <FiCheckCircle /> },
              ].map((item) => (
                <Box
                  key={item.label}
                  sx={{
                    position: 'absolute',
                    left: item.left,
                    top: item.top,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.8,
                    px: 1.4,
                    py: 0.9,
                    borderRadius: 2,
                    color: text,
                    background: alpha('#ffffff', 0.92),
                    boxShadow: '0 16px 32px rgba(7, 25, 35, 0.18)',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                  }}
                >
                  <Box sx={{ color: teal, display: 'flex' }}>{item.icon}</Box>
                  {item.label}
                </Box>
              ))}
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 1.2,
              }}
            >
              {[
                ['Multi-carrier', 'allocation'],
                ['COD', 'visibility'],
                ['KYC', 'readiness'],
              ].map(([title, subtitle]) => (
                <Box
                  key={title}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    border: `1px solid ${alpha('#ffffff', 0.18)}`,
                    background: alpha('#ffffff', 0.1),
                    minHeight: 88,
                  }}
                >
                  <Typography sx={{ fontWeight: 800, color: '#ffffff' }}>{title}</Typography>
                  <Typography sx={{ mt: 0.4, fontSize: '0.78rem', color: alpha('#ffffff', 0.66) }}>
                    {subtitle}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}
