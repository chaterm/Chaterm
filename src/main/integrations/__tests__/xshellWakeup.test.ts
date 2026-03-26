import { describe, expect, it } from 'vitest'
import { parseXshellWakeupFromArgv, redactXshellWakeupForLog } from '../xshellWakeup'

describe('xshellWakeup parser', () => {
  it('parses direct -url arguments and preserves OTP password with colon', () => {
    const argv = ['C:\\Program Files\\Chaterm\\Chaterm.exe', '-url', 'ssh://guojiaqi:OTP:xxxx@xx.xx.group:22', '-newtab', 'root@hkuattrustone']

    const parsed = parseXshellWakeupFromArgv(argv)
    expect(parsed).not.toBeNull()
    expect(parsed?.source).toBe('xshell-direct')
    expect(parsed?.host).toBe('xx.xx.group')
    expect(parsed?.port).toBe(22)
    expect(parsed?.username).toBe('guojiaqi')
    expect(parsed?.password).toBe('OTP:xxxx')
    expect(parsed?.newTab).toBe(true)
    expect(parsed?.targetHint).toBe('root@hkuattrustone')
  })

  it('parses --xshell-wakeup base64 payload', () => {
    const encoded = Buffer.from(
      JSON.stringify({
        url: 'ssh://u:p@h.example.com:2200',
        rawArgs: ['-url', 'ssh://u:p@h.example.com:2200'],
        targetHint: 'root@target',
        newTab: true
      }),
      'utf8'
    ).toString('base64')

    const parsed = parseXshellWakeupFromArgv(['--xshell-wakeup', encoded])
    expect(parsed).not.toBeNull()
    expect(parsed?.source).toBe('xshell-encoded')
    expect(parsed?.host).toBe('h.example.com')
    expect(parsed?.port).toBe(2200)
    expect(parsed?.username).toBe('u')
    expect(parsed?.password).toBe('p')
    expect(parsed?.targetHint).toBe('root@target')
    expect(parsed?.newTab).toBe(true)
  })

  it('parses --url=... and --newtab=... style arguments', () => {
    const argv = ['C:\\Program Files\\Chaterm\\Chaterm.exe', '--url=ssh://guojiaqi:OTP:xxxx@xx.xx.group:22', '--newtab=root@hkuattrustone']

    const parsed = parseXshellWakeupFromArgv(argv)
    expect(parsed).not.toBeNull()
    expect(parsed?.source).toBe('xshell-direct')
    expect(parsed?.host).toBe('xx.xx.group')
    expect(parsed?.port).toBe(22)
    expect(parsed?.username).toBe('guojiaqi')
    expect(parsed?.password).toBe('OTP:xxxx')
    expect(parsed?.newTab).toBe(true)
    expect(parsed?.targetHint).toBe('root@hkuattrustone')
  })

  it('parses --xshell-wakeup=base64 style argument', () => {
    const encoded = Buffer.from(
      JSON.stringify({
        url: 'ssh://u:p@h.example.com:2200',
        rawArgs: ['-url', 'ssh://u:p@h.example.com:2200'],
        targetHint: 'root@target',
        newTab: true
      }),
      'utf8'
    ).toString('base64')

    const parsed = parseXshellWakeupFromArgv([`--xshell-wakeup=${encoded}`])
    expect(parsed).not.toBeNull()
    expect(parsed?.source).toBe('xshell-encoded')
    expect(parsed?.host).toBe('h.example.com')
    expect(parsed?.port).toBe(2200)
    expect(parsed?.username).toBe('u')
    expect(parsed?.password).toBe('p')
    expect(parsed?.targetHint).toBe('root@target')
    expect(parsed?.newTab).toBe(true)
  })

  it('returns null when no wakeup args are present', () => {
    const parsed = parseXshellWakeupFromArgv(['C:\\Program Files\\Chaterm\\Chaterm.exe'])
    expect(parsed).toBeNull()
  })

  it('redacts sensitive fields for logging', () => {
    const payload = parseXshellWakeupFromArgv(['-url', 'ssh://u:p@host:22'])!
    const redacted = redactXshellWakeupForLog(payload) as any
    expect(redacted.password).toBe('***')
    expect(redacted.url).toContain('ssh://***@host:22')
  })
})
