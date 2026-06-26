// notificationSocket.js
import { io } from 'socket.io-client'
const URL = process.env.REACT_APP_SOCKET_URL || 'https://api.shiplifi.com'
export const socket = io(URL) // Your backend URL

export function registerUser(userId) {
  socket.emit('register', userId)
}
