import type { Algorithms } from 'ssh2'

// Legacy algorithm support for older SSH servers
// Using 'append' to keep default secure algorithms with higher priority
// Note: ssh2 runtime supports partial Record with only 'append', but TypeScript types require all keys
export const LEGACY_ALGORITHMS = {
  kex: {
    append: ['diffie-hellman-group14-sha1', 'diffie-hellman-group-exchange-sha1', 'diffie-hellman-group1-sha1']
  },
  serverHostKey: {
    append: ['ssh-rsa', 'ssh-dss']
  }
} as Algorithms

// Switch-compatible algorithms: prefer older, widely supported suites
export const SWITCH_COMPAT_ALGORITHMS: Algorithms = {
  // Force legacy KEX to avoid ECDH signature issues on some switches
  kex: ['diffie-hellman-group14-sha1', 'diffie-hellman-group1-sha1', 'diffie-hellman-group-exchange-sha1'],
  // Prefer RSA/DSA host keys to match legacy SSH implementations
  serverHostKey: ['ssh-rsa', 'ssh-dss'],
  cipher: ['aes128-ctr', 'aes256-ctr', 'aes192-ctr', 'aes128-cbc', 'aes256-cbc', '3des-cbc'],
  hmac: ['hmac-sha1', 'hmac-sha1-96', 'hmac-md5', 'hmac-md5-96', 'hmac-sha2-256', 'hmac-sha2-512'],
  compress: ['none', 'zlib']
}

export const isSwitchAssetType = (assetType?: string): boolean => assetType?.startsWith('person-switch-') ?? false

export const getAlgorithmsByAssetType = (assetType?: string): Algorithms => {
  if (isSwitchAssetType(assetType)) {
    return SWITCH_COMPAT_ALGORITHMS
  }
  return LEGACY_ALGORITHMS
}
