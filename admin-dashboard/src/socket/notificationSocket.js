// notificationSocket.js
import { io } from 'socket.io-client'
import { apiBaseURL } from '../services/axios'

const socketOrigin = (process.env.REACT_APP_SOCKET_URL || apiBaseURL)
  .replace(/\/api\/?$/, '')
  .replace(/\/+$/, '')

export const socket = io(socketOrigin) // Your backend URL

export function registerUser(userId) {
  socket.emit('register', userId)
}
