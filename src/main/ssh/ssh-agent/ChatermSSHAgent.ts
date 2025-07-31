import { BaseAgent, utils } from 'ssh2'
import { createServer, Server, Socket } from 'net'
import { EventEmitter } from 'events'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { Duplex } from 'stream'

// SSH Agent Protocol
const SSH_AGENT_FAILURE = 5
const SSH_AGENTC_REQUEST_IDENTITIES = 11
const SSH_AGENTC_REQUEST_IDENTITIES_OLD = 1
const SSH_AGENT_IDENTITIES_ANSWER = 12
const SSH_AGENTC_SIGN_REQUEST = 13
const SSH_AGENT_SIGN_RESPONSE = 14
const SSH_AGENTC_ADD_SMARTCARD_KEY = 27

// SSH key type
enum SSHKeyType {
  RSA = 'ssh-rsa',
  ED25519 = 'ssh-ed25519',
  ECDSA_P256 = 'ecdsa-sha2-nistp256',
  ECDSA_P384 = 'ecdsa-sha2-nistp384',
  ECDSA_P521 = 'ecdsa-sha2-nistp521'
}

interface SSHAgentKey {
  id: string
  privateKey: any
  publicKey: Buffer
  comment: string
  keyType: SSHKeyType
  fingerprint: string
  addedAt: Date
}

// Define the SSH Agent class, inheriting the BaseAgent of ssh2
export class SSHAgent extends BaseAgent {
  private eventEmitter = new EventEmitter()
  private server: Server | null = null
  private readonly socketPath: string
  private keys: Map<string, SSHAgentKey> = new Map()
  private isRunning: boolean = false
  private clientConnections: Set<Socket> = new Set()

  constructor(socketPath?: string) {
    super()
    this.socketPath = socketPath || this.generateSocketPath()
  }

  // EventEmitter
  on(event: string, listener: (...args: any[]) => void): this {
    this.eventEmitter.on(event, listener)
    return this
  }

  emit(event: string, ...args: any[]): boolean {
    return this.eventEmitter.emit(event, ...args)
  }

  off(event: string, listener: (...args: any[]) => void): this {
    this.eventEmitter.off(event, listener)
    return this
  }

  removeAllListeners(event?: string): this {
    this.eventEmitter.removeAllListeners(event)
    return this
  }

  private generateSocketPath(): string {
    const tmpDir = os.tmpdir()
    const randomSuffix = crypto.randomBytes(8).toString('hex')
    const timestamp = Date.now()

    if (process.platform === 'win32') {
      return `\\\\.\\pipe\\ssh-agent-${timestamp}-${randomSuffix}`
    } else {
      return path.join(tmpDir, `ssh-agent-${timestamp}-${randomSuffix}.sock`)
    }
  }

  async start(): Promise<string> {
    if (this.isRunning) {
      return this.socketPath
    }

    // Clean up old socket files
    if (process.platform !== 'win32') {
      try {
        await fs.unlink(this.socketPath)
      } catch (error) {}
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => {
        this.handleConnection(socket)
      })

      this.server.on('error', (err) => {
        console.error('Chaterm SSH Agent: Server error:', err)
        reject(err)
      })

      this.server.listen(this.socketPath, () => {
        this.isRunning = true
        console.log(`Chaterm SSH Agent: Started on ${this.socketPath}`)

        // Set SSH_AUTH_SOCK
        process.env.SSH_AUTH_SOCK = this.socketPath

        // Set Permissions
        if (process.platform !== 'win32') {
          fs.chmod(this.socketPath, 0o600).catch((err) => {
            console.warn('Could not set socket permissions:', err)
          })
        }

        this.emit('started', this.socketPath)
        resolve(this.socketPath)
      })
    })
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isRunning || !this.server) {
        resolve()
        return
      }

      // Close all client connections
      this.clientConnections.forEach((socket) => {
        socket.destroy()
      })
      this.clientConnections.clear()

      this.server.close(async () => {
        this.isRunning = false

        // Clean up socket files
        if (process.platform !== 'win32') {
          try {
            await fs.unlink(this.socketPath)
          } catch (err) {
            console.warn('Could not remove socket file:', err)
          }
        }

        // Clean up SSH_AUTH_SOCK
        if (process.env.SSH_AUTH_SOCK === this.socketPath) {
          delete process.env.SSH_AUTH_SOCK
        }

        console.log('Chaterm SSH Agent: Stopped')
        this.emit('stopped')
        resolve()
      })
    })
  }

  private handleConnection(socket: Socket): void {
    this.clientConnections.add(socket)
    console.log('SSH Agent: Client connected')

    let buffer: Buffer = Buffer.alloc(0) as Buffer

    socket.on('data', (data) => {
      const dataBuffer = Buffer.from(data)
      buffer = Buffer.concat([buffer, dataBuffer])
      buffer = this.processMessages(socket, buffer)
    })

    socket.on('error', (err) => {
      console.error('SSH Agent: Socket error:', err)
    })

    socket.on('close', () => {
      this.clientConnections.delete(socket)
      console.log('SSH Agent: Client disconnected')
    })
  }

  private processMessages(socket: Socket, buffer: Buffer): Buffer {
    let offset = 0

    while (offset + 4 <= buffer.length) {
      // read the message length
      const messageLength = buffer.readUInt32BE(offset)

      if (offset + 4 + messageLength > buffer.length) {
        // wait for more data
        break
      }

      // fetch the message data
      const messageData = buffer.slice(offset + 4, offset + 4 + messageLength)

      try {
        this.handleAgentMessage(socket, messageData)
      } catch (error) {
        console.error('SSH Agent: Error handling message:', error)
        this.sendFailureResponse(socket)
      }

      offset += 4 + messageLength
    }

    return buffer.slice(offset)
  }

  private handleAgentMessage(socket: Socket, message: Buffer): void {
    if (message.length === 0) return

    const messageType = message.readUInt8(0)
    console.log(`SSH Agent: Received message type: ${messageType}`)

    switch (messageType) {
      case SSH_AGENTC_REQUEST_IDENTITIES:
      case SSH_AGENTC_REQUEST_IDENTITIES_OLD:
        this.handleRequestIdentities(socket)
        break
      case SSH_AGENTC_SIGN_REQUEST:
        this.handleSignRequest(socket, message)
        break
      case SSH_AGENTC_ADD_SMARTCARD_KEY:
        console.log('SSH Agent: Smart card operations not supported')
        this.sendFailureResponse(socket)
        break
      default:
        console.warn(`SSH Agent: Unknown message type: ${messageType}`)
        this.sendFailureResponse(socket)
    }
  }

  private handleRequestIdentities(socket: Socket): void {
    console.log('SSH Agent: Handling request identities')

    const keys = Array.from(this.keys.values())

    // Calculate the total length of the response
    let totalLength = 1 + 4 // Message Type + Number of Keys

    keys.forEach((key) => {
      totalLength += 4 + key.publicKey.length // Public key length field + public key data
      const commentBuffer = Buffer.from(key.comment, 'utf8')
      totalLength += 4 + commentBuffer.length // Comment length field + comment data
    })

    const response = Buffer.alloc(totalLength)
    let offset = 0

    // Message Type
    response.writeUInt8(SSH_AGENT_IDENTITIES_ANSWER, offset)
    offset += 1

    // Number of keys
    response.writeUInt32BE(keys.length, offset)
    offset += 4

    keys.forEach((key) => {
      console.log(`SSH Agent: Adding key to response: ${key.comment}`)
      console.log(`SSH Agent: Public key length: ${key.publicKey.length}`)

      // Public key length
      response.writeUInt32BE(key.publicKey.length, offset)
      offset += 4

      key.publicKey.copy(response, offset)
      offset += key.publicKey.length

      const commentBuffer = Buffer.from(key.comment, 'utf8')
      response.writeUInt32BE(commentBuffer.length, offset)
      offset += 4

      commentBuffer.copy(response, offset)
      offset += commentBuffer.length

      console.log(`SSH Agent: Key ${key.comment} added, current offset: ${offset}`)
    })

    console.log(`SSH Agent: Response total length: ${totalLength}, actual offset: ${offset}`)

    this.sendResponse(socket, response)
  }

  private handleSignRequest(socket: Socket, message: Buffer): void {
    console.log('SSH Agent: Handling sign request')

    let offset = 1 // Skip message

    try {
      // Read the public key
      const pubKeyLength = message.readUInt32BE(offset)
      offset += 4
      const pubKeyData = message.slice(offset, offset + pubKeyLength)
      offset += pubKeyLength

      // Read the data to be signed
      const dataLength = message.readUInt32BE(offset)
      offset += 4
      const signData = message.slice(offset, offset + dataLength)
      offset += dataLength

      // Read flag bit
      const flags = message.readUInt32BE(offset)

      console.log(`SSH Agent: Sign request - pubkey length: ${pubKeyLength}, data length: ${dataLength}, flags: ${flags}`)

      // Find matching keys
      const key = this.findKeyByPublicKeyData(pubKeyData)
      if (!key) {
        console.log('SSH Agent: Key not found for signing')
        this.sendFailureResponse(socket)
        return
      }

      console.log(`SSH Agent: Found key for signing: ${key.comment}`)

      // sign
      const signature = this.performSigning(key, signData, flags)
      if (!signature) {
        console.log('SSH Agent: Signing failed')
        this.sendFailureResponse(socket)
        return
      }

      this.sendSignResponse(socket, signature)
    } catch (error) {
      console.error('SSH Agent: Error in sign request:', error)
      this.sendFailureResponse(socket)
    }
  }

  private findKeyByPublicKeyData(pubKeyData: Buffer): SSHAgentKey | undefined {
    for (const key of this.keys.values()) {
      // Comparing public key
      if (key.publicKey.equals(pubKeyData)) {
        return key
      }

      // try to compare the parsed public key
      try {
        const parsedPubKey = utils.parseKey(pubKeyData)
        if (parsedPubKey && !(parsedPubKey instanceof Error) && key.publicKey.equals(parsedPubKey.getPublicSSH())) {
          return key
        }
      } catch (e) {}
    }
    return undefined
  }

  private performSigning(key: SSHAgentKey, data: Buffer, flags: number): Buffer | null {
    try {
      console.log(`SSH Agent: Performing signature with ${key.keyType}`)

      let hashAlg = 'sha1'
      if (key.keyType === SSHKeyType.RSA && flags & 0x04) {
        hashAlg = 'sha512'
      } else if (key.keyType === SSHKeyType.RSA && flags & 0x02) {
        hashAlg = 'sha256'
      }

      const signature = key.privateKey.sign(data, hashAlg)
      if (signature instanceof Error) {
        console.error('SSH Agent: Signature generation failed:', signature)
        return null
      }

      // format
      return this.formatSignature(key.keyType, signature, flags)
    } catch (error) {
      console.error('SSH Agent: Signing error:', error)
      return null
    }
  }

  private formatSignature(keyType: SSHKeyType, signature: Buffer, flags: number): Buffer {
    let sigType = keyType

    // Determine the signature type based on the flag bit
    if (keyType === SSHKeyType.RSA) {
      if (flags & 0x04) {
        sigType = 'rsa-sha2-512' as SSHKeyType
      } else if (flags & 0x02) {
        sigType = 'rsa-sha2-256' as SSHKeyType
      }
    }

    const sigTypeBuffer = Buffer.from(sigType, 'utf8')
    const result = Buffer.alloc(4 + sigTypeBuffer.length + 4 + signature.length)
    let offset = 0

    // Signature type length
    result.writeUInt32BE(sigTypeBuffer.length, offset)
    offset += 4

    // Signature type
    sigTypeBuffer.copy(result, offset)
    offset += sigTypeBuffer.length

    // Signature data length
    result.writeUInt32BE(signature.length, offset)
    offset += 4

    // Signature data
    signature.copy(result, offset)

    return result
  }

  private sendResponse(socket: Socket, data: Buffer): void {
    const response = Buffer.alloc(4 + data.length)
    response.writeUInt32BE(data.length, 0)
    data.copy(response, 4)

    console.log(`SSH Agent: Sending response, total length: ${response.length}, data length: ${data.length}`)
    console.log(`SSH Agent: Response header: ${response.slice(0, Math.min(16, response.length)).toString('hex')}`)

    socket.write(response)
  }

  private sendSignResponse(socket: Socket, signature: Buffer): void {
    const response = Buffer.alloc(1 + 4 + signature.length)
    let offset = 0

    // Message Type
    response.writeUInt8(SSH_AGENT_SIGN_RESPONSE, offset)
    offset += 1

    // Signature data length
    response.writeUInt32BE(signature.length, offset)
    offset += 4

    // Signature data
    signature.copy(response, offset)

    this.sendResponse(socket, response)
  }

  private sendFailureResponse(socket: Socket): void {
    const response = Buffer.from([SSH_AGENT_FAILURE])
    this.sendResponse(socket, response)
  }

  // BaseAgent Methods
  getIdentities(callback: (err: Error | null, keys?: any[]) => void): void {
    try {
      const keys = Array.from(this.keys.values()).map((key) => ({
        type: key.keyType,
        data: key.publicKey,
        comment: key.comment
      }))
      callback(null, keys)
    } catch (error) {
      callback(error as Error)
    }
  }

  sign(pubKey: string | Buffer | any, data: Buffer, options: any, callback?: (err: Error | null, signature?: Buffer) => void): void {
    if (typeof options === 'function') {
      callback = options
      options = {}
    }

    if (!callback) {
      throw new Error('Callback is required')
    }
    try {
      const key = this.findKeyByPublicKeyData(pubKey.data || pubKey)
      if (!key) {
        return callback(new Error('Key not found'))
      }

      const signature = this.performSigning(key, data, options?.flags || 0)
      if (!signature) {
        return callback(new Error('Signing failed'))
      }

      callback(null, signature)
    } catch (error) {
      callback(error as Error)
    }
  }

  // Agent Forwarding support
  getStream(callback: (err: Error | null, stream?: Duplex) => void): void {
    if (!this.isRunning) {
      return callback(new Error('SSH Agent is not running'))
    }

    try {
      // Create a stream connected to the local agent
      const socket = new Socket()
      socket.connect(this.socketPath, () => {
        callback(null, socket)
      })

      socket.on('error', (err) => {
        callback(err)
      })
    } catch (error) {
      callback(error as Error)
    }
  }

  async addKeyFromData(privateKeyData: string, passphrase?: string, comment?: string): Promise<string> {
    try {
      const parsedKey = utils.parseKey(privateKeyData, passphrase)

      if (!parsedKey || parsedKey instanceof Error) {
        throw new Error('Failed to parse private key')
      }

      if (!parsedKey.isPrivateKey()) {
        throw new Error('Provided key is not a private key')
      }

      const publicKeySSH = parsedKey.getPublicSSH()
      const fingerprint = crypto.createHash('md5').update(publicKeySSH).digest('hex').match(/.{2}/g)!.join(':')

      // Check if a key with the same fingerprint already exists
      for (const key of this.keys.values()) {
        if (key.comment === comment) {
          console.log(`SSH Agent: Key already exists, skipping (${key.comment})`)
          return key.id
        }
      }

      const keyId = crypto.randomBytes(16).toString('hex')

      const agentKey: SSHAgentKey = {
        id: keyId,
        privateKey: parsedKey,
        publicKey: publicKeySSH,
        comment: comment || 'imported-key',
        keyType: parsedKey.type as SSHKeyType,
        fingerprint,
        addedAt: new Date()
      }

      this.keys.set(keyId, agentKey)
      console.log(`SSH Agent: Added key ${agentKey.comment} (${agentKey.keyType})`)
      this.emit('keyAdded', agentKey)

      return keyId
    } catch (error) {
      console.error('SSH Agent: Failed to add key from data:', error)
      throw error
    }
  }

  removeKey(keyId: string): boolean {
    const key = this.keys.get(keyId)
    if (key && this.keys.delete(keyId)) {
      console.log(`SSH Agent: Removed key ${key.comment}`)
      this.emit('keyRemoved', key)
      return true
    }
    return false
  }

  removeAllKeys(): number {
    const count = this.keys.size
    this.keys.clear()
    console.log(`SSH Agent: Removed all ${count} keys`)
    this.emit('allKeysRemoved')
    return count
  }

  listKeys(): Array<{
    id: string
    comment: string
    keyType: string
    fingerprint: string
  }> {
    return Array.from(this.keys.values()).map((key) => ({
      id: key.id,
      comment: key.comment,
      keyType: key.keyType,
      fingerprint: key.fingerprint
    }))
  }

  getSocketPath(): string {
    return this.socketPath
  }

  isAgentRunning(): boolean {
    return this.isRunning
  }

  async generateKeyPair(
    keyType: 'rsa' | 'ed25519' | 'ecdsa' = 'ed25519',
    options: {
      bits?: number
      comment?: string
      passphrase?: string
    } = {}
  ): Promise<{ privateKey: string; publicKey: string; keyId: string }> {
    return new Promise((resolve, reject) => {
      const generateOptions: any = {
        comment: options.comment || `generated-${keyType}-key`,
        ...options
      }

      utils.generateKeyPair(keyType, generateOptions, async (err, keys) => {
        if (err) {
          return reject(err)
        }

        try {
          const keyId = await this.addKeyFromData(keys.private, options.passphrase, options.comment)

          resolve({
            privateKey: keys.private,
            publicKey: keys.public,
            keyId
          })
        } catch (error) {
          reject(error)
        }
      })
    })
  }
}

export class SSHAgentManager {
  private static instance: SSHAgentManager | null = null
  private agent: SSHAgent | null = null

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): SSHAgentManager {
    if (!SSHAgentManager.instance) {
      SSHAgentManager.instance = new SSHAgentManager()
    }
    return SSHAgentManager.instance
  }

  async enableAgent(enabled: boolean): Promise<{ SSH_AUTH_SOCK: string | null; agent?: SSHAgent }> {
    if (!enabled) {
      if (this.agent) {
        await this.agent.stop()
        this.agent = null
      }
      return { SSH_AUTH_SOCK: null }
    }

    if (this.agent && this.agent.isAgentRunning()) {
      return {
        SSH_AUTH_SOCK: this.agent.getSocketPath(),
        agent: this.agent
      }
    }

    try {
      this.agent = new SSHAgent()

      this.setupEventListeners()

      const socketPath = await this.agent.start()

      console.log('Chaterm SSH Agent started:', socketPath)
      return {
        SSH_AUTH_SOCK: socketPath,
        agent: this.agent
      }
    } catch (error) {
      console.error('Failed to start Chaterm SSH Agent:', error)
      throw error
    }
  }

  private setupEventListeners(): void {
    if (!this.agent) return

    this.agent.on('started', (socketPath) => {
      console.log(`SSH Agent started on: ${socketPath}`)
    })

    this.agent.on('stopped', () => {
      console.log('SSH Agent stopped')
    })

    this.agent.on('keyAdded', (key) => {
      console.log(`Key added: ${key.comment} (${key.keyType})`)
    })

    this.agent.on('keyRemoved', (key) => {
      console.log(`Key removed: ${key.comment}`)
    })
  }

  getAgent(): SSHAgent | null {
    return this.agent
  }

  async addKey(keyData: string, passphrase?: string, comment?: string): Promise<string> {
    if (!this.agent?.isAgentRunning()) {
      throw new Error('SSH Agent is not running')
    }
    return this.agent.addKeyFromData(keyData, passphrase, comment)
  }

  removeKey(keyId: string): boolean {
    if (!this.agent?.isAgentRunning()) {
      return false
    }
    return this.agent.removeKey(keyId)
  }

  listKeys() {
    if (!this.agent?.isAgentRunning()) {
      return []
    }
    return this.agent.listKeys()
  }

  async generateKeyPair(
    keyType: 'rsa' | 'ed25519' | 'ecdsa' = 'ed25519',
    options: {
      bits?: number
      comment?: string
      passphrase?: string
    } = {}
  ) {
    if (!this.agent?.isAgentRunning()) {
      throw new Error('SSH Agent is not running')
    }
    return this.agent.generateKeyPair(keyType, options)
  }
}
