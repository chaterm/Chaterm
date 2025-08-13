import { EnvelopeEncryptionService } from '../envelope_encryption/service'

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
  const meta: CombinedMeta = { v: 1, alg: r.algorithm || 'aes-256-gcm' }
  return buildCombinedString(r.encrypted, meta)
}

export async function decryptPayload(encString: string, service: EnvelopeEncryptionService): Promise<Record<string, any>> {
  const parsed = parseCombinedString(encString)
  if (!parsed) throw new Error('Invalid combined string')
  const algorithm = parsed.meta?.alg || 'aes-256-gcm'
  const plaintext = await service.decrypt({ encrypted: parsed.encrypted, algorithm } as any)
  return JSON.parse(plaintext)
}

export async function encryptFieldValue(value: any, service: EnvelopeEncryptionService): Promise<string> {
  return encryptPayload({ value }, service)
}

export async function decryptFieldValue(encString: string, service: EnvelopeEncryptionService): Promise<any> {
  const obj = await decryptPayload(encString, service)
  return obj?.value
}
