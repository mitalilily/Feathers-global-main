import { eq } from 'drizzle-orm'
import { CompanyType, KycDetails } from '../../types/users.types'
import { requiredKycDetails, requiredKycFieldMap } from '../../utils/constants'
import { HttpError } from '../../utils/classes'
import { db } from '../client'
import { kyc } from '../schema/kyc'
import { userProfiles } from '../schema/userProfile'
import { ensureKycSchemaCompatibility } from './kycSchemaCompatibility.service'

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/

const isValidStructure = (structure?: KycDetails['structure'] | null): structure is KycDetails['structure'] =>
  Boolean(structure && structure in requiredKycDetails)

const syncDomesticKycStatus = async (
  userId: string,
  status: KycDetails['status'],
  updatedAt: Date,
) => {
  try {
    await db
      .update(userProfiles)
      .set({
        domesticKyc: {
          status,
          updatedAt,
        },
      })
      .where(eq(userProfiles.userId, userId))
      .execute()
  } catch (error) {
    console.error('Failed to sync domestic KYC status:', error)
  }
}

export const UpdateKYCDetails = async (
  userId: string,
  details: KycDetails,
  options: { draft?: boolean } = {},
) => {
  await ensureKycSchemaCompatibility()
  const isDraft = Boolean(options.draft)
  const now = new Date()

  const normalizedDetails: KycDetails = {
    ...details,
    gstin: details.gstin?.trim().toUpperCase(),
    panNumber: details.panNumber?.trim().toUpperCase(),
  }

  const [savedKyc] = await db.transaction(async (tx) => {
    const [existingKyc] = await tx
      .select()
      .from(kyc)
      .where(eq(kyc.userId, userId))
      .limit(1)
      .execute()

    const resolvedStructure = normalizedDetails.structure ?? existingKyc?.structure
    const resolvedCompanyType = normalizedDetails.companyType ?? existingKyc?.companyType

    if (!isValidStructure(resolvedStructure)) {
      throw new HttpError(400, 'Invalid or missing business structure')
    }

    if (normalizedDetails.panNumber && !PAN_REGEX.test(normalizedDetails.panNumber)) {
      throw new HttpError(400, 'Invalid PAN number format. Use a value like ABCDE1234F')
    }

    if (normalizedDetails.gstin && !GSTIN_REGEX.test(normalizedDetails.gstin)) {
      throw new HttpError(400, 'Invalid GSTIN format. Use a value like 27ABCDE1234F1Z5')
    }

    if (
      normalizedDetails.gstin &&
      normalizedDetails.panNumber &&
      normalizedDetails.gstin.substring(2, 12) !== normalizedDetails.panNumber
    ) {
      throw new HttpError(400, 'GSTIN must contain the same PAN number')
    }

    const requiredFieldsMap =
      resolvedStructure === 'company' && resolvedCompanyType
        ? (
            requiredKycFieldMap[resolvedStructure] as Record<
              CompanyType,
              Partial<Record<keyof KycDetails, boolean>>
            >
          )[resolvedCompanyType] ?? {}
        : (requiredKycFieldMap[resolvedStructure] as Partial<Record<keyof KycDetails, boolean>>) ??
          {}

    const missing = Object.entries(requiredFieldsMap)
      .filter(([field, isRequired]) => isRequired && !normalizedDetails[field as keyof KycDetails])
      .map(([field]) => field)

    if (!isDraft && missing.length) {
      throw new HttpError(
        400,
        `Missing required fields for ${resolvedStructure}: ${missing.join(', ')}`,
      )
    }

    const kycPayload: any = {
      structure: resolvedStructure,
      companyType: resolvedStructure === 'company' ? resolvedCompanyType ?? null : null,
      updatedAt: now,
      status: 'verification_in_progress',
    }

    const docFields: (keyof KycDetails)[] = [
      'aadhaarUrl',
      'panCardUrl',
      'partnershipDeedUrl',
      'companyAddressProofUrl',
      'boardResolutionUrl',
      'cancelledChequeUrl',
      'businessPanUrl',
      'gstCertificateUrl',
      'cin',
      'gstin',
      'panNumber',
      'llpAgreementUrl',
    ]

    const fieldToStatusMap: Partial<Record<keyof KycDetails, keyof KycDetails>> = {
      aadhaarUrl: 'aadhaarStatus',
      cancelledChequeUrl: 'cancelledChequeStatus',
      businessPanUrl: 'businessPanStatus',
      llpAgreementUrl: 'llpAgreementStatus',
      companyAddressProofUrl: 'companyAddressProofStatus',
      gstCertificateUrl: 'gstCertificateStatus',
      panCardUrl: 'panCardStatus',
      partnershipDeedUrl: 'partnershipDeedStatus',
      boardResolutionUrl: 'boardResolutionStatus',
      cin: 'cinStatus',
    }

    const mimeFieldsMap: Partial<Record<keyof KycDetails, keyof KycDetails>> = {
      aadhaarUrl: 'aadhaarMime',
      panCardUrl: 'panCardMime',
      llpAgreementUrl: 'llpAgreementMime',
      companyAddressProofUrl: 'companyAddressProofMime',
      cancelledChequeUrl: 'cancelledChequeMime',
      boardResolutionUrl: 'boardResolutionMime',
      partnershipDeedUrl: 'partnershipDeedMime',
      businessPanUrl: 'businessPanMime',
      gstCertificateUrl: 'gstCertificateMime',
    }

    for (const field of docFields) {
      const newVal = normalizedDetails[field] as any
      const oldVal = existingKyc?.[field]

      if (newVal && newVal !== oldVal) {
        kycPayload[field] = newVal

        const mimeField = mimeFieldsMap[field]
        if (mimeField) {
          const mime = (normalizedDetails as any)[mimeField]
          if (mime) {
            kycPayload[mimeField] = mime
          }
        }

        const statusField = fieldToStatusMap[field]
        if (statusField) {
          kycPayload[statusField] = 'pending' as any
        }
      }
    }

    let result

    if (existingKyc) {
      ;[result] = await tx
        .update(kyc)
        .set(kycPayload)
        .where(eq(kyc.userId, userId))
        .returning()
    } else {
      ;[result] = await tx
        .insert(kyc)
        .values({
          ...kycPayload,
          userId,
          createdAt: now,
        } as KycDetails)
        .returning()
    }

    return [result]
  })

  await syncDomesticKycStatus(userId, 'verification_in_progress', now)

  return savedKyc
}

type RequiredKycFields = (keyof KycDetails)[] | Record<CompanyType, (keyof KycDetails)[]>

const isCompanyRequiredFields = (
  value: RequiredKycFields,
): value is Record<CompanyType, (keyof KycDetails)[]> => !Array.isArray(value)

const resolveRequiredFields = (
  structure?: KycDetails['structure'] | null,
  companyType?: string | null,
): (keyof KycDetails)[] => {
  if (!isValidStructure(structure)) return []
  const required = requiredKycDetails[structure] as RequiredKycFields
  if (!isCompanyRequiredFields(required)) return required
  const companyKey = companyType && companyType in required ? (companyType as CompanyType) : undefined
  if (companyKey) return required[companyKey] ?? []
  return []
}

export async function getUserKycService(userId: string) {
  await ensureKycSchemaCompatibility()

  const w = await db?.query.kyc.findFirst({
    where: eq(kyc.userId, userId),
  })
  if (!w) throw new HttpError(200, 'KYC not found')
  return w
}

export const updateKycStatus = async (
  userId: string,
  status: 'pending' | 'verified' | 'rejected' | 'verification_in_progress',
   reason?: string,
) => {
  await ensureKycSchemaCompatibility()

  const now = new Date()
  const payload: Partial<KycDetails> = { status, updatedAt: now }

  if (status === 'verified') {
    const docFields = [
      'aadhaar',
      'panCard',
      'partnershipDeed',
      'companyAddressProof',
      'boardResolution',
      'cancelledCheque',
      'businessPan',
      'gstCertificate',
      'llpAgreement',
      'cin',
    ]

    docFields.forEach((field) => {
      const statusField = `${field}Status` as keyof KycDetails
      const reasonField = `${field}RejectionReason` as keyof KycDetails
      payload[statusField] = 'verified' as any
      payload[reasonField] = undefined
    })
  }

  if (reason && (status === 'rejected' || status === 'verification_in_progress')) {
    payload.rejectionReason = reason
  }

  await db.update(kyc).set(payload).where(eq(kyc.userId, userId)).execute()
  await syncDomesticKycStatus(userId, status, now)
}

export const updateDocumentStatus = async (
  userId: string,
  key: string,
  status: string,
  reason?: string,
) => {
  await ensureKycSchemaCompatibility()

  const allowedStatusFields: Partial<Record<string, keyof KycDetails>> = {
    aadhaarUrl: 'aadhaarStatus',
    panCardUrl: 'panCardStatus',
    partnershipDeedUrl: 'partnershipDeedStatus',
    companyAddressProofUrl: 'companyAddressProofStatus',
    boardResolutionUrl: 'boardResolutionStatus',
    cancelledChequeUrl: 'cancelledChequeStatus',
    businessPanUrl: 'businessPanStatus',
    gstCertificateUrl: 'gstCertificateStatus',
    llpAgreementUrl: 'llpAgreementStatus',
    cin: 'cinStatus',
  }
  const statusField = allowedStatusFields[key]

  if (!statusField) {
    throw new HttpError(400, 'Unsupported KYC document key')
  }

  const now = new Date()
  const payload: any = { [statusField]: status, updatedAt: now }

  if (reason) {
    const reasonField =
      key === 'cin' ? 'cinRejectionReason' : `${key.replace('Url', '')}RejectionReason`
    payload[reasonField] = reason
  }

  const getStatusField = (field: keyof KycDetails): keyof KycDetails | null => {
    if (typeof field !== 'string') return null
    if (field.endsWith('Url')) {
      return `${field.replace('Url', '')}Status` as keyof KycDetails
    }
    if (field === 'cin') return 'cinStatus'
    return null
  }

  let shouldPromoteToVerified = false

  await db.transaction(async (tx) => {
    await tx.update(kyc).set(payload).where(eq(kyc.userId, userId)).execute()

    const [updatedKyc] = await tx
      .select()
      .from(kyc)
      .where(eq(kyc.userId, userId))
      .limit(1)
      .execute()

    if (!updatedKyc) return

    const requiredFields = resolveRequiredFields(updatedKyc.structure, updatedKyc.companyType)
    const requiredStatusFields = requiredFields
      .map((field) => getStatusField(field))
      .filter(Boolean) as (keyof KycDetails)[]

    if (!requiredStatusFields.length) return

    shouldPromoteToVerified = requiredStatusFields.every((field) => updatedKyc[field] === 'verified')
    if (shouldPromoteToVerified && updatedKyc.status !== 'verified') {
      await tx
        .update(kyc)
        .set({ status: 'verified', updatedAt: now })
        .where(eq(kyc.userId, userId))
        .execute()
    }
  })

  if (shouldPromoteToVerified) {
    await syncDomesticKycStatus(userId, 'verified', now)
  }
}
