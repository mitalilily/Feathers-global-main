import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import * as dotenv from 'dotenv'
import path from 'path'

// Determine environment
const env = process.env.NODE_ENV || 'development'

// Load the correct .env file
dotenv.config({ path: path.resolve(__dirname, `../.env.${env}`) })

export const normalizeR2Endpoint = (endpoint = process.env.R2_ENDPOINT) => {
  if (!endpoint) return undefined

  try {
    const url = new URL(endpoint)
    url.pathname = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return endpoint.replace(/\/+$/, '')
  }
}

export const getR2EndpointPathParts = (endpoint = process.env.R2_ENDPOINT) => {
  if (!endpoint) return []

  try {
    return new URL(endpoint).pathname.split('/').filter(Boolean)
  } catch {
    return []
  }
}

export const getR2PublicBaseUrl = (bucket?: string) => {
  const configuredPublicBase = process.env.R2_PUBLIC_BASE_URL?.trim()
  if (configuredPublicBase) return configuredPublicBase.replace(/\/+$/, '')

  const endpoint = normalizeR2Endpoint()
  if (!endpoint) return ''

  return bucket ? `${endpoint}/${bucket}` : endpoint
}

export const r2 = new S3Client({
  region: 'auto',
  endpoint: normalizeR2Endpoint(),
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || 'placeholder',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export const downloadR2ObjectAsBuffer = async (bucket: string, key: string): Promise<Buffer> => {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key })
  const res = await r2.send(cmd)
  const chunks: Uint8Array[] = []
  for await (const chunk of res.Body as any) chunks.push(chunk)
  return Buffer.concat(chunks)
}
