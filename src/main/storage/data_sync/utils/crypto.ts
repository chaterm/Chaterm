import crypto from 'crypto'

// AES-256-GCM object encryption with per-message random salt+iv
// Output: base64(JSON.stringify({v:1, alg:"aes-256-gcm", s, iv, ct, tag}))

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase, salt, 32)
}

export function encryptObject(obj: any, passphrase: string): string {
  const salt = crypto.randomBytes(16)
  const key = deriveKey(passphrase, salt)
  const iv = crypto.randomBytes(12) // GCM recommended 12 bytes
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload = {
    v: 1,
    alg: 'aes-256-gcm',
    s: salt.toString('base64'),
    iv: iv.toString('base64'),
    ct: ciphertext.toString('base64'),
    tag: tag.toString('base64')
  }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
}

export function decryptToObject(payloadB64: string, passphrase: string): any {
  const jsonStr = Buffer.from(payloadB64, 'base64').toString('utf8')
  const payload = JSON.parse(jsonStr)
  if (!payload || payload.alg !== 'aes-256-gcm') {
    throw new Error('Unsupported encrypted payload')
  }
  const salt = Buffer.from(payload.s, 'base64')
  const iv = Buffer.from(payload.iv, 'base64')
  const ct = Buffer.from(payload.ct, 'base64')
  const tag = Buffer.from(payload.tag, 'base64')
  const key = deriveKey(passphrase, salt)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()])
  return JSON.parse(plaintext.toString('utf8'))
}
