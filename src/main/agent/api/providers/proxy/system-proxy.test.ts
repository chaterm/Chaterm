import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from 'node:http'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { createProxyAgentFromString } from './system-proxy'

vi.mock('electron', () => ({ session: { defaultSession: { resolveProxy: vi.fn() } } }))

vi.mock('@logging/index', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

describe('createProxyAgentFromString', () => {
  const agents: Agent[] = []

  afterEach(() => {
    for (const agent of agents) agent.destroy()
    agents.length = 0
  })

  it.each([
    ['HTTPS', 'https:'],
    ['PROXY', 'http:']
  ])('uses %s as the protocol for connecting to the proxy', (type, protocol) => {
    const agent = createProxyAgentFromString(`${type} proxy.example:8443`)
    if (agent) agents.push(agent)

    expect(agent).toBeInstanceOf(HttpsProxyAgent)
    // Both schemes use HttpsProxyAgent; its proxy URL selects TLS vs plaintext.
    expect((agent as HttpsProxyAgent<string>).proxy).toMatchObject({
      protocol,
      hostname: 'proxy.example',
      port: '8443'
    })
  })

  it.each(['SOCKS4', 'SOCKS5'])('continues to create an agent for %s', (type) => {
    const agent = createProxyAgentFromString(`${type} 127.0.0.1:1080`)
    if (agent) agents.push(agent)

    expect(agent).toBeInstanceOf(SocksProxyAgent)
  })

  it.each(['DIRECT', '', 'HTTPS proxy.example', 'HTTPS proxy.example:invalid'])('returns undefined for "%s"', (proxyString) => {
    expect(createProxyAgentFromString(proxyString)).toBeUndefined()
  })
})
