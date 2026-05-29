import { io, type Socket } from 'socket.io-client'

const resolveSocketUrl = () => {
  if (import.meta.env.VITE_APP_SOCKET_URL) return import.meta.env.VITE_APP_SOCKET_URL

  const apiUrl = import.meta.env.VITE_API_URL
  if (apiUrl) {
    try {
      return new URL(apiUrl, window.location.origin).origin
    } catch {
      return window.location.origin
    }
  }

  return window.location.origin
}

let socket: Socket | null = null

const getSocket = () => {
  if (!socket) {
    socket = io(resolveSocketUrl(), { transports: ['websocket', 'polling'] })
  }

  return socket
}

let pingInterval: number | null = null

export const registerUserSocket = (user: { id: string; role: string }) => {
  if (user.role !== 'employee') return

  const activeSocket = getSocket()
  activeSocket.emit('register', user.id)

  // Ping every 10 seconds to maintain online status
  pingInterval = window.setInterval(() => {
    activeSocket.emit('employee_ping', user.id)
  }, 10000)

  activeSocket.on('new_notification', (msg) => {
    console.log('Received notification:', msg)
  })
}

export const disconnectSocket = () => {
  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = null
  }
  socket?.disconnect()
  socket = null
}

export default getSocket
