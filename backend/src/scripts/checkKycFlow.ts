import { readFileSync } from 'fs'
import path from 'path'

type CheckResult = {
  name: string
  ok: boolean
  details?: string
}

const backendRoot = path.resolve(__dirname, '../..')
const repoRoot = path.resolve(backendRoot, '..')

const read = (relativePath: string) =>
  readFileSync(path.resolve(repoRoot, relativePath), 'utf8')

const results: CheckResult[] = []

const assertIncludesAll = (name: string, haystack: string, needles: string[]) => {
  const missing = needles.filter((needle) => !haystack.includes(needle))
  results.push({
    name,
    ok: missing.length === 0,
    details: missing.length ? `Missing: ${missing.join(', ')}` : undefined,
  })
}

const assertExcludesAll = (name: string, haystack: string, needles: string[]) => {
  const present = needles.filter((needle) => haystack.includes(needle))
  results.push({
    name,
    ok: present.length === 0,
    details: present.length ? `Still present: ${present.join(', ')}` : undefined,
  })
}

const clientKycConstants = read('courier-cart-client/src/utils/constants.ts')
const backendKycService = read('backend/src/models/services/kyc.service.ts')
const backendKycSchema = read('backend/src/models/schema/kyc.ts')
const backendApprovalService = read('backend/src/models/services/userService.ts')
const cameraVerificationStep = read(
  'courier-cart-client/src/components/user/profile/Kyc/CameraVerificationStep.tsx',
)

assertIncludesAll('Client required KYC docs', clientKycConstants, [
  'panCardUrl',
  'aadhaarUrl',
  'cancelledChequeUrl',
  'selfieUrl',
  'gstCertificateUrl',
  'companyAddressProofUrl',
  'businessPanUrl',
  'boardResolutionUrl',
  'partnershipDeedUrl',
  'llpAgreementUrl',
])

assertIncludesAll('Backend KYC persistence fields', backendKycService, [
  'aadhaarUrl',
  'panCardUrl',
  'partnershipDeedUrl',
  'companyAddressProofUrl',
  'boardResolutionUrl',
  'cancelledChequeUrl',
  'businessPanUrl',
  'gstCertificateUrl',
  'llpAgreementUrl',
  'selfieUrl',
  'panCardMime',
  'aadhaarMime',
  'cancelledChequeMime',
  'boardResolutionMime',
  'partnershipDeedMime',
  'llpAgreementMime',
  'companyAddressProofMime',
  'businessPanMime',
  'gstCertificateMime',
  'selfieMime',
])

assertIncludesAll('Backend KYC schema columns', backendKycSchema, [
  'panCardUrl',
  'aadhaarUrl',
  'cancelledChequeUrl',
  'boardResolutionUrl',
  'partnershipDeedUrl',
  'llpAgreementUrl',
  'selfieUrl',
  'businessPanUrl',
  'companyAddressProofUrl',
  'gstCertificateUrl',
])

assertIncludesAll('Approval bookkeeping', backendApprovalService, [
  'approvedAt: approved ? new Date() : null',
  'profileComplete: true',
])

assertExcludesAll('Camera fallback removed', cameraVerificationStep, [
  'Selfie image fallback',
  'import FileUploader',
  'placeholder={uploaded.selfieUrl ? \'Selfie uploaded\' : undefined}',
])

const failed = results.filter((item) => !item.ok)

for (const result of results) {
  if (result.ok) {
    console.log(`✅ ${result.name}`)
  } else {
    console.error(`❌ ${result.name}${result.details ? ` - ${result.details}` : ''}`)
  }
}

if (failed.length) {
  console.error(`KYC flow check failed: ${failed.length} issue(s)`)
  process.exit(1)
}

console.log('KYC flow check passed.')
