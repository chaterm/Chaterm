import { EnvelopeEncryptionService } from '../envelope_encryption/service'

// 这是信封加密的核心：meta 就是加密的数据密钥本身
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

  // 修复：获取加密的数据密钥，这是信封加密的核心
  const encryptedDataKey = service.clientCrypto?.getEncryptedDataKey()
  if (!encryptedDataKey) {
    throw new Error('无法获取加密的数据密钥')
  }

  // 信封加密的正确实现：直接将加密的数据密钥作为 meta 部分
  return buildCombinedString(r.encrypted, encryptedDataKey)
}

export async function decryptPayload(encString: string, service: EnvelopeEncryptionService): Promise<Record<string, any>> {
  console.log('🔍 ===== 开始信封解密流程 =====')

  const parsed = parseCombinedString(encString)
  if (!parsed) {
    throw new Error('Invalid combined string')
  }
  // 步骤2: 从 meta 获取加密的数据密钥
  const encryptedDataKey = parsed.meta
  if (!encryptedDataKey || typeof encryptedDataKey !== 'string') {
    throw new Error('缺少有效的加密数据密钥')
  }

  // 步骤3: 构造解密请求，让 ClientSideCrypto 通过 KMS 解密数据密钥
  const userId = service.clientCrypto?.getUserId()
  if (!userId) {
    throw new Error('无法获取用户ID')
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
