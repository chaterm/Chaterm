/**
 * undici dispatcher creation for AI provider requests
 *
 * The AI SDKs (OpenAI, Anthropic) resolve their default fetch to globalThis.fetch,
 * which is undici in the Electron main process. undici's fetch ignores the legacy
 * `agent` option entirely and only honours `dispatcher`, so proxy configuration
 * must be passed as a dispatcher. undici v7's fetch additionally rejects
 * dispatchers created by a different undici copy, which is why providers must use
 * the fetch exported from this package together with these dispatchers.
 */

import { ProxyAgent, type Dispatcher } from 'undici'
import type { ProxyConfig } from '@shared/Proxy'
import { buildProxyUrl } from './user-proxy'

const logger = createLogger('agent')

// undici's ProxyAgent accepts http/https/socks5 URIs only. SOCKS4 would fail
// inside the constructor with an opaque "Invalid URL protocol" error, taking
// down the whole handler, so it is rejected with an actionable message instead.
const SOCKS4_UNSUPPORTED_MESSAGE = 'SOCKS4 proxy is not supported for AI providers. Please use SOCKS5, HTTP, or HTTPS.'

const dispatcherCache = new Map<string, Dispatcher>()

function createDispatcherForUri(uri: string): Dispatcher {
  if (uri.startsWith('socks4://')) {
    throw new Error(SOCKS4_UNSUPPORTED_MESSAGE)
  }
  return new ProxyAgent(uri)
}

function getCachedDispatcher(uri: string): Dispatcher {
  const cached = dispatcherCache.get(uri)
  if (cached) return cached
  const created = createDispatcherForUri(uri)
  dispatcherCache.set(uri, created)
  return created
}

/**
 * Get a dispatcher for a user-configured proxy.
 * Dispatchers are cached by proxy URL, since buildApiHandler runs per request
 * and every dispatcher owns its own connection pool.
 * @throws when the proxy type is SOCKS4
 */
export function getSharedDispatcher(config?: ProxyConfig): Dispatcher | undefined {
  if (!config) return undefined
  return getCachedDispatcher(buildProxyUrl(config))
}

/**
 * Get a dispatcher for an Electron system proxy string
 * (e.g. "PROXY 127.0.0.1:7890", "SOCKS5 127.0.0.1:1080").
 * Returns undefined when the string cannot be used, so callers fall back to a
 * direct connection rather than failing the request.
 */
export function getSharedDispatcherFromString(proxyString: string): Dispatcher | undefined {
  const match = proxyString.match(/^(PROXY|SOCKS4|SOCKS5|HTTPS)\s+(.+):(\d+)/)
  if (!match) {
    logger.error('[Proxy] Invalid proxy string format', { event: 'proxy.dispatcher.parse.error' })
    return undefined
  }

  const [, type, host, port] = match
  if (type === 'SOCKS4') {
    logger.warn('[Proxy] SOCKS4 system proxy is not supported by undici, falling back to direct connection', {
      event: 'proxy.dispatcher.socks4.unsupported'
    })
    return undefined
  }

  const scheme = type === 'SOCKS5' ? 'socks5' : 'http'
  try {
    return getCachedDispatcher(`${scheme}://${host}:${port}`)
  } catch (error) {
    logger.error('[Proxy] Failed to create dispatcher from system proxy', {
      event: 'proxy.dispatcher.create.error',
      message: (error as Error)?.message
    })
    return undefined
  }
}

/**
 * Close every cached dispatcher and drop the cache.
 * Called on application quit to release pooled sockets.
 */
export async function closeAllDispatchers(): Promise<void> {
  const dispatchers = [...dispatcherCache.values()]
  dispatcherCache.clear()
  await Promise.allSettled(dispatchers.map((dispatcher) => dispatcher.close()))
}
