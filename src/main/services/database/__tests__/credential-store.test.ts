import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }))
}))

const { createCredentialStore } = await import('../credential-store')

describe('credential-store', () => {
  let workDir: string
  let keyPath: string

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'cred-store-'))
    keyPath = join(workDir, 'chaterm-db.key')
  })

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  describe('local-key fallback', () => {
    it('round-trips through the local-key path when safeStorage is not available', async () => {
      const store = createCredentialStore({
        safeStorage: null,
        localKeyPath: keyPath
      })
      expect(store.isSafeStorageAvailable()).toBe(false)
      const cipher = await store.encryptSecret('s3cret')
      expect(cipher.startsWith('lk1:')).toBe(true)
      expect(cipher).not.toContain('s3cret')
      const plain = await store.decryptSecret(cipher)
      expect(plain).toBe('s3cret')
    })

    it('generates different ciphertext for the same plaintext', async () => {
      const store = createCredentialStore({
        safeStorage: null,
        localKeyPath: keyPath
      })
      const a = await store.encryptSecret('same')
      const b = await store.encryptSecret('same')
      expect(a).not.toBe(b)
      expect(await store.decryptSecret(a)).toBe('same')
      expect(await store.decryptSecret(b)).toBe('same')
    })

    it('detects tampered ciphertext', async () => {
      const store = createCredentialStore({
        safeStorage: null,
        localKeyPath: keyPath
      })
      const cipher = await store.encryptSecret('p@ss')
      const [prefix, body] = cipher.split(':', 2)
      const parts = body.split('.')
      parts[1] = Buffer.from('tampered').toString('base64')
      const tampered = `${prefix}:${parts.join('.')}`
      await expect(store.decryptSecret(tampered)).rejects.toThrow()
    })
  })

  describe('safeStorage path', () => {
    it('uses the ss1 prefix when safeStorage is available', async () => {
      const fakeSafeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: (p: string) => Buffer.from(`ENC(${p})`),
        decryptString: (buf: Buffer) => buf.toString().replace(/^ENC\((.*)\)$/, '$1')
      }
      const store = createCredentialStore({
        safeStorage: fakeSafeStorage,
        localKeyPath: keyPath
      })
      expect(store.isSafeStorageAvailable()).toBe(true)
      const cipher = await store.encryptSecret('tok')
      expect(cipher.startsWith('ss1:')).toBe(true)
      expect(await store.decryptSecret(cipher)).toBe('tok')
    })

    it('can still decrypt local-key ciphertext even when safeStorage is available', async () => {
      const storeA = createCredentialStore({ safeStorage: null, localKeyPath: keyPath })
      const lkCipher = await storeA.encryptSecret('legacy')

      const fakeSafeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: (p: string) => Buffer.from(p),
        decryptString: (buf: Buffer) => buf.toString()
      }
      const storeB = createCredentialStore({ safeStorage: fakeSafeStorage, localKeyPath: keyPath })
      expect(await storeB.decryptSecret(lkCipher)).toBe('legacy')
    })
  })

  it('rejects malformed ciphertext', async () => {
    const store = createCredentialStore({ safeStorage: null, localKeyPath: keyPath })
    await expect(store.decryptSecret('')).rejects.toThrow()
    await expect(store.decryptSecret('unknown-prefix')).rejects.toThrow()
  })

  it('treats isSafeStorageAvailable() exceptions as unavailable', () => {
    const throwingSafeStorage = {
      isEncryptionAvailable: () => {
        throw new Error('broken')
      },
      encryptString: (_: string) => Buffer.alloc(0),
      decryptString: (_: Buffer) => ''
    }
    const store = createCredentialStore({ safeStorage: throwingSafeStorage, localKeyPath: keyPath })
    expect(store.isSafeStorageAvailable()).toBe(false)
  })
})
