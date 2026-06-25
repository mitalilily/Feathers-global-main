import React from 'react'
import {
  clearAdminAssetReloadAttempt,
  isAdminAssetLoadError,
  reloadAdminOnceForFreshAssets,
} from '../../utils/adminRuntimeRecovery'

export default class AdminAppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      error: null,
    }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Admin app crashed:', error, errorInfo)

    if (isAdminAssetLoadError(error)) {
      reloadAdminOnceForFreshAssets()
    }
  }

  handleReload = () => {
    clearAdminAssetReloadAttempt()
    window.location.reload()
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    const isAssetError = isAdminAssetLoadError(this.state.error)

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#f4fbfc',
          color: '#071923',
          fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '460px',
            padding: '28px',
            border: '1px solid #d7eef1',
            borderRadius: '12px',
            background: '#ffffff',
            boxShadow: '0 18px 46px rgba(7, 25, 35, 0.1)',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '22px', lineHeight: 1.25 }}>
            Admin panel could not finish loading
          </h1>
          <p style={{ margin: '14px 0 0', color: '#5f7a8f', fontSize: '14px', lineHeight: 1.7 }}>
            {isAssetError
              ? 'A new admin version was deployed while your browser still had older files cached.'
              : 'Something interrupted the admin console while it was starting.'}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              marginTop: '22px',
              width: '100%',
              height: '44px',
              border: 0,
              borderRadius: '10px',
              background: '#047b85',
              color: '#ffffff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reload admin
          </button>
        </div>
      </div>
    )
  }
}
