/**
 * Simplified client-side configuration
 */

interface EncryptionConfig {
  algorithm: string
  keyLength: number
  ivLength: number
  tagLength: number
}

interface StorageConfig {
  keyPrefix: string
  sessionPrefix: string
}

interface Config {
  serverUrl?: string
  encryption: EncryptionConfig
  storage: StorageConfig
  timeout: {
    apiRequest: number
    keyExpiry: number
  }
  security: {
    enforceHttps: boolean
  }
}

const config: Config = {
  // Default configuration in main process, prioritize environment variables, otherwise use development environment defaults
  serverUrl: 'http://demo.chaterm.ai/v1',
  encryption: {
    algorithm: 'aes-256-gcm',
    keyLength: 32, // 256 bits
    ivLength: 16, // 128 bits
    tagLength: 16 // 128 bits
  },

  storage: {
    keyPrefix: 'kms_encrypted_key_',
    sessionPrefix: 'kms_session_'
  },

  timeout: {
    apiRequest: 10000, // API request timeout 10 seconds
    keyExpiry: 24 * 60 * 60 * 1000 // Key expiry time 24 hours
  },

  security: {
    enforceHttps: process.env.NODE_ENV === 'production'
  }
}

export default config
export type { Config, EncryptionConfig, StorageConfig }
