import { afterEach, describe, expect, it } from 'vitest'
import type { ProxyConfig } from '@shared/Proxy'
import { closeAllDispatchers, getSharedDispatcher, getSharedDispatcherFromString, shouldUseProxy } from './undici-dispatcher'

const config = (type: string, port = 8118): ProxyConfig => ({ type, host: '127.0.0.1', port })

describe('getSharedDispatcher', () => {
  afterEach(async () => {
    await closeAllDispatchers()
  })

  it('returns undefined when no proxy is configured', () => {
    expect(getSharedDispatcher(undefined)).toBeUndefined()
  })

  it.each(['HTTP', 'HTTPS', 'SOCKS5'])('creates a dispatcher for %s', (type) => {
    expect(getSharedDispatcher(config(type))).toBeDefined()
  })

  // undici's ProxyAgent throws an opaque "Invalid URL protocol" error for
  // socks4:// URIs, which would break the whole handler construction.
  it('rejects SOCKS4 with an actionable message', () => {
    expect(() => getSharedDispatcher(config('SOCKS4'))).toThrow(/SOCKS4 proxy is not supported/)
  })

  it('reuses one dispatcher per proxy URL', () => {
    const first = getSharedDispatcher(config('HTTP'))
    const second = getSharedDispatcher(config('HTTP'))
    const other = getSharedDispatcher(config('HTTP', 8119))

    expect(second).toBe(first)
    expect(other).not.toBe(first)
  })

  it('creates a new dispatcher after the cache is closed', async () => {
    const first = getSharedDispatcher(config('HTTP'))
    await closeAllDispatchers()

    expect(getSharedDispatcher(config('HTTP'))).not.toBe(first)
  })
})

describe('shouldUseProxy', () => {
  const proxyConfig = config('HTTP')

  it('opts in when a proxy is configured and not explicitly disabled', () => {
    expect(shouldUseProxy({ proxyConfig })).toBe(true)
    expect(shouldUseProxy({ needProxy: true, proxyConfig })).toBe(true)
  })

  it('opts out when explicitly disabled', () => {
    expect(shouldUseProxy({ needProxy: false, proxyConfig })).toBe(false)
  })

  // The old split logic would route requests through a proxy that was never
  // connectivity-checked, or check a proxy that no request would use.
  it('opts out when no proxy is configured, whatever needProxy says', () => {
    expect(shouldUseProxy({})).toBe(false)
    expect(shouldUseProxy({ needProxy: true })).toBe(false)
  })
})

describe('getSharedDispatcherFromString', () => {
  afterEach(async () => {
    await closeAllDispatchers()
  })

  it.each(['PROXY 127.0.0.1:7890', 'HTTPS 127.0.0.1:7890', 'SOCKS5 127.0.0.1:1080'])('creates a dispatcher for "%s"', (proxyString) => {
    expect(getSharedDispatcherFromString(proxyString)).toBeDefined()
  })

  // Falling back to a direct connection is preferred over failing the request,
  // since the system proxy is detected rather than chosen by the user.
  it('falls back to direct connection for SOCKS4', () => {
    expect(getSharedDispatcherFromString('SOCKS4 127.0.0.1:1080')).toBeUndefined()
  })

  it('falls back to direct connection for unparseable strings', () => {
    expect(getSharedDispatcherFromString('DIRECT')).toBeUndefined()
  })
})
