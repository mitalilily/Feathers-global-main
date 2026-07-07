import { alpha, Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { FiBarChart2, FiMapPin, FiShield, FiUsers, FiZap } from 'react-icons/fi'
import { BRAND } from '../../config/brand'
import PhoneForm from './PhoneForm'

const { teal, orange, ink, text, muted, paper, tealSoft, skySoft } = BRAND.colors

type FeatureTileProps = {
  icon: ReactNode
  title: string
  copy: string
}

function FeatureTile({ icon, title, copy }: FeatureTileProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '48px 1fr',
        gap: 1.5,
        alignItems: 'center',
        minWidth: 0,
        px: { md: 1.35, lg: 1.8 },
        py: 1.1,
        '&:not(:last-of-type)': {
          borderRight: `1px solid ${alpha(teal, 0.12)}`,
        },
      }}
    >
      <Box
        sx={{
          width: 46,
          height: 46,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          color: teal,
          background: `linear-gradient(135deg, ${alpha(tealSoft, 0.92)}, ${alpha(skySoft, 0.64)})`,
          boxShadow: `inset 0 1px 0 ${alpha(paper, 0.92)}`,
          fontSize: 23,
        }}
      >
        {icon}
      </Box>
      <Box minWidth={0}>
        <Typography sx={{ color: ink, fontSize: 14, fontWeight: 900, lineHeight: 1.25 }}>
          {title}
        </Typography>
        <Typography sx={{ mt: 0.55, color: muted, fontSize: 12.5, lineHeight: 1.42 }}>
          {copy}
        </Typography>
      </Box>
    </Box>
  )
}

function FloatingBadge({
  icon,
  label,
  sx,
}: {
  icon: ReactNode
  label: string
  sx: Record<string, unknown>
}) {
  return (
    <Box
      sx={{
        position: 'absolute',
        zIndex: 5,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.9,
        px: 1.25,
        py: 1,
        borderRadius: 1.5,
        color: ink,
        background: alpha(paper, 0.95),
        border: `1px solid ${alpha(teal, 0.1)}`,
        boxShadow: '0 18px 32px rgba(7, 25, 35, 0.11)',
        fontSize: 12,
        fontWeight: 900,
        animation: 'floatSoft 4.8s ease-in-out infinite',
        ...sx,
      }}
    >
      <Box sx={{ color: teal, display: 'grid', placeItems: 'center', fontSize: 18 }}>{icon}</Box>
      {label}
    </Box>
  )
}

function Pin({ color = orange, sx }: { color?: string; sx: Record<string, unknown> }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        zIndex: 4,
        width: 28,
        height: 28,
        borderRadius: '50% 50% 50% 0',
        transform: 'rotate(-45deg)',
        background: color,
        boxShadow: `0 12px 22px ${alpha(color, 0.26)}`,
        animation: 'pinBob 3.8s ease-in-out infinite',
        '&::after': {
          content: '""',
          position: 'absolute',
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: paper,
          left: 9.5,
          top: 9.5,
        },
        ...sx,
      }}
    />
  )
}

function BoxStack() {
  const parcels = [
    { left: 0, bottom: 0, width: 56, height: 42 },
    { left: 48, bottom: 0, width: 62, height: 47 },
    { left: 100, bottom: 0, width: 54, height: 38 },
    { left: 22, bottom: 42, width: 50, height: 38 },
    { left: 80, bottom: 47, width: 60, height: 34 },
  ]

  return (
    <Box sx={{ position: 'absolute', left: 30, bottom: 34, width: 170, height: 96, zIndex: 4 }}>
      {parcels.map((parcel) => (
        <Box
          key={`${parcel.left}-${parcel.bottom}`}
          sx={{
            position: 'absolute',
            left: parcel.left,
            bottom: parcel.bottom,
            width: parcel.width,
            height: parcel.height,
            borderRadius: 0.6,
            background: 'linear-gradient(135deg, #c79556 0%, #e0b77d 58%, #b77e43 100%)',
            border: '1px solid rgba(103, 64, 29, 0.22)',
            boxShadow: '0 10px 18px rgba(72, 45, 23, 0.12)',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: '43%',
              width: 9,
              height: '100%',
              background: 'rgba(110, 69, 33, 0.18)',
            },
            '&::after': {
              content: '"F G"',
              position: 'absolute',
              left: 8,
              bottom: 6,
              color: 'rgba(42, 29, 21, 0.68)',
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: '0.08em',
            },
          }}
        />
      ))}
    </Box>
  )
}

function CargoContainer() {
  return (
    <Box
      sx={{
        position: 'absolute',
        left: { md: 98, lg: 118 },
        bottom: 58,
        width: { md: 260, lg: 288 },
        height: { md: 108, lg: 122 },
        zIndex: 3,
        borderRadius: 1,
        background:
          'linear-gradient(90deg, #0797a1 0%, #0aa4ad 42%, #047b85 75%, #045b65 100%)',
        border: `1px solid ${alpha('#003d45', 0.22)}`,
        boxShadow: '0 26px 38px rgba(6, 46, 55, 0.18)',
        overflow: 'hidden',
        animation: 'cargoFloat 5.5s ease-in-out infinite',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 2px, transparent 2px 22px)',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.16), transparent 30%, rgba(0,0,0,0.18))',
        },
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          left: 58,
          top: 34,
          width: 34,
          height: 42,
          borderRadius: 0.8,
          display: 'grid',
          placeItems: 'center',
          zIndex: 2,
          color: teal,
          background: alpha(paper, 0.92),
          fontWeight: 900,
          fontSize: 21,
          boxShadow: '0 8px 16px rgba(0,0,0,0.13)',
        }}
      >
        F
      </Box>
      <Box
        sx={{
          position: 'absolute',
          left: 90,
          top: 55,
          width: 34,
          height: 36,
          borderRadius: 0.8,
          display: 'grid',
          placeItems: 'center',
          zIndex: 2,
          color: paper,
          background: orange,
          fontWeight: 900,
          fontSize: 19,
          boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
        }}
      >
        G
      </Box>
    </Box>
  )
}

function DeliveryTruck() {
  return (
    <Box
      sx={{
        position: 'absolute',
        left: { md: 322, lg: 350 },
        bottom: 48,
        width: { md: 245, lg: 270 },
        height: { md: 124, lg: 132 },
        zIndex: 4,
        animation: 'truckFloat 4.8s ease-in-out infinite',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          bottom: 27,
          width: '57%',
          height: 88,
          borderRadius: '7px 4px 3px 3px',
          background: 'linear-gradient(135deg, #eff5f7 0%, #cdd9dd 100%)',
          border: '1px solid rgba(91, 113, 120, 0.18)',
          boxShadow: '0 18px 30px rgba(18, 44, 54, 0.16)',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            left: 28,
            top: 26,
            width: 30,
            height: 38,
            borderRadius: 0.8,
            background: teal,
            color: paper,
            display: 'grid',
            placeItems: 'center',
            fontWeight: 900,
            fontSize: 15,
          }}
        >
          F
        </Box>
        <Box
          sx={{
            position: 'absolute',
            left: 52,
            top: 45,
            width: 18,
            height: 24,
            borderRadius: 0.6,
            background: orange,
            color: paper,
            display: 'grid',
            placeItems: 'center',
            fontWeight: 900,
            fontSize: 11,
          }}
        >
          G
        </Box>
      </Box>

      <Box
        sx={{
          position: 'absolute',
          right: 10,
          bottom: 27,
          width: '45%',
          height: 86,
          borderRadius: '9px 18px 5px 3px',
          background: 'linear-gradient(135deg, #eef4f5 0%, #b9c9cf 100%)',
          border: '1px solid rgba(91, 113, 120, 0.2)',
          boxShadow: '0 18px 30px rgba(18, 44, 54, 0.18)',
          '&::before': {
            content: '""',
            position: 'absolute',
            right: 20,
            top: 16,
            width: 54,
            height: 29,
            borderRadius: '5px 12px 3px 3px',
            background: 'linear-gradient(135deg, #57747c, #16343d)',
            boxShadow: `inset 0 0 0 2px ${alpha(paper, 0.18)}`,
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            right: 5,
            bottom: 23,
            width: 22,
            height: 8,
            borderRadius: 5,
            background: '#fff8d5',
            boxShadow: `0 0 20px ${alpha('#fff4a8', 0.75)}`,
            animation: 'headlight 2.2s ease-in-out infinite',
          },
        }}
      />

      {[54, 178].map((left) => (
        <Box
          key={left}
          sx={{
            position: 'absolute',
            left,
            bottom: 14,
            width: 42,
            height: 42,
            borderRadius: '50%',
            background: '#102a31',
            border: '6px solid #5b6e74',
            boxShadow: 'inset 0 0 0 5px #182f37, 0 8px 15px rgba(0,0,0,0.16)',
          }}
        />
      ))}
    </Box>
  )
}

function ShipmentScene() {
  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: 0,
        height: { md: 288, lg: 312 },
        mt: { md: 0.3, lg: 0.6 },
        mb: { md: 0.7, lg: 0.9 },
        overflow: 'visible',
        '@keyframes routeDash': {
          '0%': { strokeDashoffset: 260 },
          '100%': { strokeDashoffset: 0 },
        },
        '@keyframes floatSoft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        '@keyframes pinBob': {
          '0%, 100%': { marginTop: 0 },
          '50%': { marginTop: -9 },
        },
        '@keyframes cargoFloat': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        '@keyframes truckFloat': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        '@keyframes headlight': {
          '0%, 100%': { opacity: 0.72 },
          '50%': { opacity: 1 },
        },
      }}
    >
      <Box
        component="svg"
        viewBox="0 0 640 270"
        preserveAspectRatio="none"
        sx={{
          position: 'absolute',
          inset: { md: '0 5px 35px 0', lg: '0 8px 40px 0' },
          width: '100%',
          height: '72%',
          opacity: 0.7,
        }}
      >
        <defs>
          <pattern id="auth-map-dots" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" fill={alpha(teal, 0.55)} />
          </pattern>
        </defs>
        <path
          fill="url(#auth-map-dots)"
          d="M53 104c33-38 71-52 117-33 24 10 51 9 76 1 45-15 77-9 113 17 33 23 59 23 94 5 33-17 78-17 109 6 30 22 39 54 20 77-21 25-67 30-108 14-30-12-59-12-94-1-50 16-102 11-143-14-30-18-56-19-92-4-40 17-88 10-107-16-13-18-7-35 15-48Z"
        />
        <path
          fill="url(#auth-map-dots)"
          d="M405 58c25-20 67-20 99-3 28 15 45 38 34 59-12 24-60 30-96 14-40-18-68-45-37-70ZM141 48c27-19 69-22 92-6 19 13 13 35-14 46-34 14-91 10-103-13-5-9 2-19 25-27Z"
        />
      </Box>

      <Box
        component="svg"
        viewBox="0 0 640 270"
        preserveAspectRatio="none"
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          '& .route': {
            fill: 'none',
            stroke: teal,
            strokeWidth: 1.5,
            strokeDasharray: '7 7',
            animation: 'routeDash 9s linear infinite',
          },
        }}
      >
        <path className="route" d="M40 222 C126 116 240 150 333 205 S489 247 571 157" />
        <path className="route" d="M270 92 C355 70 398 115 440 190" />
        <path className="route" d="M470 87 C540 24 623 71 591 151" />
      </Box>

      <FloatingBadge
        icon={<FiBarChart2 />}
        label="Real-time Rates"
        sx={{ left: { md: 118, lg: 136 }, top: { md: 66, lg: 78 }, animationDelay: '-1.3s' }}
      />
      <FloatingBadge
        icon={<FiMapPin />}
        label="Smart Tracking"
        sx={{ right: { md: 10, lg: 4 }, top: { md: 44, lg: 54 }, animationDelay: '-2.2s' }}
      />
      <FloatingBadge
        icon={<FiUsers />}
        label="27+ Global Couriers"
        sx={{
          left: { md: 0, lg: 4 },
          bottom: { md: 76, lg: 92 },
          width: 112,
          flexDirection: 'column',
          gap: 0.45,
          textAlign: 'center',
          animationDelay: '-0.6s',
        }}
      />

      <Pin color={teal} sx={{ right: { md: 72, lg: 74 }, top: { md: 36, lg: 44 } }} />
      <Pin color={orange} sx={{ right: { md: 128, lg: 134 }, bottom: { md: 108, lg: 118 }, animationDelay: '-1.7s' }} />
      <Pin color={orange} sx={{ left: { md: 302, lg: 324 }, bottom: { md: 48, lg: 56 }, width: 56, height: 56 }} />
      <BoxStack />
      <CargoContainer />
      <DeliveryTruck />
    </Box>
  )
}

export default function LoginForm() {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        height: { xs: 'auto', md: '100dvh' },
        width: '100%',
        overflow: { xs: 'auto', md: 'hidden' },
        touchAction: 'pan-y pinch-zoom',
        WebkitOverflowScrolling: 'touch',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: { xs: 1.5, sm: 2.5, md: 4.5, lg: 6 },
        py: { xs: 2, md: 4.5 },
        background:
          `linear-gradient(90deg, ${alpha(teal, 0.05)} 1px, transparent 1px) 0 0 / 52px 52px, ` +
          `linear-gradient(${alpha(teal, 0.045)} 1px, transparent 1px) 0 0 / 52px 52px, ` +
          'linear-gradient(180deg, #ffffff 0%, #fbfdfe 55%, #f6fbfc 100%)',
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 1320,
          height: { xs: 'auto', md: 'calc(100dvh - 72px)' },
          maxHeight: { md: 760, lg: 792 },
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.05fr) minmax(430px, 0.92fr)' },
          gap: { xs: 2.5, md: 5.5, lg: 6.5 },
          alignItems: 'stretch',
          minHeight: 0,
        }}
      >
        <Box
          sx={{
            display: { xs: 'none', md: 'grid' },
            gridTemplateRows: 'auto minmax(0, 1fr) auto',
            minHeight: 0,
            height: '100%',
            pt: { md: 2.8, lg: 3.8 },
            pb: { md: 0.4, lg: 0.8 },
          }}
        >
          <Box>
            <Typography
              sx={{
                color: orange,
                fontWeight: 900,
                fontSize: { md: 15, lg: 16 },
                lineHeight: 1.2,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                mb: { md: 2.2, lg: 2.6 },
              }}
            >
              One platform. All couriers.
            </Typography>

            <Typography
              component="h1"
              sx={{
                color: ink,
                fontWeight: 900,
                fontSize: { md: 54, lg: 62 },
                lineHeight: 1.08,
                letterSpacing: 0,
                mb: { md: 1.8, lg: 2.1 },
              }}
            >
              Your Shipments.
              <Box component="span" sx={{ display: 'block', color: teal }}>
                One Smarter Way.
              </Box>
            </Typography>

            <Typography
              sx={{
                color: text,
                fontSize: { md: 18, lg: 20 },
                lineHeight: 1.55,
                maxWidth: 550,
              }}
            >
              Access multiple courier partners, compare rates in real time and ship with confidence
              - all from a single platform.
            </Typography>
          </Box>

          <ShipmentScene />

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              alignItems: 'stretch',
              minHeight: { md: 90, lg: 96 },
              borderRadius: 2,
              border: `1px solid ${alpha(teal, 0.12)}`,
              background: alpha(paper, 0.9),
              boxShadow: '0 18px 42px rgba(7, 25, 35, 0.08)',
              backdropFilter: 'blur(14px)',
              overflow: 'hidden',
            }}
          >
            <FeatureTile
              icon={<FiUsers />}
              title="27+ Couriers"
              copy="One integration for all your shipments"
            />
            <FeatureTile
              icon={<FiShield />}
              title="Best Rates"
              copy="Compare and choose the most reliable rates"
            />
            <FeatureTile
              icon={<FiZap />}
              title="Faster Deliveries"
              copy="Optimized routing for on-time deliveries"
            />
          </Box>
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 0,
            minHeight: { xs: '100dvh', md: 0 },
          }}
        >
          <Box
            sx={{
              width: '100%',
              maxWidth: { xs: 560, md: 560 },
              height: { xs: 'auto', md: '100%' },
              maxHeight: { md: 742 },
              minHeight: { xs: 'auto', md: 0 },
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              borderRadius: 2,
              border: `1px solid ${alpha(teal, 0.12)}`,
              background: alpha(paper, 0.94),
              boxShadow: '0 24px 72px rgba(7, 25, 35, 0.1)',
              backdropFilter: 'blur(18px)',
              px: { xs: 2, sm: 3.2, md: 3.6, lg: 4 },
              py: { xs: 2.4, sm: 3, md: 3.2, lg: 3.4 },
              overflow: 'hidden',
              touchAction: 'pan-y pinch-zoom',
            }}
          >
            <Box sx={{ mb: { xs: 1.7, md: 1.9 } }}>
              <Typography
                component="h2"
                sx={{
                  color: '#102344',
                  fontWeight: 900,
                  fontSize: { xs: 30, sm: 33 },
                  lineHeight: 1.1,
                  letterSpacing: 0,
                }}
              >
                Welcome back!
              </Typography>
              <Typography sx={{ mt: 1.15, color: '#263a59', fontSize: 15.5, lineHeight: 1.5 }}>
                Sign in to access your dashboard and manage your shipments.
              </Typography>
            </Box>

            <PhoneForm />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
