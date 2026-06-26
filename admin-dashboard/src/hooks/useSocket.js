import { useEffect } from 'react'
import { io } from 'socket.io-client'
import { useAuthStore } from 'store/useAuthStore'
import { useNotificationsStore } from 'store/useNotificationsStore'
import { apiBaseURL } from '../services/axios'

export const useSocket = () => {
  const { userId } = useAuthStore()
  const { addNotification } = useNotificationsStore()

  useEffect(() => {
    if (!userId) return

    const socketOrigin = (process.env.REACT_APP_SOCKET_URL || apiBaseURL)
      .replace(/\/api\/?$/, '')
      .replace(/\/+$/, '')
    const socket = io(socketOrigin)

    socket.emit('register', userId)

    socket.on('new_notification', (notification) => {
      addNotification(notification)
    })

    return () => {
      socket.disconnect()
    }
  }, [userId])
}
