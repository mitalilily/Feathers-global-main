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
const clientKycVerificationSection = read(
  'courier-cart-client/src/components/user/profile/Kyc/KycVerificationSection.tsx',
)
const clientKycAdditionalInfoStep = read(
  'courier-cart-client/src/components/user/profile/Kyc/AdditionalInfoStep.tsx',
)
const clientKycDetailsCard = read(
  'courier-cart-client/src/components/user/profile/Kyc/KycDetailsCard.tsx',
)
const backendKycService = read('backend/src/models/services/kyc.service.ts')
const backendKycConstants = read('backend/src/utils/constants.ts')
const backendKycSchema = read('backend/src/models/schema/kyc.ts')
const backendApprovalService = read('backend/src/models/services/userService.ts')
const adminKycTab = read(
  'admin-dashboard/src/views/Dashboard/Profile/components/UserKycTab.jsx',
)

assertIncludesAll('Client required KYC docs', clientKycConstants, [
  'panCardUrl',
  'aadhaarUrl',
  'cancelledChequeUrl',
  'gstCertificateUrl',
  'companyAddressProofUrl',
  'businessPanUrl',
  'boardResolutionUrl',
  'partnershipDeedUrl',
  'llpAgreementUrl',
])

assertIncludesAll('Client KYC stepper includes camera step', clientKycVerificationSection, [
  'Camera Verification',
  'CameraVerificationStep',
  'selfieUrl',
  'selfieMime',
])

assertIncludesAll('Client KYC details card includes selfie docs', clientKycDetailsCard, [
  'selfieUrl',
  'Camera Verification',
  'MdCameraAlt',
])

assertIncludesAll('Client KYC additional step knows selfie fields', clientKycAdditionalInfoStep, [
  'selfieUrl',
  'selfieMime',
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
  'panCardMime',
  'aadhaarMime',
  'cancelledChequeMime',
  'boardResolutionMime',
  'partnershipDeedMime',
  'llpAgreementMime',
  'companyAddressProofMime',
  'businessPanMime',
  'gstCertificateMime',
  'selfieUrl',
  'selfieMime',
])

assertIncludesAll('Backend KYC schema columns', backendKycSchema, [
  'panCardUrl',
  'aadhaarUrl',
  'cancelledChequeUrl',
  'boardResolutionUrl',
  'partnershipDeedUrl',
  'llpAgreementUrl',
  'businessPanUrl',
  'companyAddressProofUrl',
  'gstCertificateUrl',
  'selfieUrl',
])

assertIncludesAll('Backend KYC constants', backendKycConstants, [
  'panCardUrl',
  'aadhaarUrl',
  'cancelledChequeUrl',
  'gstCertificateUrl',
  'companyAddressProofUrl',
  'businessPanUrl',
  'boardResolutionUrl',
  'partnershipDeedUrl',
  'llpAgreementUrl',
])

assertIncludesAll('Approval bookkeeping', backendApprovalService, [
  'approvedAt: approved ? new Date() : null',
  'profileComplete: true',
])

assertIncludesAll('Admin KYC viewer includes selfie docs', adminKycTab, [
  'selfieUrl',
  'Camera Verification Selfie',
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
