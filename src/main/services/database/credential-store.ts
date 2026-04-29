//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'

/**
 * CredentialStore
 *
 * V1 credential protection for database asset passwords. The main goal is that
 * no plaintext password is written to SQLite or read back into the renderer.
 *
 * Strategy:
 * - Prefer Electron `safeStorage` (backed by the OS keychain/credential vault)
 *   when `isEncryptionAvailable()` returns true.
 * - Otherwise fall back to AES-256-GCM with a local master key stored in
 *   userData. This is not as strong as the OS keychain but it prevents
 *   plaintext-at-rest in the SQLite file and keeps the V1 interface stable so
 *   we can swap to a stronger backend later without touching callers.
 *
 * All ciphertext values are stored as strings with a prefix tag so future
 * migrations can tell the encoding apart:
 *   - `ss1:<base64>`  safeStorage output
 *   - `lk1:<ivB64>.<ctB64>.<tagB64>` local AES-GCM
 */

export interface CredentialStore {
  encryptSecret(plain: string): Promise<string>
  decryptSecret(cipher: string): Promise<string>
  isSafeStorageAvailable(): boolean
}

const SAFE_STORAGE_PREFIX = 'ss1:'
const LOCAL_KEY_PREFIX = 'lk1:'

type SafeStorageLike = {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(cipher: Buffer): string
}

export interface CredentialStoreOptions {
  /**
   * Injected to make the module unit-testable without booting Electron.
   * Defaults to `require('electron').safeStorage` at call time.
   */
  safeStorage?: SafeStorageLike | null
  /**
   * Absolute path of the master key file used by the local-key fallback.
   */
  localKeyPath: string
}

function ensureDir(path: string): void {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function readOrCreateLocalKey(path: string): Buffer {
  if (existsSync(path)) {
    const raw = readFileSync(path)
    if (raw.length === 32) return raw
  }
  ensureDir(path)
  const key = randomBytes(32)
  writeFileSync(path, key, { mode: 0o600 })
  return key
}

function encryptWithLocalKey(key: Buffer, plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${LOCAL_KEY_PREFIX}${iv.toString('base64')}.${encrypted.toString('base64')}.${tag.toString('base64')}`
}

function decryptWithLocalKey(key: Buffer, cipher: string): string {
  const body = cipher.slice(LOCAL_KEY_PREFIX.length)
  const [ivB64, ctB64, tagB64] = body.split('.')
  if (!ivB64 || !ctB64 || !tagB64) throw new Error('malformed local-key ciphertext')
  const iv = Buffer.from(ivB64, 'base64')
  const ct = Buffer.from(ctB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(ct), decipher.final()])
  return plain.toString('utf8')
}

function resolveSafeStorage(): SafeStorageLike | null {
  try {
    const mod = require('electron')
    return (mod?.safeStorage as SafeStorageLike) ?? null
  } catch {
    return null
  }
}

class CredentialStoreImpl implements CredentialStore {
  private readonly safeStorage: SafeStorageLike | null
  private readonly localKeyPath: string
  private cachedLocalKey: Buffer | null = null

  constructor(opts: CredentialStoreOptions) {
    this.safeStorage = opts.safeStorage ?? resolveSafeStorage()
    this.localKeyPath = opts.localKeyPath
  }

  isSafeStorageAvailable(): boolean {
    try {
      return !!this.safeStorage && this.safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  async encryptSecret(plain: string): Promise<string> {
    if (typeof plain !== 'string') throw new Error('plain must be a string')
    if (this.isSafeStorageAvailable()) {
      const buf = this.safeStorage!.encryptString(plain)
      return `${SAFE_STORAGE_PREFIX}${buf.toString('base64')}`
    }
    const key = this.getLocalKey()
    return encryptWithLocalKey(key, plain)
  }

  async decryptSecret(cipher: string): Promise<string> {
    if (typeof cipher !== 'string' || cipher.length === 0) {
      throw new Error('cipher must be a non-empty string')
    }
    if (cipher.startsWith(SAFE_STORAGE_PREFIX)) {
      if (!this.safeStorage) throw new Error('safeStorage ciphertext but safeStorage unavailable')
      const buf = Buffer.from(cipher.slice(SAFE_STORAGE_PREFIX.length), 'base64')
      return this.safeStorage.decryptString(buf)
    }
    if (cipher.startsWith(LOCAL_KEY_PREFIX)) {
      const key = this.getLocalKey()
      return decryptWithLocalKey(key, cipher)
    }
    throw new Error('unrecognized ciphertext format')
  }

  private getLocalKey(): Buffer {
    if (!this.cachedLocalKey) {
      this.cachedLocalKey = readOrCreateLocalKey(this.localKeyPath)
    }
    return this.cachedLocalKey
  }
}

export function createCredentialStore(opts: CredentialStoreOptions): CredentialStore {
  return new CredentialStoreImpl(opts)
}

let singleton: CredentialStore | null = null

/**
 * Lazy singleton. Resolves userData path on first call so tests that never
 * touch this path are not forced to boot the full Electron stack.
 */
export function getCredentialStore(): CredentialStore {
  if (singleton) return singleton
  // Resolve the userData path lazily from Electron. This module is only
  // reachable from the main process runtime path.
  const electron = require('electron')
  const app = electron.app
  const userData = app.getPath('userData')
  singleton = createCredentialStore({
    localKeyPath: join(userData, 'chaterm-db-credential.key')
  })
  return singleton
}

/**
 * Test-only helper to inject a store for the singleton.
 */
export function __setCredentialStoreForTests(store: CredentialStore | null): void {
  singleton = store
}
