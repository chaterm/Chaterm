import { describe, expect, it, vi } from 'vitest'

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createMock } }
  }
}))

import { parseAssistantMessageV2 } from '../../../core/assistant-message'
import { NATIVE_MESSAGE_MARKER } from '../../../shared/native-tools'
import { DeepSeekHandler, buildNativeToolXml, buildNativeTools } from '../deepseek'

function streamEvents() {
  return (async function* () {
    yield { choices: [{ delta: { content: 'Checking.' } }] }
    yield {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                function: { name: 'execute_command', arguments: '{"command":"ls' }
              }
            ]
          }
        }
      ]
    }
    yield {
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: ' -la","ip":"10.0.0.1"}' } }]
          }
        }
      ]
    }
    yield { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
  })()
}

async function collect(handler: DeepSeekHandler) {
  const chunks: any[] = []
  for await (const chunk of handler.createMessage('<execute_command>legacy docs</execute_command>', [
    { role: 'user', content: [{ type: 'text', text: 'run it' }] }
  ])) {
    chunks.push(chunk)
  }
  return chunks
}

describe('DeepSeek native tool calls', () => {
  it('passes native tools and converts streamed tool calls into XML', async () => {
    createMock.mockReset()
    createMock.mockResolvedValue(streamEvents())

    const handler = new DeepSeekHandler({
      apiModelId: 'deepseek-flash',
      deepSeekApiKey: 'test-key',
      useNativeTools: true,
      workspace: 'server'
    })
    const chunks = await collect(handler)

    const request = createMock.mock.calls[0][0]
    expect(request.tools?.length).toBeGreaterThan(0)
    expect(request.tool_choice).toBe('required')
    expect(request.thinking).toEqual({ type: 'disabled' })
    expect(request.messages[0].content).toContain('Native tool calling')

    const text = chunks
      .filter((chunk) => chunk.type === 'text')
      .map((chunk) => chunk.text)
      .join('')
    expect(text).not.toContain('Checking.')
    expect(text).toContain(NATIVE_MESSAGE_MARKER)

    const blocks = parseAssistantMessageV2(text)
    expect(blocks).toContainEqual({
      type: 'tool_use',
      name: 'execute_command',
      params: { command: 'ls -la', ip: '10.0.0.1' },
      partial: false
    })
  })

  it('keeps the XML path when native tools are disabled', async () => {
    createMock.mockReset()
    createMock.mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: 'plain answer' } }] }
      })()
    )

    const handler = new DeepSeekHandler({
      apiModelId: 'deepseek-flash',
      deepSeekApiKey: 'test-key',
      useNativeTools: false
    })
    await collect(handler)

    const request = createMock.mock.calls[0][0]
    expect(request.tools).toBeUndefined()
    expect(request.messages[0].content).not.toContain('Native tool calling')
  })

  it('filters native tool schemas by workspace', () => {
    const serverTools = buildNativeTools('server').flatMap((tool) => ('function' in tool ? [tool.function.name] : []))
    expect(serverTools).toContain('execute_command')
    expect(serverTools).not.toContain('list_databases')
  })

  it('drops arguments that are not registered for the tool', () => {
    const xml = buildNativeToolXml({
      id: 'call_2',
      name: 'execute_command',
      arguments: '{"command":"echo <x>","not_a_param":"ignored"}'
    })

    expect(xml).toContain('<command>')
    expect(xml).not.toContain('not_a_param')
    expect(parseAssistantMessageV2(`${NATIVE_MESSAGE_MARKER}${xml}`)).toEqual([
      {
        type: 'tool_use',
        name: 'execute_command',
        params: { command: 'echo <x>' },
        partial: false
      }
    ])
  })
})
