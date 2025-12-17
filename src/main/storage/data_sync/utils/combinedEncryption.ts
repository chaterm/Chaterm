import { EnvelopeEncryptionService } from '../envelope_encryption/service'

// This is the core of envelope encryption: meta is the encrypted data key itself
export interface CombinedMeta {
  v: number
  alg: string
}

export function buildCombinedString(encryptedBase64: string, meta: CombinedMeta): string {
  const metaB64 = Buffer.from(JSON.stringify(meta), 'utf8').toString('base64')
  return `ENC1|${encryptedBase64}|${metaB64}`
}

export function parseCombinedString(encString: string): { encrypted: string; meta?: any } | null {
  if (typeof encString !== 'string') return null
  if (!encString.startsWith('ENC1|')) return null
  const parts = encString.split('|')
  if (parts.length < 3) return null
  const encrypted = parts[1]
  const metaB64 = parts[2]
  let meta: any = undefined
  try {
    const json = Buffer.from(metaB64, 'base64').toString('utf8')
    meta = JSON.parse(json)
  } catch {}
  return { encrypted, meta }
}

export async function encryptPayload(payload: Record<string, any>, service: EnvelopeEncryptionService): Promise<string> {
  const plaintext = JSON.stringify(payload)
  const r = await service.encrypt(plaintext)

  // Fix: Get the encrypted data key, which is the core of envelope encryption
  const encryptedDataKey = service.clientCrypto?.getEncryptedDataKey()
  if (!encryptedDataKey) {
    throw new Error('Failed to get encrypted data key')
  }

  // Correct implementation of envelope encryption: directly use the encrypted data key as the meta part
  return buildCombinedString(r.encrypted, encryptedDataKey)
}

export async function decryptPayload(encString: string, service: EnvelopeEncryptionService): Promise<Record<string, any>> {
  const parsed = parseCombinedString(encString)
  if (!parsed) {
    throw new Error('Invalid combined string')
  }
  // Step 2: Get the encrypted data key from meta
  const encryptedDataKey = parsed.meta
  if (!encryptedDataKey || typeof encryptedDataKey !== 'string') {
    throw new Error('Missing valid encrypted data key')
  }

  // Step 3: Construct decryption request to let ClientSideCrypto decrypt the data key through KMS
  const userId = service.clientCrypto?.getUserId()
  if (!userId) {
    throw new Error('Failed to get user ID')
  }

  const sessionId = userId.slice(-2).padStart(2, '0')

  const encryptedData = {
    encrypted: parsed.encrypted,
    algorithm: 'aws-encryption-sdk',
    encryptedDataKey: encryptedDataKey,
    encryptionContext: {
      userId: userId,
      sessionId: sessionId,
      purpose: 'client-side-encryption'
    }
  }

  const plaintext = await service.decrypt(encryptedData as any)

  const result = JSON.parse(plaintext)
  return result
}

export async function encryptFieldValue(value: any, service: EnvelopeEncryptionService): Promise<string> {
  return encryptPayload({ value }, service)
}

export async function decryptFieldValue(encString: string, service: EnvelopeEncryptionService): Promise<any> {
  const obj = await decryptPayload(encString, service)
  return obj?.value
}
