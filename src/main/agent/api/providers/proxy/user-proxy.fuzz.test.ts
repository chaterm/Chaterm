import { describe, expect } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { buildProxyUrl } from './user-proxy'
import type { ProxyConfig } from '@shared/Proxy'

describe('buildProxyUrl property tests', () => {
  test.prop({
    username: fc.string(),
    password: fc.string(),
    host: fc.oneof(fc.domain(), fc.ipV4()),
    port: fc.integer({ min: 1, max: 65535 })
  })('encodes credentials safely in proxy URL', ({ username, password, host, port }) => {
    const config: ProxyConfig = {
      type: 'HTTP',
      host,
      port,
      enableProxyIdentity: true,
      username,
      password
    }

    const url = buildProxyUrl(config)
    const parsed = new URL(url)

    expect(parsed.hostname).toBe(host)
    expect(Number(parsed.port)).toBe(port)

    if (username && password) {
      expect(url).toContain(`${encodeURIComponent(username)}:${encodeURIComponent(password)}@`)
      expect(decodeURIComponent(parsed.username)).toBe(username)
      expect(decodeURIComponent(parsed.password)).toBe(password)
    }
  })

  test.prop({
    username: fc.string(),
    password: fc.string(),
    host: fc.oneof(fc.domain(), fc.ipV4()),
    port: fc.integer({ min: 1, max: 65535 })
  })('omits credentials when proxy identity disabled', ({ username, password, host, port }) => {
    const config: ProxyConfig = {
      type: 'HTTP',
      host,
      port,
      enableProxyIdentity: false,
      username,
      password
    }

    const url = buildProxyUrl(config)
    const parsed = new URL(url)

    expect(parsed.username).toBe('')
    expect(parsed.password).toBe('')
    expect(parsed.hostname).toBe(host)
    expect(Number(parsed.port)).toBe(port)
  })

  test.prop({
    host: fc.oneof(fc.domain(), fc.ipV4()),
    port: fc.integer({ min: 1, max: 65535 })
  })('handles missing credentials gracefully', ({ host, port }) => {
    const config: ProxyConfig = {
      type: 'HTTP',
      host,
      port,
      enableProxyIdentity: true
    }

    const url = buildProxyUrl(config)
    const parsed = new URL(url)

    expect(parsed.username).toBe('')
    expect(parsed.password).toBe('')
  })
})
