import { describe, it, expect, vi } from 'vitest'

vi.mock('better-sqlite3', () => ({
  default: class {}
}))

describe('keychain select logic', () => {
  it('returns only key credentials for keychain select', async () => {
    const { getKeyChainSelectLogic } = await import('../keychains')
    const all = vi.fn().mockReturnValue([{ key_chain_id: 1, chain_name: 'deploy-key' }])
    const prepare = vi.fn().mockReturnValue({ all })

    const result = getKeyChainSelectLogic({ prepare } as any)

    expect(prepare.mock.calls[0][0]).toContain('chain_type != ?')
    expect(all).toHaveBeenCalledWith('PASSWORD')
    expect(result.data.keyChain).toEqual([{ key: 1, label: 'deploy-key' }])
  })

  it('returns password credential username from public_key alias', async () => {
    const { getKeyChainInfoLogic } = await import('../keychains')
    const get = vi.fn().mockReturnValue({
      key_chain_id: 2,
      chain_name: 'ubuntu',
      private_key: '',
      public_key: 'ubuntu-user',
      chain_type: 'PASSWORD',
      passphrase: 'secret'
    })
    const prepare = vi.fn().mockReturnValue({ get })

    const result = getKeyChainInfoLogic({ prepare } as any, 2)

    expect(result.public_key).toBe('ubuntu-user')
    expect(result.passphrase).toBe('secret')
    expect(result.chain_type).toBe('PASSWORD')
  })

  it('returns only password credentials for password select', async () => {
    const { getPasswordChainSelectLogic } = await import('../keychains')
    const all = vi.fn().mockReturnValue([{ key_chain_id: 2, chain_name: 'shared-root' }])
    const prepare = vi.fn().mockReturnValue({ all })

    const result = getPasswordChainSelectLogic({ prepare } as any)

    expect(prepare.mock.calls[0][0]).toContain('chain_type = ?')
    expect(all).toHaveBeenCalledWith('PASSWORD')
    expect(result.data.passwordChain).toEqual([{ key: 2, label: 'shared-root' }])
  })
})
