import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/chaterm-external-mcp-test',
    getAppPath: () => process.cwd(),
    setPath: () => undefined,
    isPackaged: false
  }
}))

vi.mock('../execution-service', () => ({
  RemoteExecutionService: class {
    reset() {
      return undefined
    }
    async dispose() {
      return Promise.resolve()
    }
  }
}))

import { createServer, type Server } from 'node:http'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ExternalMcpServer } from '../server'

describe('ExternalMcpServer', () => {
  let server: ExternalMcpServer

  beforeEach(async () => {
    server = new ExternalMcpServer(
      async () =>
        ({
          listMcpTargets: () => [{ target_id: 'asset-1', name: 'test', host: '127.0.0.1', port: 22, connection_type: 'ssh', group: null }],
          getMcpTarget: () => null
        }) as any,
      '/tmp/chaterm-external-mcp-test/external-mcp.json'
    )
  })

  it('serves only the two Chaterm tools over Streamable HTTP without credentials', async () => {
    await server.setEnabled(true)
    const status = server.status()
    expect(status).toEqual({ enabled: true, endpoint: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/) })

    const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: { elicitation: {} } })
    const transport = new StreamableHTTPClientTransport(new URL(status.endpoint!))
    await client.connect(transport)
    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name)).toEqual(['chaterm_list_targets', 'chaterm_exec'])
    await client.close()
    await server.dispose()
  })

  it('rejects requests from a foreign browser origin', async () => {
    await server.setEnabled(true)
    const status = server.status()
    const response = await fetch(status.endpoint!, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    })
    expect(response.status).toBe(403)
    await server.dispose()
  })

  it('reports no endpoint once disabled', async () => {
    await server.setEnabled(true)
    expect(await server.setEnabled(false)).toEqual({ enabled: false, endpoint: null })
  })

  describe('port selection', () => {
    const targets = async () => ({ listMcpTargets: () => [], getMcpTarget: () => null }) as any
    const blockers: Server[] = []
    let runtimePath: string

    const occupy = (port: number) =>
      new Promise<void>((resolve, reject) => {
        const blocker = createServer()
        blocker.once('error', reject)
        blocker.listen(port, '127.0.0.1', () => {
          blockers.push(blocker)
          resolve()
        })
      })
    // A port whose next few neighbours are free, so tests do not depend on 9727 being free on this machine
    const freeBase = async () => {
      for (;;) {
        const probe = createServer()
        await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', () => resolve()))
        const port = (probe.address() as { port: number }).port
        await new Promise<void>((resolve) => probe.close(() => resolve()))
        if (port < 65000) return port
      }
    }
    const portOf = (s: ExternalMcpServer) => Number(new URL(s.status().endpoint!).port)

    beforeEach(() => {
      runtimePath = join(mkdtempSync(join(tmpdir(), 'chaterm-external-mcp-')), 'external-mcp.json')
    })
    afterEach(async () => {
      for (const blocker of blockers.splice(0)) await new Promise<void>((resolve) => blocker.close(() => resolve()))
    })

    it('defaults to the fixed port 9727', () => {
      expect((new ExternalMcpServer(targets, runtimePath) as any).preferredPort).toBe(9727)
    })

    it('binds the preferred port when it is free and persists it', async () => {
      const base = await freeBase()
      const s = new ExternalMcpServer(targets, runtimePath, base)
      await s.setEnabled(true)
      expect(portOf(s)).toBe(base)
      expect(JSON.parse(readFileSync(runtimePath, 'utf8'))).toEqual({ enabled: true, port: base })
      await s.dispose()
    })

    it('steps +1 from the preferred port while ports are occupied', async () => {
      const base = await freeBase()
      await occupy(base)
      await occupy(base + 1)
      const s = new ExternalMcpServer(targets, runtimePath, base)
      await s.setEnabled(true)
      expect(portOf(s)).toBe(base + 2)
      await s.dispose()
    })

    it('reuses the remembered fallback port after a restart while the preferred port stays busy', async () => {
      const base = await freeBase()
      await occupy(base)
      writeFileSync(runtimePath, JSON.stringify({ enabled: true, port: base + 3 }))
      const s = new ExternalMcpServer(targets, runtimePath, base)
      await s.start()
      expect(portOf(s)).toBe(base + 3)
      await s.dispose()
    })

    it('steps +1 from the remembered port when both it and the preferred port are busy', async () => {
      const base = await freeBase()
      await occupy(base)
      await occupy(base + 3)
      writeFileSync(runtimePath, JSON.stringify({ enabled: true, port: base + 3 }))
      const s = new ExternalMcpServer(targets, runtimePath, base)
      await s.start()
      expect(portOf(s)).toBe(base + 4)
      await s.dispose()
    })

    it('returns to the preferred port once it is free again', async () => {
      const base = await freeBase()
      writeFileSync(runtimePath, JSON.stringify({ enabled: true, port: base + 3 }))
      const s = new ExternalMcpServer(targets, runtimePath, base)
      await s.start()
      expect(portOf(s)).toBe(base)
      await s.dispose()
    })

    it('keeps the same port across disable and enable', async () => {
      const base = await freeBase()
      await occupy(base)
      const s = new ExternalMcpServer(targets, runtimePath, base)
      await s.setEnabled(true)
      expect(portOf(s)).toBe(base + 1)
      await s.setEnabled(false)
      expect(JSON.parse(readFileSync(runtimePath, 'utf8')).port).toBe(base + 1)
      await s.setEnabled(true)
      expect(portOf(s)).toBe(base + 1)
      await s.dispose()
    })

    it('ignores an invalid remembered port', async () => {
      const base = await freeBase()
      writeFileSync(runtimePath, JSON.stringify({ enabled: true, port: 'abc' }))
      const s = new ExternalMcpServer(targets, runtimePath, base)
      await s.start()
      expect(portOf(s)).toBe(base)
      await s.dispose()
    })

    it('fails when every candidate port is occupied', async () => {
      await occupy(65535)
      const s = new ExternalMcpServer(targets, runtimePath, 65535)
      await expect(s.setEnabled(true)).rejects.toThrow('No free port for external MCP server')
    })

    it('rethrows bind errors other than EADDRINUSE', async () => {
      const s = new ExternalMcpServer(targets, runtimePath, 70000)
      await expect(s.setEnabled(true)).rejects.toThrow()
    })
  })
})
