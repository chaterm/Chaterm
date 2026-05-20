import { Client } from 'ssh2'
import type { ClientChannel } from 'ssh2'
import { getAlgorithmsByAssetType } from './algorithms'
const logger = createLogger('ssh')

// Authentication payload required to dial the jump host. The caller is responsible
// for resolving any keychain reference into the raw private key + passphrase before
// invoking this helper, so this module never touches the database.
export interface JumpHostAuth {
  host: string
  port: number
  username: string
  asset_type?: string
  password?: string
  privateKey?: string
  passphrase?: string
  // Forwarded as the readyTimeout for the inner ssh2 Client.
  readyTimeout?: number
}

export interface JumpHostTunnel {
  // Stream to feed into the target ssh2 Client as `connectConfig.sock`.
  sock: ClientChannel
  // The underlying jump-host connection. Caller must `end()` this when the
  // target connection closes/errors so the jump tunnel does not leak.
  jumpClient: Client
}

// Default 30 s — same readyTimeout as sshHandle's KeyboardInteractiveTimeout.
const DEFAULT_READY_TIMEOUT = 30 * 1000

// Establish an SSH tunnel through `auth` to (targetHost:targetPort) and return a
// stream suitable for use as `connectConfig.sock` of the target ssh2 Client.
//
// Equivalent semantics to OpenSSH's `ssh -J <auth> <target>`: ssh2 performs the
// target's SSH handshake on top of the channel returned by `forwardOut`.
export async function createJumpHostTunnel(auth: JumpHostAuth, targetHost: string, targetPort: number): Promise<JumpHostTunnel> {
  if (!auth.host || !auth.username) {
    throw new Error('Jump host configuration incomplete: host and username are required')
  }
  if (!auth.password && !auth.privateKey) {
    throw new Error('Jump host configuration incomplete: password or private key is required')
  }

  const jumpClient = new Client()
  const algorithms = getAlgorithmsByAssetType(auth.asset_type)

  const connectConfig: any = {
    host: auth.host,
    port: auth.port || 22,
    username: auth.username,
    keepaliveInterval: 10000,
    keepaliveCountMax: 3,
    readyTimeout: auth.readyTimeout || DEFAULT_READY_TIMEOUT,
    algorithms
  }
  if (auth.privateKey) {
    connectConfig.privateKey = auth.privateKey
    if (auth.passphrase) connectConfig.passphrase = auth.passphrase
  } else if (auth.password) {
    connectConfig.password = auth.password
  }

  return new Promise<JumpHostTunnel>((resolve, reject) => {
    let settled = false
    const settleReject = (err: Error) => {
      if (settled) return
      settled = true
      try {
        jumpClient.end()
      } catch {}
      reject(err)
    }

    jumpClient.on('error', (err) => {
      logger.error('Jump host connection error', { event: 'ssh.jump.error', error: err.message })
      settleReject(new Error(`Jump host connection failed: ${err.message}`))
    })

    jumpClient.on('close', () => {
      // Only relevant before the tunnel is established; after that, target conn owns it.
      settleReject(new Error('Jump host connection closed before tunnel was ready'))
    })

    jumpClient.on('ready', () => {
      logger.info('Jump host ready, opening forwardOut channel', { event: 'ssh.jump.ready' })
      jumpClient.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
        if (err) {
          settleReject(new Error(`Jump host forwardOut failed: ${err.message}`))
          return
        }
        if (settled) {
          // Lost the race against close/error; clean up the stream.
          try {
            stream.end()
          } catch {}
          return
        }
        settled = true
        resolve({ sock: stream, jumpClient })
      })
    })

    try {
      jumpClient.connect(connectConfig)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      settleReject(new Error(`Jump host configuration error: ${message}`))
    }
  })
}
