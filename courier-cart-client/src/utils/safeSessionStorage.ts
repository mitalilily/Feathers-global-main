const memoryStorage = new Map<string, string>()

export const getSessionStorageItem = (key: string) => {
  if (typeof window === 'undefined') return memoryStorage.get(key) || ''

  try {
    return window.sessionStorage.getItem(key) || memoryStorage.get(key) || ''
  } catch {
    return memoryStorage.get(key) || ''
  }
}

export const setSessionStorageItem = (key: string, value: string) => {
  memoryStorage.set(key, value)
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // Keep the current embedded session functional when browser storage is blocked.
  }
}

export const removeSessionStorageItem = (key: string) => {
  memoryStorage.delete(key)
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // The in-memory value has already been removed.
  }
}
