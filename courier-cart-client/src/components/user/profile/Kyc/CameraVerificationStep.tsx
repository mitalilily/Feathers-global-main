import { Box, Button, Stack, Typography } from '@mui/material'
import React, { useEffect, useRef, useState } from 'react'
import { MdCameraAlt, MdRefresh, MdVerifiedUser } from 'react-icons/md'
import { uploadKycDocumentToBackend } from '../../../../api/upload.api'
import { toast } from '../../../UI/Toast'

interface CameraVerificationValue {
  selfieUrl?: string
  selfieMime?: string
}

interface Props {
  defaultValue?: CameraVerificationValue
  onComplete: (data: CameraVerificationValue) => void
  submitLabel?: string
}

const CameraVerificationStep: React.FC<Props> = ({
  defaultValue,
  onComplete,
  submitLabel = 'Submit KYC',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraUnavailable, setCameraUnavailable] = useState(false)
  const [captureUrl, setCaptureUrl] = useState<string | null>(null)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    let mounted = true

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } },
          audio: false,
        })
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setCameraReady(true)
      } catch {
        setCameraUnavailable(true)
        toast.open({
          message: 'Camera access is blocked. Use upload selfie, or open the app on HTTPS to capture live camera directly.',
          severity: 'error',
        })
      }
    }

    startCamera()

    return () => {
      mounted = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      if (captureUrl) URL.revokeObjectURL(captureUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const captureSelfie = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const width = video.videoWidth || 720
    const height = video.videoHeight || 540
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return

    context.drawImage(video, 0, 0, width, height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        if (captureUrl) URL.revokeObjectURL(captureUrl)
        const file = new File([blob], `kyc-selfie-${Date.now()}.jpg`, { type: 'image/jpeg' })
        setSelfieFile(file)
        setCaptureUrl(URL.createObjectURL(blob))
      },
      'image/jpeg',
      0.92,
    )
  }

  const useFallbackFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.open({ message: 'Please choose a selfie image.', severity: 'error' })
      return
    }

    if (captureUrl) URL.revokeObjectURL(captureUrl)
    setSelfieFile(file)
    setCaptureUrl(URL.createObjectURL(file))
  }

  const submitSelfie = async () => {
    if (!selfieFile && defaultValue?.selfieUrl) {
      onComplete({
        selfieUrl: defaultValue.selfieUrl,
        selfieMime: defaultValue.selfieMime || 'image/jpeg',
      })
      return
    }

    if (!selfieFile) {
      toast.open({ message: 'Capture a selfie to continue.', severity: 'error' })
      return
    }

    try {
      setUploading(true)
      const uploaded = await uploadKycDocumentToBackend(selfieFile)
      onComplete({
        selfieUrl: uploaded.key,
        selfieMime: uploaded.mime || 'image/jpeg',
      })
    } catch (error: any) {
      toast.open({
        message: error?.response?.data?.message || 'Selfie upload failed. Please try again.',
        severity: 'error',
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h6" fontWeight={700} color="#111827">
          Camera Verification
        </Typography>
        <Typography fontSize={13} color="#6B7280" mt={0.5}>
          Capture a clear live selfie so the verification team can match you with the submitted identity documents.
        </Typography>
      </Box>

      <Box
        sx={{
          border: '1px solid rgba(15, 23, 42, 0.1)',
          bgcolor: '#F8FAFC',
          p: { xs: 1.5, md: 2 },
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          hidden
          onChange={useFallbackFile}
        />
        <Box
          sx={{
            position: 'relative',
            overflow: 'hidden',
            bgcolor: '#111827',
            aspectRatio: '4 / 3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {captureUrl ? (
            <Box
              component="img"
              src={captureUrl}
              alt="Captured selfie"
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <Box
              component="video"
              ref={videoRef}
              playsInline
              muted
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          {!cameraReady && !captureUrl && (
            <Typography color="white" fontSize={14} fontWeight={700} textAlign="center" px={2}>
              {cameraUnavailable ? 'Camera unavailable. Upload a selfie to continue.' : 'Starting camera...'}
            </Typography>
          )}
        </Box>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="flex-end">
        <Button
          variant="outlined"
          startIcon={captureUrl ? <MdRefresh /> : <MdCameraAlt />}
          onClick={() => {
            if (captureUrl) {
              URL.revokeObjectURL(captureUrl)
              setCaptureUrl(null)
              setSelfieFile(null)
            } else {
              captureSelfie()
            }
          }}
          disabled={!cameraReady || uploading}
        >
          {captureUrl ? 'Retake' : 'Capture Selfie'}
        </Button>
        <Button
          variant="outlined"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          Upload Selfie
        </Button>
        <Button
          variant="contained"
          startIcon={<MdVerifiedUser />}
          onClick={submitSelfie}
          disabled={uploading || (!captureUrl && !defaultValue?.selfieUrl)}
        >
          {uploading ? 'Uploading...' : submitLabel}
        </Button>
      </Stack>
    </Stack>
  )
}

export default CameraVerificationStep
