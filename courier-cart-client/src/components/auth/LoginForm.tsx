import { Box, Typography } from '@mui/material'
import { useState } from 'react'
import PhoneForm from './PhoneForm'

const BRAND_ORANGE = '#E85500'

export default function LoginForm() {
  const [isHovering, setIsHovering] = useState(false)

  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #fafbfc 0%, #f3f5f7 100%)',
        px: { xs: 2, sm: 3 },
        py: { xs: 3, sm: 4 },
      }}
    >
      {/* Main Card Container */}
      <Box
        sx={{
          width: '100%',
          maxWidth: 1100,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: { xs: 0, md: 4 },
          background: '#ffffff',
          borderRadius: { xs: '24px', md: '32px' },
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.08)',
          overflow: { xs: 'hidden', md: 'visible' },
        }}
      >
        {/* LEFT PANEL - LOGIN FORM */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            px: { xs: 2.5, sm: 4, md: 5 },
            py: { xs: 4, md: 6 },
          }}
        >
          {/* Logo & Header */}
          <Box sx={{ mb: 4 }}>
            <Box
              component="img"
              src="/logo/shiplifi-logo.png"
              alt="Shiplifi"
              sx={{ width: 120, height: 'auto', mb: 2.5 }}
            />

            <Typography
              sx={{
                fontSize: '0.65rem',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: BRAND_ORANGE,
                fontWeight: 900,
                mb: 1,
              }}
            >
              Merchant Platform
            </Typography>

            <Typography
              sx={{
                color: '#0f172a',
                fontWeight: 700,
                fontSize: { xs: '1.6rem', sm: '1.9rem' },
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
                mb: 0.5,
              }}
            >
              Welcome Back
            </Typography>

            <Typography
              sx={{
                color: '#64748b',
                fontSize: '0.95rem',
                fontWeight: 400,
                lineHeight: 1.6,
              }}
            >
              Sign in to manage your shipments across India
            </Typography>
          </Box>

          {/* Login Form */}
          <Box sx={{ mb: 3 }}>
            <PhoneForm />
          </Box>

          {/* Footer Text */}
          <Typography
            sx={{
              fontSize: '0.8rem',
              color: '#94a3b8',
              textAlign: 'center',
              mt: 2,
            }}
          >
            Secure merchant access with industry-leading encryption
          </Typography>
        </Box>

        {/* RIGHT PANEL - HERO IMAGE WITH BLOB SHAPE */}
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            minHeight: 500,
            px: { md: 3 },
            py: { md: 6 },
            overflow: 'hidden',
          }}
        >
          {/* Blob-shaped image container with organic asymmetrical shape */}
          <Box
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            sx={{
              position: 'relative',
              width: '100%',
              maxWidth: 380,
              aspectRatio: '1',
              cursor: 'pointer',
              transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
              transform: isHovering ? 'scale(1.05)' : 'scale(1)',
              filter: isHovering ? 'drop-shadow(0 30px 60px rgba(217, 4, 22, 0.15))' : 'drop-shadow(0 15px 40px rgba(0, 0, 0, 0.1))',
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                background: 'url(/images/login.jpg)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%',
                opacity: 1,
                transition: 'border-radius 0.6s ease-in-out',
                zIndex: 1,
              },
              '&:hover::before': {
                borderRadius: '30% 60% 70% 40% / 50% 60% 30% 60%',
              },
            }}
          />

          {/* Animated gradient overlay for depth */}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at 30% 30%, rgba(217, 4, 22, 0.1) 0%, transparent 60%)',
              pointerEvents: 'none',
              borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%',
            }}
          />

          {/* Animated background elements */}
          <Box
            sx={{
              position: 'absolute',
              top: -50,
              right: -50,
              width: 200,
              height: 200,
              background: 'radial-gradient(circle, rgba(217, 4, 22, 0.05) 0%, transparent 70%)',
              borderRadius: '50%',
              animation: 'float 6s ease-in-out infinite',
              '@keyframes float': {
                '0%, 100%': { transform: 'translateY(0px)' },
                '50%': { transform: 'translateY(-20px)' },
              },
            }}
          />

          <Box
            sx={{
              position: 'absolute',
              bottom: -30,
              left: -30,
              width: 150,
              height: 150,
              background: 'radial-gradient(circle, rgba(100, 116, 139, 0.05) 0%, transparent 70%)',
              borderRadius: '50%',
              animation: 'float 8s ease-in-out infinite',
              '@keyframes float': {
                '0%, 100%': { transform: 'translateY(0px)' },
                '50%': { transform: 'translateY(20px)' },
              },
            }}
          />
        </Box>
      </Box>

      {/* Add global styles for blob animation */}
      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }

        @keyframes blobRotate {
          0%, 100% {
            border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
          }
          50% {
            border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%;
          }
        }
      `}</style>
    </Box>
  )
}
