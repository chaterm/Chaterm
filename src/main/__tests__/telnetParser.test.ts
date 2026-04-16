import { describe, it, expect } from 'vitest'
import { TelnetParser, TELNET } from '../telnet/telnetParser'

describe('TelnetParser', () => {
  it('should pass through regular data unchanged', () => {
    const parser = new TelnetParser()
    const input = Buffer.from('Hello, World!')
    const { cleanData, responses } = parser.parse(input)
    expect(cleanData.toString()).toBe('Hello, World!')
    expect(responses).toHaveLength(0)
  })

  it('should handle escaped IAC (0xFF 0xFF)', () => {
    const parser = new TelnetParser()
    const input = Buffer.from([0x41, 0xff, 0xff, 0x42]) // A<IAC><IAC>B
    const { cleanData } = parser.parse(input)
    expect(cleanData).toEqual(Buffer.from([0x41, 0xff, 0x42]))
  })

  it('should strip WILL commands and respond with DO for supported options', () => {
    const parser = new TelnetParser()
    // Server: IAC WILL ECHO
    const input = Buffer.from([TELNET.IAC, TELNET.WILL, TELNET.ECHO, 0x41])
    const { cleanData, responses } = parser.parse(input)
    expect(cleanData.toString()).toBe('A')
    expect(responses).toHaveLength(1)
    expect(responses[0]).toEqual(Buffer.from([TELNET.IAC, TELNET.DO, TELNET.ECHO]))
  })

  it('should refuse unknown WILL options with DONT', () => {
    const parser = new TelnetParser()
    const unknownOption = 0x99
    const input = Buffer.from([TELNET.IAC, TELNET.WILL, unknownOption])
    const { responses } = parser.parse(input)
    expect(responses[0]).toEqual(Buffer.from([TELNET.IAC, TELNET.DONT, unknownOption]))
  })

  it('should accept WILL SUPPRESS_GO_AHEAD', () => {
    const parser = new TelnetParser()
    const input = Buffer.from([TELNET.IAC, TELNET.WILL, TELNET.SUPPRESS_GO_AHEAD])
    const { responses } = parser.parse(input)
    expect(responses[0]).toEqual(Buffer.from([TELNET.IAC, TELNET.DO, TELNET.SUPPRESS_GO_AHEAD]))
  })

  it('should handle DO TERMINAL_TYPE and respond WILL', () => {
    const parser = new TelnetParser()
    const input = Buffer.from([TELNET.IAC, TELNET.DO, TELNET.TERMINAL_TYPE])
    const { responses } = parser.parse(input)
    expect(responses[0]).toEqual(Buffer.from([TELNET.IAC, TELNET.WILL, TELNET.TERMINAL_TYPE]))
  })

  it('should refuse unknown DO options with WONT', () => {
    const parser = new TelnetParser()
    const unknownOption = 0x99
    const input = Buffer.from([TELNET.IAC, TELNET.DO, unknownOption])
    const { responses } = parser.parse(input)
    expect(responses[0]).toEqual(Buffer.from([TELNET.IAC, TELNET.WONT, unknownOption]))
  })

  it('should respond to WONT with DONT', () => {
    const parser = new TelnetParser()
    const input = Buffer.from([TELNET.IAC, TELNET.WONT, TELNET.ECHO])
    const { responses } = parser.parse(input)
    expect(responses[0]).toEqual(Buffer.from([TELNET.IAC, TELNET.DONT, TELNET.ECHO]))
  })

  it('should respond to DONT with WONT', () => {
    const parser = new TelnetParser()
    const input = Buffer.from([TELNET.IAC, TELNET.DONT, TELNET.ECHO])
    const { responses } = parser.parse(input)
    expect(responses[0]).toEqual(Buffer.from([TELNET.IAC, TELNET.WONT, TELNET.ECHO]))
  })

  it('should respond to terminal type sub-negotiation', () => {
    const parser = new TelnetParser({ terminalType: 'xterm' })
    // First negotiate DO/WILL terminal type
    parser.parse(Buffer.from([TELNET.IAC, TELNET.DO, TELNET.TERMINAL_TYPE]))
    // Then sub-negotiation: IAC SB TERMINAL_TYPE SEND IAC SE
    const subNeg = Buffer.from([TELNET.IAC, TELNET.SB, TELNET.TERMINAL_TYPE, TELNET.SEND, TELNET.IAC, TELNET.SE])
    const { responses } = parser.parse(subNeg)
    const expected = Buffer.concat([
      Buffer.from([TELNET.IAC, TELNET.SB, TELNET.TERMINAL_TYPE, TELNET.IS]),
      Buffer.from('xterm'),
      Buffer.from([TELNET.IAC, TELNET.SE])
    ])
    expect(responses[0]).toEqual(expected)
  })

  it('should handle DO NAWS and send window size', () => {
    const parser = new TelnetParser({ cols: 80, rows: 24 })
    const input = Buffer.from([TELNET.IAC, TELNET.DO, TELNET.NAWS])
    const { responses } = parser.parse(input)
    // First response: IAC WILL NAWS
    expect(responses[0]).toEqual(Buffer.from([TELNET.IAC, TELNET.WILL, TELNET.NAWS]))
    // The NAWS sub-negotiation is queued in pendingResponses and delivered on next parse
    const { responses: nextResponses } = parser.parse(Buffer.alloc(0))
    expect(nextResponses.length).toBeGreaterThanOrEqual(1)
    const nawsResponse = nextResponses[0]
    expect(nawsResponse[0]).toBe(TELNET.IAC)
    expect(nawsResponse[1]).toBe(TELNET.SB)
    expect(nawsResponse[2]).toBe(TELNET.NAWS)
    // Should end with IAC SE
    const len = nawsResponse.length
    expect(nawsResponse[len - 2]).toBe(TELNET.IAC)
    expect(nawsResponse[len - 1]).toBe(TELNET.SE)
  })

  it('should update window size and return NAWS data when negotiated', () => {
    const parser = new TelnetParser({ cols: 80, rows: 24 })
    // Negotiate NAWS first
    parser.parse(Buffer.from([TELNET.IAC, TELNET.DO, TELNET.NAWS]))
    // Now resize
    const nawsData = parser.setWindowSize(120, 40)
    expect(nawsData).not.toBeNull()
    expect(nawsData![0]).toBe(TELNET.IAC)
    expect(nawsData![1]).toBe(TELNET.SB)
    expect(nawsData![2]).toBe(TELNET.NAWS)
  })

  it('should return null for setWindowSize when NAWS not negotiated', () => {
    const parser = new TelnetParser()
    const result = parser.setWindowSize(120, 40)
    expect(result).toBeNull()
  })

  it('should handle mixed data and commands', () => {
    const parser = new TelnetParser()
    const input = Buffer.from([
      0x48,
      0x65,
      0x6c,
      0x6c,
      0x6f, // "Hello"
      TELNET.IAC,
      TELNET.WILL,
      TELNET.ECHO,
      0x57,
      0x6f,
      0x72,
      0x6c,
      0x64 // "World"
    ])
    const { cleanData } = parser.parse(input)
    expect(cleanData.toString()).toBe('HelloWorld')
  })

  it('should report server echo status', () => {
    const parser = new TelnetParser()
    expect(parser.isServerEcho()).toBe(false)
    parser.parse(Buffer.from([TELNET.IAC, TELNET.WILL, TELNET.ECHO]))
    expect(parser.isServerEcho()).toBe(true)
  })

  it('should handle empty buffer', () => {
    const parser = new TelnetParser()
    const { cleanData, responses } = parser.parse(Buffer.alloc(0))
    expect(cleanData.length).toBe(0)
    expect(responses).toHaveLength(0)
  })

  it('should handle terminal speed sub-negotiation', () => {
    const parser = new TelnetParser()
    // First accept DO TERMINAL_SPEED
    parser.parse(Buffer.from([TELNET.IAC, TELNET.DO, TELNET.TERMINAL_SPEED]))
    // Then sub-negotiation: IAC SB TERMINAL_SPEED SEND IAC SE
    const subNeg = Buffer.from([TELNET.IAC, TELNET.SB, TELNET.TERMINAL_SPEED, TELNET.SEND, TELNET.IAC, TELNET.SE])
    const { responses } = parser.parse(subNeg)
    // Should respond with speed
    expect(responses.length).toBeGreaterThanOrEqual(1)
    const resp = responses[0]
    expect(resp[0]).toBe(TELNET.IAC)
    expect(resp[1]).toBe(TELNET.SB)
    expect(resp[2]).toBe(TELNET.TERMINAL_SPEED)
    expect(resp[3]).toBe(TELNET.IS)
    // Should contain speed string
    const speedStr = resp.subarray(4, resp.length - 2).toString()
    expect(speedStr).toBe('38400,38400')
  })

  it('should handle NEW_ENVIRON sub-negotiation', () => {
    const parser = new TelnetParser()
    parser.parse(Buffer.from([TELNET.IAC, TELNET.DO, TELNET.NEW_ENVIRON]))
    const subNeg = Buffer.from([TELNET.IAC, TELNET.SB, TELNET.NEW_ENVIRON, TELNET.SEND, TELNET.IAC, TELNET.SE])
    const { responses } = parser.parse(subNeg)
    expect(responses.length).toBeGreaterThanOrEqual(1)
    // Should respond with empty environment
    const resp = responses[0]
    expect(resp[0]).toBe(TELNET.IAC)
    expect(resp[1]).toBe(TELNET.SB)
    expect(resp[2]).toBe(TELNET.NEW_ENVIRON)
    expect(resp[3]).toBe(TELNET.IS)
  })

  it('should handle NAWS with values containing 0xFF (escape)', () => {
    const parser = new TelnetParser({ cols: 255, rows: 24 })
    const nawsData = parser.buildNawsSubNegotiation()
    // 255 = 0xFF should be escaped as 0xFF 0xFF
    // Check that the NAWS data contains escaped 0xFF
    let ffCount = 0
    for (let i = 3; i < nawsData.length - 2; i++) {
      if (nawsData[i] === 0xff) ffCount++
    }
    // cols=255 means high byte=0x00, low byte=0xFF
    // The 0xFF low byte should be escaped, so we expect at least 2 consecutive 0xFF bytes
    expect(ffCount).toBeGreaterThanOrEqual(2)
  })
})
