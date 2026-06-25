const CHUNK_RELOAD_KEY = 'admin_chunk_reload_attempted'

export const isAdminAssetLoadError = (error) => {
  const message =
    typeof error === 'string' ? error : `${error?.name || ''} ${error?.message || ''}`
  return /ChunkLoadError|Loading chunk|CSS_CHUNK_LOAD_FAILED|Loading CSS chunk/i.test(message)
}

export const reloadAdminOnceForFreshAssets = () => {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1') {
      return false
    }

    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
  } catch (err) {
    // Storage can be unavailable in private modes; reloading is still the best recovery.
  }

  window.location.reload()
  return true
}

export const clearAdminAssetReloadAttempt = () => {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
  } catch (err) {
    // No-op.
  }
}

export const installAdminRuntimeRecovery = () => {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (event) => {
    if (isAdminAssetLoadError(event.error) || isAdminAssetLoadError(event.message)) {
      reloadAdminOnceForFreshAssets()
    }
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (isAdminAssetLoadError(event.reason)) {
      reloadAdminOnceForFreshAssets()
    }
  })

  window.addEventListener('load', clearAdminAssetReloadAttempt)
}
