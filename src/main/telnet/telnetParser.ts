/**
 * Telnet protocol constants (RFC 854/855)
 */
export const TELNET = {
  // Special characters
  IAC: 0xff, // Interpret As Command
  SE: 0xf0, // Sub-negotiation End
  SB: 0xfa, // Sub-negotiation Begin

  // Commands
  WILL: 0xfb,
  WONT: 0xfc,
  DO: 0xfd,
  DONT: 0xfe,

  // Options
  ECHO: 0x01,
  SUPPRESS_GO_AHEAD: 0x03,
  STATUS: 0x05,
  TERMINAL_TYPE: 0x18,
  NAWS: 0x1f,
  TERMINAL_SPEED: 0x20,
  NEW_ENVIRON: 0x27,

  // Sub-negotiation
  IS: 0x00,
  SEND: 0x01
} as const

export interface TelnetParserOptions {
  terminalType?: string
  cols?: number
  rows?: number
}

/**
 * Telnet protocol parser.
 * Processes raw socket data, strips IAC commands, handles option negotiation.
 * Returns clean user data for the terminal emulator.
 */
export class TelnetParser {
  private terminalType: string
  private cols: number
  private rows: number
  private negotiatedOptions: Map<number, boolean> = new Map()
  private pendingResponses: Buffer[] = []

  constructor(options: TelnetParserOptions = {}) {
    this.terminalType = options.terminalType || 'xterm-256color'
    this.cols = options.cols || 80
    this.rows = options.rows || 24
  }

  /**
   * Parse incoming data from the socket.
   * Returns clean data (Telnet commands stripped) and any negotiation responses to send.
   */
  parse(data: Buffer): { cleanData: Buffer; responses: Buffer[] } {
    const cleanChunks: Buffer[] = []
    const responses: Buffer[] = [...this.pendingResponses]
    this.pendingResponses = []
    let i = 0

    while (i < data.length) {
      if (data[i] === TELNET.IAC) {
        if (i + 1 >= data.length) break

        const cmd = data[i + 1]

        if (cmd === TELNET.IAC) {
          // Escaped IAC (0xFF 0xFF) -> literal 0xFF
          cleanChunks.push(Buffer.from([0xff]))
          i += 2
          continue
        }

        if (cmd === TELNET.WILL || cmd === TELNET.WONT || cmd === TELNET.DO || cmd === TELNET.DONT) {
          if (i + 2 >= data.length) break
          const option = data[i + 2]
          const response = this.handleNegotiation(cmd, option)
          if (response) responses.push(response)
          i += 3
          continue
        }

        if (cmd === TELNET.SB) {
          const seIndex = this.findSubEnd(data, i + 2)
          if (seIndex === -1) break
          const subData = data.subarray(i + 2, seIndex)
          const response = this.handleSubNegotiation(subData)
          if (response) responses.push(response)
          i = seIndex + 2
          continue
        }

        // Other IAC commands - skip
        i += 2
        continue
      }

      // Regular data byte - collect contiguous run
      const start = i
      while (i < data.length && data[i] !== TELNET.IAC) {
        i++
      }
      cleanChunks.push(data.subarray(start, i))
    }

    const cleanData = cleanChunks.length > 0 ? Buffer.concat(cleanChunks) : Buffer.alloc(0)
    return { cleanData, responses }
  }

  private handleNegotiation(cmd: number, option: number): Buffer | null {
    switch (cmd) {
      case TELNET.WILL:
        return this.handleWill(option)
      case TELNET.WONT:
        return this.handleWont(option)
      case TELNET.DO:
        return this.handleDo(option)
      case TELNET.DONT:
        return this.handleDont(option)
      default:
        return null
    }
  }

  private handleWill(option: number): Buffer | null {
    switch (option) {
      case TELNET.ECHO:
      case TELNET.SUPPRESS_GO_AHEAD:
        this.negotiatedOptions.set(option, true)
        return Buffer.from([TELNET.IAC, TELNET.DO, option])
      default:
        return Buffer.from([TELNET.IAC, TELNET.DONT, option])
    }
  }

  private handleWont(option: number): Buffer | null {
    this.negotiatedOptions.set(option, false)
    return Buffer.from([TELNET.IAC, TELNET.DONT, option])
  }

  private handleDo(option: number): Buffer | null {
    switch (option) {
      case TELNET.TERMINAL_TYPE:
        this.negotiatedOptions.set(option, true)
        return Buffer.from([TELNET.IAC, TELNET.WILL, option])
      case TELNET.NAWS: {
        this.negotiatedOptions.set(option, true)
        const willNaws = Buffer.from([TELNET.IAC, TELNET.WILL, option])
        this.pendingResponses.push(this.buildNawsSubNegotiation())
        return willNaws
      }
      case TELNET.SUPPRESS_GO_AHEAD:
      case TELNET.NEW_ENVIRON:
      case TELNET.TERMINAL_SPEED:
        this.negotiatedOptions.set(option, true)
        return Buffer.from([TELNET.IAC, TELNET.WILL, option])
      default:
        return Buffer.from([TELNET.IAC, TELNET.WONT, option])
    }
  }

  private handleDont(option: number): Buffer | null {
    this.negotiatedOptions.set(option, false)
    return Buffer.from([TELNET.IAC, TELNET.WONT, option])
  }

  private handleSubNegotiation(data: Buffer): Buffer | null {
    if (data.length < 1) return null
    const option = data[0]

    switch (option) {
      case TELNET.TERMINAL_TYPE:
        if (data.length >= 2 && data[1] === TELNET.SEND) {
          return this.buildTerminalTypeSub()
        }
        return null
      case TELNET.NEW_ENVIRON:
        return Buffer.from([TELNET.IAC, TELNET.SB, TELNET.NEW_ENVIRON, TELNET.IS, TELNET.IAC, TELNET.SE])
      case TELNET.TERMINAL_SPEED:
        if (data.length >= 2 && data[1] === TELNET.SEND) {
          const speed = Buffer.from('38400,38400')
          return Buffer.concat([Buffer.from([TELNET.IAC, TELNET.SB, TELNET.TERMINAL_SPEED, TELNET.IS]), speed, Buffer.from([TELNET.IAC, TELNET.SE])])
        }
        return null
      default:
        return null
    }
  }

  private buildTerminalTypeSub(): Buffer {
    const typeBytes = Buffer.from(this.terminalType)
    return Buffer.concat([Buffer.from([TELNET.IAC, TELNET.SB, TELNET.TERMINAL_TYPE, TELNET.IS]), typeBytes, Buffer.from([TELNET.IAC, TELNET.SE])])
  }

  /**
   * Build NAWS (window size) sub-negotiation.
   */
  buildNawsSubNegotiation(): Buffer {
    const chunks: Buffer[] = []
    chunks.push(Buffer.from([TELNET.IAC, TELNET.SB, TELNET.NAWS]))

    // Write cols as 2 bytes (big-endian), escaping 0xFF
    const colsHigh = (this.cols >> 8) & 0xff
    const colsLow = this.cols & 0xff
    chunks.push(Buffer.from([colsHigh]))
    if (colsHigh === 0xff) chunks.push(Buffer.from([0xff]))
    chunks.push(Buffer.from([colsLow]))
    if (colsLow === 0xff) chunks.push(Buffer.from([0xff]))

    // Write rows as 2 bytes (big-endian), escaping 0xFF
    const rowsHigh = (this.rows >> 8) & 0xff
    const rowsLow = this.rows & 0xff
    chunks.push(Buffer.from([rowsHigh]))
    if (rowsHigh === 0xff) chunks.push(Buffer.from([0xff]))
    chunks.push(Buffer.from([rowsLow]))
    if (rowsLow === 0xff) chunks.push(Buffer.from([0xff]))

    chunks.push(Buffer.from([TELNET.IAC, TELNET.SE]))
    return Buffer.concat(chunks)
  }

  /**
   * Update window size and return NAWS sub-negotiation if NAWS was negotiated.
   */
  setWindowSize(cols: number, rows: number): Buffer | null {
    this.cols = cols
    this.rows = rows
    if (this.negotiatedOptions.get(TELNET.NAWS)) {
      return this.buildNawsSubNegotiation()
    }
    return null
  }

  private findSubEnd(data: Buffer, offset: number): number {
    for (let i = offset; i < data.length - 1; i++) {
      if (data[i] === TELNET.IAC && data[i + 1] === TELNET.SE) {
        return i
      }
    }
    return -1
  }

  /**
   * Check if echo is being handled by the server.
   */
  isServerEcho(): boolean {
    return this.negotiatedOptions.get(TELNET.ECHO) === true
  }
}
