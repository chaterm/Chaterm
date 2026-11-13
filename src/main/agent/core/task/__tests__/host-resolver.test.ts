import { describe, expect, it } from 'vitest'
import type { McpTarget } from '../../../../../shared/external-mcp'
import { HostResolutionError, formatManagedHosts, parseBoundedInt, pickManagedTarget, targetToHost } from '../host-resolver'

const target = (overrides: Partial<McpTarget> = {}): McpTarget => ({
  target_id: 't1',
  name: 'api',
  host: '10.0.0.1',
  port: 22,
  connection_type: 'ssh',
  group: null,
  ...overrides
})

describe('pickManagedTarget', () => {
  it('returns the only match', () => {
    const only = target()
    expect(pickManagedTarget('10.0.0.1', [only])).toBe(only)
  })

  it('rejects a host that is not managed', () => {
    expect(() => pickManagedTarget('10.9.9.9', [])).toThrow(HostResolutionError)
    expect(() => pickManagedTarget('10.9.9.9', [])).toThrow(/not a host managed by Chaterm/)
  })

  it('lists the candidates when several managed hosts share the address', () => {
    const candidates = [target({ target_id: 'a', name: 'api-via-a', group: 'bastion-a' }), target({ target_id: 'b', name: 'api-via-b' })]
    expect(() => pickManagedTarget('10.0.0.1', candidates)).toThrow(HostResolutionError)
    expect(() => pickManagedTarget('10.0.0.1', candidates)).toThrow(
      /matches 2 managed hosts \(api-via-a \(port 22, group: bastion-a\); api-via-b \(port 22\)\)/
    )
  })
})

describe('targetToHost', () => {
  it('maps a managed target to the Host the task connects with', () => {
    expect(targetToHost(target({ target_id: 'u1', host: '10.0.0.2', connection_type: 'jumpserver' }))).toEqual({
      host: '10.0.0.2',
      uuid: 'u1',
      connection: 'jumpserver'
    })
  })
})

describe('parseBoundedInt', () => {
  it('falls back for missing or non-numeric input', () => {
    expect(parseBoundedInt(undefined, 50, 1, 200)).toBe(50)
    expect(parseBoundedInt('abc', 50, 1, 200)).toBe(50)
  })

  it('clamps to the range', () => {
    expect(parseBoundedInt('0', 50, 1, 200)).toBe(1)
    expect(parseBoundedInt('999', 50, 1, 200)).toBe(200)
    expect(parseBoundedInt('25', 50, 1, 200)).toBe(25)
  })
})

describe('formatManagedHosts', () => {
  it('reports an empty first page and an exhausted later page differently', () => {
    expect(formatManagedHosts([], 50, 0)).toBe('No managed hosts found.')
    expect(formatManagedHosts([], 50, 50)).toBe('No more managed hosts.')
  })

  it('lists each host with its group when present', () => {
    const text = formatManagedHosts(
      [target(), target({ host: '10.0.0.2', name: 'db', port: 2222, connection_type: 'jumpserver', group: 'prod' })],
      50,
      0
    )
    expect(text).toContain('- host: 10.0.0.1 | name: api | port: 22 | type: ssh\n')
    expect(text).toContain('- host: 10.0.0.2 | name: db | port: 2222 | type: jumpserver | group: prod')
    expect(text).not.toContain('target_id')
    expect(text).not.toContain('Results may continue')
  })

  it('points to the next offset when the page is full', () => {
    const text = formatManagedHosts([target(), target({ host: '10.0.0.2' })], 2, 4)
    expect(text).toContain('call list_hosts again with offset 6')
  })
})
