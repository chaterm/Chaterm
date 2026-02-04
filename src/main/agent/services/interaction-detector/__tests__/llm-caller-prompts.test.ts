import { describe, it, expect } from 'vitest'
import { createLlmCaller } from '../llm-caller'

describe('interaction-detector LLM prompts', () => {
  it('includes pager rules and no-null requirement in zh prompt', async () => {
    let capturedUser = ''
    const caller = createLlmCaller(async (_system, user) => {
      capturedUser = user
      return '{"needsInteraction":false,"interactionType":"freeform","promptHint":""}'
    })

    await caller('journalctl -b', 'lines 1-23', 'zh-CN')

    expect(capturedUser).toContain('lines X-Y')
    expect(capturedUser).toContain('lines X-Y/Z')
    expect(capturedUser).toContain('不得为 null')
    expect(capturedUser).toContain('删除')
  })
})
