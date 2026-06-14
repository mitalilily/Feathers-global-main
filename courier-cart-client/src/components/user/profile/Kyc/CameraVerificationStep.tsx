import {
  Alert,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
  alpha,
} from '@mui/material'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MdCameraAlt, MdPhotoCamera, MdRefresh, MdVerifiedUser } from 'react-icons/md'
import { uploadFileToStorage } from '../../../../api/upload.api'
import { usePresignedDownloadUrls } from '../../../../hooks/Uploads/usePresignedDownloadUrls'
import type { KycDetails } from '../../../../types/user.types'
import { toast } from '../../../UI/Toast'

type CameraVerificationPayload = Pick<KycDetails, 'selfieUrl'> & {
  selfieMime?: string
}

interface Props {
  defaultValue?: Partial<KycDetails>
  submitting?: boolean
  onChange?: (data: CameraVerificationPayload) => void
  onComplete: (data: CameraVerificationPayload) => void
}

const BRAND_PRIMARY = '#047b85'
const BRAND_ACCENT = '#ff821c'

const blobFromCanvas = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Unable to capture camera image'))
      },
      'image/jpeg',
      0.92,
    )
  })

export default function CameraVerificationStep({
  defaultValue,
  submitting = false,
  onChange,
  onComplete,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [streamActive, setStreamActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showExistingPreview, setShowExistingPreview] = useState(true)
  const [uploaded, setUploaded] = useState<CameraVerificationPayload>({
    selfieUrl: defaultValue?.selfieUrl || '',
    selfieMime: defaultValue?.selfieMime || 'image/jpeg',
  })

  const { data: existingSelfieUrl } = usePresignedDownloadUrls({
    keys: defaultValue?.selfieUrl,
    enabled: Boolean(defaultValue?.selfieUrl && !previewUrl && showExistingPreview),
  })

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStreamActive(false)
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const startCamera = useCallback(async () => {
    stopCamera()
    setCameraError('')

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not available in this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      streamRef.current = stream
      setStreamActive(true)
    } catch (error: any) {
      setCameraError(
        error?.name === 'NotAllowedError'
          ? 'Camera permission was blocked. Allow camera access or upload a selfie image below.'
          : 'Camera could not be started. Upload a selfie image below or try again.',
      )
    }
  }, [stopCamera])

  useEffect(() => {
    if (defaultValue?.selfieUrl && showExistingPreview) return () => undefined
    void startCamera()
    return () => stopCamera()
  }, [defaultValue?.selfieUrl, showExistingPreview, startCamera, stopCamera])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !streamRef.current) return

    video.srcObject = streamRef.current
    void video.play().catch(() => {
      setCameraError('Camera preview could not start. Please try again.')
    })
  }, [streamActive])

  useEffect(
    () => () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl],
  )

  const handleCapturedFile = async (file: File) => {
    setUploading(true)
    setUploadProgress(0)

    try {
      const result = await uploadFileToStorage(file, 'kyc', setUploadProgress)
      const payload = { selfieUrl: result.key, selfieMime: result.mime || 'image/jpeg' }
      const localPreview = URL.createObjectURL(file)

      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(localPreview)
      setShowExistingPreview(false)
      setUploaded(payload)
      onChange?.(payload)
      stopCamera()

      toast.open({ message: 'Camera verification image uploaded.', severity: 'success' })
    } catch (error: any) {
      toast.open({
        message: error?.message || 'Failed to upload camera verification image.',
        severity: 'error',
      })
    } finally {
      setUploading(false)
    }
  }

  const captureSelfie = async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) {
      toast.open({ message: 'Camera is still loading. Please try again.', severity: 'warning' })
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const context = canvas.getContext('2d')
    if (!context) {
      toast.open({ message: 'Unable to capture camera image.', severity: 'error' })
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await blobFromCanvas(canvas)
    const file = new File([blob], `kyc-selfie-${Date.now()}.jpg`, { type: 'image/jpeg' })
    await handleCapturedFile(file)
  }

  const handleSubmit = () => {
    if (!uploaded.selfieUrl) {
      toast.open({ message: 'Capture or upload your camera verification image.', severity: 'error' })
      return
    }
    onComplete(uploaded)
  }

  const displayPreview =
    previewUrl || (showExistingPreview && typeof existingSelfieUrl === 'string' ? existingSelfieUrl : null)

  return (
    <Box>
      <Typography variant="h6" mb={0.5} fontWeight={700} color="#111827">
        Camera Verification
      </Typography>
      <Typography fontSize={13} color="#6B7280" mb={2.5}>
        Capture a clear live selfie to complete the KYC submission.
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.25fr) minmax(280px, 0.75fr)' },
          gap: 2.5,
          alignItems: 'stretch',
        }}
      >
        <Box
          sx={{
            border: `1px solid ${alpha(BRAND_PRIMARY, 0.16)}`,
            bgcolor: '#F8FAFC',
            p: { xs: 1.25, md: 1.5 },
          }}
        >
          <Box
            sx={{
              position: 'relative',
              overflow: 'hidden',
              aspectRatio: '16 / 10',
              bgcolor: '#0F172A',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {displayPreview ? (
              <Box
                component="img"
                src={displayPreview}
                alt="Camera verification preview"
                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <>
                <Box
                  component="video"
                  ref={videoRef}
                  playsInline
                  muted
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {!streamActive && !cameraError && (
                  <Stack alignItems="center" spacing={1} sx={{ position: 'absolute', color: '#fff' }}>
                    <CircularProgress size={30} sx={{ color: '#fff' }} />
                    <Typography fontSize={13} fontWeight={700}>
                      Starting camera
                    </Typography>
                  </Stack>
                )}
              </>
            )}
          </Box>

          {cameraError && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              {cameraError}
            </Alert>
          )}

          {uploading && (
            <Box sx={{ mt: 1.5 }}>
              <LinearProgress
                variant="determinate"
                value={uploadProgress}
                sx={{
                  height: 8,
                  bgcolor: alpha(BRAND_PRIMARY, 0.12),
                  '& .MuiLinearProgress-bar': { bgcolor: BRAND_PRIMARY },
                }}
              />
              <Typography mt={0.75} fontSize={12} fontWeight={700} color="#496189">
                Uploading {uploadProgress}%
              </Typography>
            </Box>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} mt={2}>
            <Button
              variant="contained"
              startIcon={<MdPhotoCamera />}
              onClick={captureSelfie}
              disabled={!streamActive || uploading || submitting}
              sx={{ bgcolor: BRAND_PRIMARY, fontWeight: 700, '&:hover': { bgcolor: '#035F67' } }}
            >
              Capture
            </Button>
            <Button
              variant="outlined"
              startIcon={<MdRefresh />}
              onClick={() => {
                setPreviewUrl(null)
                setShowExistingPreview(false)
              }}
              disabled={uploading || submitting}
              sx={{ borderColor: alpha(BRAND_PRIMARY, 0.35), color: BRAND_PRIMARY, fontWeight: 700 }}
            >
              Retake
            </Button>
          </Stack>
        </Box>

        <Stack
          spacing={2}
          sx={{
            border: `1px solid ${alpha(BRAND_ACCENT, 0.22)}`,
            bgcolor: alpha(BRAND_ACCENT, 0.06),
            p: { xs: 1.5, md: 2 },
            justifyContent: 'space-between',
          }}
        >
          <Stack spacing={1.4}>
            <Box
              sx={{
                width: 46,
                height: 46,
                borderRadius: 2,
                display: 'grid',
                placeItems: 'center',
                color: BRAND_PRIMARY,
                bgcolor: alpha(BRAND_PRIMARY, 0.1),
              }}
            >
              <MdCameraAlt size={25} />
            </Box>
            <Box>
              <Typography fontSize={15} fontWeight={800} color="#111827">
                Live face check
              </Typography>
              <Typography mt={0.6} fontSize={13} color="#496189" lineHeight={1.55}>
                Face the camera, keep the frame well lit, and avoid masks or heavy glare.
              </Typography>
            </Box>
          </Stack>

          <Button
            variant="contained"
            size="large"
            startIcon={<MdVerifiedUser />}
            onClick={handleSubmit}
            disabled={!uploaded.selfieUrl || uploading || submitting}
            sx={{
              bgcolor: BRAND_PRIMARY,
              fontWeight: 800,
              boxShadow: 'none',
              '&:hover': { bgcolor: '#035F67', boxShadow: 'none' },
            }}
          >
            {submitting ? 'Submitting...' : 'Submit KYC'}
          </Button>
        </Stack>
      </Box>
    </Box>
  )
}
