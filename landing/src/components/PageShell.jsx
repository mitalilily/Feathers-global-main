import { motion } from 'framer-motion'

export function PageShell({ children }) {
  const MotionDiv = motion.div

  return (
    <MotionDiv
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      {children}
    </MotionDiv>
  )
}
