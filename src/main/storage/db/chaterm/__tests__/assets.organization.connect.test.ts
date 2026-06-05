import { describe, it, expect, vi } from 'vitest'

vi.mock('better-sqlite3', () => ({
  default: class {}
}))

type Statement<T = unknown> = {
  get: (...args: unknown[]) => T
  run: (...args: unknown[]) => { changes: number }
  all: (...args: unknown[]) => T[]
}

const noopRun = () => ({ changes: 0 })
const noopAll = <T>() => [] as T[]

describe('connectAssetInfoLogic', () => {
  it('resolves password from password credential auth', async () => {
    const { connectAssetInfoLogic } = await import('../assets.organization')

    const db = {
      prepare(sql: string): Statement {
        if (sql.includes('FROM t_assets')) {
          return {
            get: () => ({
              uuid: 'asset-1',
              asset_ip: '10.0.0.1',
              auth_type: 'passwordCredential',
              port: 22,
              username: 'stale-user',
              password: '',
              key_chain_id: 9,
              need_proxy: 0,
              proxy_name: '',
              jump_host_uuid: null
            }),
            run: noopRun,
            all: noopAll
          }
        }

        if (sql.includes('SELECT chain_type, passphrase, chain_public_key as username')) {
          return {
            get: () => ({ chain_type: 'PASSWORD', passphrase: 'shared-secret', username: 'credential-user' }),
            run: noopRun,
            all: noopAll
          }
        }

        throw new Error(`Unexpected SQL: ${sql}`)
      }
    }

    const result = connectAssetInfoLogic(db as any, 'asset-1')

    expect(result.password).toBe('shared-secret')
    expect(result.username).toBe('credential-user')
    expect(result.auth_type).toBe('passwordCredential')
    expect(result.host).toBe('10.0.0.1')
  })

  it('resolves private key from keychain for keyBased auth', async () => {
    const { connectAssetInfoLogic } = await import('../assets.organization')

    const db = {
      prepare(sql: string): Statement {
        if (sql.includes('FROM t_assets')) {
          return {
            get: () => ({
              uuid: 'asset-2',
              asset_ip: '10.0.0.2',
              auth_type: 'keyBased',
              port: 22,
              username: 'deploy',
              password: '',
              key_chain_id: 3,
              need_proxy: 0,
              proxy_name: '',
              jump_host_uuid: null
            }),
            run: noopRun,
            all: noopAll
          }
        }

        if (sql.includes('chain_private_key as privateKey')) {
          return {
            get: () => ({ privateKey: '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----', passphrase: 'key-pass' }),
            run: noopRun,
            all: noopAll
          }
        }

        throw new Error(`Unexpected SQL: ${sql}`)
      }
    }

    const result = connectAssetInfoLogic(db as any, 'asset-2')

    expect(result.privateKey).toContain('BEGIN PRIVATE KEY')
    expect(result.passphrase).toBe('key-pass')
    expect(result.auth_type).toBe('keyBased')
  })

  it('ignores key_chain_id 0 for password credential auth', async () => {
    const { connectAssetInfoLogic } = await import('../assets.organization')

    const db = {
      prepare(sql: string): Statement {
        if (sql.includes('FROM t_assets')) {
          return {
            get: () => ({
              uuid: 'asset-3',
              asset_ip: '10.0.0.3',
              auth_type: 'passwordCredential',
              port: 22,
              username: 'root',
              password: '',
              key_chain_id: 0,
              need_proxy: 0,
              proxy_name: '',
              jump_host_uuid: null
            }),
            run: noopRun,
            all: noopAll
          }
        }

        throw new Error(`Unexpected SQL: ${sql}`)
      }
    }

    const result = connectAssetInfoLogic(db as any, 'asset-3')

    expect(result.password).toBe('')
    expect(result.key_chain_id).toBe(0)
  })
})
