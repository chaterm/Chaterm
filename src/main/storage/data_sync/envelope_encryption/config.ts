/**
 * 简化的客户端配置
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
  // 主进程中的默认配置，优先使用环境变量，否则使用开发环境默认值
  serverUrl:
    process.env.RENDERER_KMS_SERVER_URL ||
    process.env.KMS_SERVER_URL ||
    (process.env.NODE_ENV === 'production' ? 'http://demo.chaterm.ai/v1' : 'http://localhost:3000'),

  encryption: {
    algorithm: 'aes-256-gcm',
    keyLength: 32, // 256位
    ivLength: 16, // 128位
    tagLength: 16 // 128位
  },

  storage: {
    keyPrefix: 'kms_encrypted_key_',
    sessionPrefix: 'kms_session_'
  },

  timeout: {
    apiRequest: 10000, // API请求超时 10秒
    keyExpiry: 24 * 60 * 60 * 1000 // 密钥过期时间 24小时
  },

  security: {
    enforceHttps: process.env.NODE_ENV === 'production'
  }
}

export default config
export type { Config, EncryptionConfig, StorageConfig }
