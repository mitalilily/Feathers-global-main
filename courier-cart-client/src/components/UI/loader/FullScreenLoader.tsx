import { Box } from '@mui/material'
import React from 'react'
import { BRAND } from '../../../config/brand'
import './loader.css'

type Props = {
  night?: boolean
}

const FullScreenLoader: React.FC<Props> = ({ night = false }) => {
  return (
    <Box className={`loader-overlay ${night ? 'night' : ''}`}>
      <Box className="loader-content">
        <div className="logo-container">
          <img src={BRAND.logo} alt={`${BRAND.name} Logo`} className="loader-logo" />
          <div className="pulse-ring"></div>
          <div className="pulse-ring pulse-ring-delay"></div>
        </div>
      </Box>
    </Box>
  )
}

export default FullScreenLoader
