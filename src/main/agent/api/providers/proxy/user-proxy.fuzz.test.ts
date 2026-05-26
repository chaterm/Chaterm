/**
 * Property-based fuzz tests for proxy URL construction.
 *
 * These tests use fast-check to generate random inputs and verify that:
 * 1. Special characters in credentials (@, :, /, #, spaces, unicode) are properly encoded
 * 2. The resulting URL is always parseable and round-trips correctly
 * 3. Credentials are only included when explicitly enabled
 *
 */

import { describe, expect } from 'vitest'
import { test, fc } from '@fast-check/vitest'
import { buildProxyUrl } from './user-proxy'
import type { ProxyConfig } from '@shared/Proxy'

describe('buildProxyUrl property tests', () => {
  // Verify credentials with special chars don't break URL structure
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

    // Round-trip: decode should recover original values
    if (username && password) {
      expect(url).toContain(`${encodeURIComponent(username)}:${encodeURIComponent(password)}@`)
      expect(decodeURIComponent(parsed.username)).toBe(username)
      expect(decodeURIComponent(parsed.password)).toBe(password)
    }
  })

  // Ensure credentials are never leaked when identity is disabled
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

  // Edge case: enableProxyIdentity=true but credentials undefined
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
