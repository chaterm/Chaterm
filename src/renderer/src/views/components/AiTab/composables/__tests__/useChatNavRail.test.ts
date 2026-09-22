import { describe, it, expect } from 'vitest'
import {
  extractNavLabel,
  stripLeadingTerminalOutput,
  isStoredUserTurn,
  buildStoredNavNodes,
  buildNavNodes,
  resolveActivePairIndex
} from '../useChatNavRail'
import type { UserAssistantPair } from '../useSessionState'
import type { ChatMessage } from '../../types'

function msg(overrides: Partial<ChatMessage> & { id: string }): ChatMessage {
  return {
    role: 'user',
    content: '',
    ...overrides
  } as ChatMessage
}

function pair(user: ChatMessage | undefined, assistants: ChatMessage[] = []): UserAssistantPair {
  return {
    user: user ? { message: user, historyIndex: 0 } : undefined,
    assistants: assistants.map((message, i) => ({ message, historyIndex: i + 1 }))
  }
}

describe('extractNavLabel', () => {
  it('collapses whitespace and newlines into a single line', () => {
    expect(extractNavLabel(msg({ id: 'a', content: 'how do I\n\n  restart it' }))).toBe('how do I restart it')
  })

  it('reads the question field of structured content', () => {
    const label = extractNavLabel(msg({ id: 'a', content: { question: 'which host?' } } as Partial<ChatMessage> & { id: string }))
    expect(label).toBe('which host?')
  })

  it('keeps enough text to fill the three-line preview card', () => {
    expect(extractNavLabel(msg({ id: 'a', content: 'x'.repeat(150) }))).toHaveLength(150)
  })

  it('truncates labels beyond the preview card capacity', () => {
    const label = extractNavLabel(msg({ id: 'a', content: 'x'.repeat(400) }))
    expect(label).toHaveLength(163)
    expect(label.endsWith('...')).toBe(true)
  })
})

describe('stripLeadingTerminalOutput', () => {
  it('keeps the question that follows a pasted terminal block', () => {
    const raw = 'Terminal output:\n```\ndocker ps\nCONTAINER ID  IMAGE\n```\n我要怎么登录数据库？'
    expect(stripLeadingTerminalOutput(raw)).toBe('我要怎么登录数据库？')
  })

  it('leaves text alone when there is no leading terminal block', () => {
    expect(stripLeadingTerminalOutput('restart nginx')).toBe('restart nginx')
  })

  it('keeps the original when nothing follows the terminal block', () => {
    const raw = 'Terminal output:\n```\ndocker ps\n```'
    expect(stripLeadingTerminalOutput(raw)).toBe(raw)
  })

  it('labels an opening turn with the question, not the pasted output', () => {
    const nodes = buildStoredNavNodes([{ ts: 1, type: 'say', say: 'text', text: 'Terminal output:\n```\ndocker ps\n```\n怎么登录？' }])
    expect(nodes[0].label).toBe('怎么登录？')
  })
})

describe('isStoredUserTurn', () => {
  it('accepts a prompt the user sent', () => {
    expect(isStoredUserTurn({ say: 'user_feedback', text: 'restart nginx' }, 4)).toBe(true)
  })

  it('rejects terminal output re-attributed to the assistant', () => {
    expect(isStoredUserTurn({ say: 'user_feedback', text: 'Terminal output: ```...```' }, 4)).toBe(false)
  })

  it('accepts the opening message of the conversation', () => {
    expect(isStoredUserTurn({ type: 'say', say: 'text', text: 'hello' }, 0)).toBe(true)
  })

  it('rejects assistant text later in the conversation', () => {
    expect(isStoredUserTurn({ type: 'say', say: 'text', text: 'hello' }, 3)).toBe(false)
  })

  it('rejects commands, output and reasoning', () => {
    expect(isStoredUserTurn({ type: 'say', say: 'command', text: 'ls -al' }, 2)).toBe(false)
    expect(isStoredUserTurn({ type: 'say', say: 'command_output', text: 'total 0' }, 2)).toBe(false)
    expect(isStoredUserTurn({ type: 'say', say: 'reasoning', text: 'thinking' }, 2)).toBe(false)
  })
})

describe('buildStoredNavNodes', () => {
  it('indexes only user turns, oldest first', () => {
    const nodes = buildStoredNavNodes([
      { ts: 1, type: 'say', say: 'text', text: 'first prompt' },
      { ts: 2, type: 'say', say: 'command', text: 'ls' },
      { ts: 3, say: 'user_feedback', text: 'second prompt' },
      { ts: 4, say: 'user_feedback', text: 'Terminal output: x' }
    ])
    expect(nodes.map((n) => n.ts)).toEqual([1, 3])
    expect(nodes.map((n) => n.label)).toEqual(['first prompt', 'second prompt'])
    expect(nodes.every((n) => n.pairIndex === -1)).toBe(true)
  })

  it('skips a message with no timestamp to key it by', () => {
    expect(buildStoredNavNodes([{ say: 'user_feedback', text: 'no ts' }])).toEqual([])
  })
})

describe('buildNavNodes', () => {
  it('emits one node per rendered user turn and ignores assistants', () => {
    const nodes = buildNavNodes([
      pair(msg({ id: 'u1', ts: 10, content: 'first' }), [msg({ id: 'a1', role: 'assistant', say: 'command' })]),
      pair(msg({ id: 'u2', ts: 20, content: 'second' }))
    ])
    expect(nodes).toEqual([
      { ts: 10, label: 'first', pairIndex: 0 },
      { ts: 20, label: 'second', pairIndex: 1 }
    ])
  })

  it('skips a pair that carries no user message', () => {
    expect(buildNavNodes([pair(undefined, [msg({ id: 'a1', role: 'assistant', say: 'text' })])])).toEqual([])
  })

  it('keeps stored turns that are not paged in yet', () => {
    const nodes = buildNavNodes([pair(msg({ id: 'u2', ts: 20, content: 'loaded' }))], [{ ts: 10, label: 'older', pairIndex: -1 }])
    expect(nodes).toEqual([
      { ts: 10, label: 'older', pairIndex: -1 },
      { ts: 20, label: 'loaded', pairIndex: 0 }
    ])
  })

  it('lets a rendered turn supply the pair index of its stored twin', () => {
    const nodes = buildNavNodes([pair(msg({ id: 'u1', ts: 10, content: 'rendered' }))], [{ ts: 10, label: 'stored', pairIndex: -1 }])
    expect(nodes).toEqual([{ ts: 10, label: 'rendered', pairIndex: 0 }])
  })

  it('keeps a live turn that has no timestamp yet', () => {
    const nodes = buildNavNodes([pair(msg({ id: 'u1', content: 'sending' }))], [{ ts: 10, label: 'stored', pairIndex: -1 }])
    expect(nodes.map((n) => n.label)).toEqual(['sending', 'stored'])
  })
})

describe('resolveActivePairIndex', () => {
  const tops = [0, 400, 900, 1500]

  it('returns the first pair at the top of the conversation', () => {
    expect(resolveActivePairIndex(tops, 0)).toBe(0)
  })

  it('advances once the next pair crosses the active line', () => {
    expect(resolveActivePairIndex(tops, 319)).toBe(0)
    expect(resolveActivePairIndex(tops, 320)).toBe(1)
    expect(resolveActivePairIndex(tops, 830)).toBe(2)
  })

  it('stays on the last pair when scrolled to the bottom', () => {
    expect(resolveActivePairIndex(tops, 5000)).toBe(3)
  })

  it('keeps the first pair active when scrolled above the active line', () => {
    expect(resolveActivePairIndex([200, 600], 0)).toBe(0)
  })

  it('returns -1 before anything has been measured', () => {
    expect(resolveActivePairIndex([], 0)).toBe(-1)
  })
})
