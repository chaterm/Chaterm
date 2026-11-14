import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { createChatDb } from './helpers/chatSchema'

vi.mock('@logging/index', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
}))

const { buildForkTaskLogic, saveChatermMessagesLogic, saveApiConversationHistoryLogic, saveTaskMetadataLogic, saveContextHistoryLogic } =
  await import('../agent')

const SOURCE = 'source-task'
const TARGET = 'fork-task'

const hostA = [{ host: '10.0.0.1', uuid: 'a', connection: 'personal' }]
const hostB = [{ host: '10.0.0.2', uuid: 'b', connection: 'personal' }]

/**
 * Two completed turns:
 *   turn 1 (ts 100-103): user prompt, api request, plain-text answer, empty completion marker
 *   turn 2 (ts 200-203): feedback, api request, attempt_completion result, empty completion marker
 */
const sourceMessages = [
  { ts: 100, type: 'say', say: 'text', text: 'check disk', conversationHistoryIndex: 0, hosts: hostA },
  { ts: 101, type: 'say', say: 'api_req_started', text: '{}', conversationHistoryIndex: 1, hosts: hostA },
  { ts: 102, type: 'say', say: 'text', text: 'Disk is fine', conversationHistoryIndex: 1, hosts: hostA },
  { ts: 103, type: 'ask', ask: 'completion_result', text: '', conversationHistoryIndex: 2, hosts: hostA },
  { ts: 200, type: 'say', say: 'user_feedback', text: 'check memory', conversationHistoryIndex: 2, hosts: hostB },
  { ts: 201, type: 'say', say: 'api_req_started', text: '{}', conversationHistoryIndex: 3, hosts: hostB },
  { ts: 202, type: 'say', say: 'completion_result', text: 'Memory is fine', conversationHistoryIndex: 3, hosts: hostB },
  { ts: 203, type: 'ask', ask: 'completion_result', text: '', conversationHistoryIndex: 4, hosts: hostB }
]

const sourceApiHistory = [
  { role: 'user', content: [{ type: 'text', text: 'check disk' }] },
  { role: 'assistant', content: [{ type: 'text', text: 'Disk is fine' }] },
  { role: 'user', content: [{ type: 'text', text: 'check memory' }] },
  { role: 'assistant', content: [{ type: 'text', text: 'Memory is fine' }] }
]

const seedSource = async (db: Database.Database, contextHistory?: unknown) => {
  await saveChatermMessagesLogic(db, SOURCE, sourceMessages)
  await saveApiConversationHistoryLogic(db, SOURCE, sourceApiHistory)
  await saveTaskMetadataLogic(db, SOURCE, {
    title: 'Server health',
    favorite: true,
    hosts: hostB,
    todos: [{ id: 't1', content: 'later' }],
    model_usage: [{ model_id: 'm', mode: 'agent' }]
  })
  if (contextHistory !== undefined) {
    await saveContextHistoryLogic(db, SOURCE, contextHistory)
  }
}

const countRows = (db: Database.Database, taskId: string) =>
  ['agent_ui_messages_v1', 'agent_api_conversation_history_v1', 'agent_task_metadata_v1', 'agent_context_history_v1'].map(
    (table) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE task_id = ?`).get(taskId) as { n: number }).n
  )

describe('buildForkTaskLogic', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createChatDb()
  })

  it('copies the conversation up to the selected completion and normalises the boundary', async () => {
    await seedSource(db)

    const payload = await buildForkTaskLogic(db, SOURCE, TARGET, 103)

    expect(payload.taskId).toBe(TARGET)
    expect(payload.title).toBe('Server health (Fork)')
    // The plain-text answer becomes the completion block and the empty marker is not duplicated
    expect(payload.messages.map((m) => [m.ts, m.say])).toEqual([
      [100, 'text'],
      [101, 'api_req_started'],
      [102, 'completion_result']
    ])
    expect(payload.messages.at(-1)?.ask).toBeUndefined()
    expect(payload.apiHistory).toEqual(sourceApiHistory.slice(0, 2))
    expect(payload.metadata).toMatchObject({ title: 'Server health (Fork)', favorite: false, todos: [{ id: 't1', content: 'later' }] })
  })

  it('does not read or write the target task while building', async () => {
    await seedSource(db)

    await buildForkTaskLogic(db, SOURCE, TARGET, 103)

    expect(countRows(db, TARGET)).toEqual([0, 0, 0, 0])
  })

  it('restores the hosts of the selected boundary instead of the ones the source ended with', async () => {
    await seedSource(db)

    const early = await buildForkTaskLogic(db, SOURCE, TARGET, 103)
    const late = await buildForkTaskLogic(db, SOURCE, TARGET, 203)

    expect(early.metadata.hosts).toEqual(hostA)
    expect(late.metadata.hosts).toEqual(hostB)
  })

  it('leaves the hosts empty when no message up to the boundary recorded any', async () => {
    await saveChatermMessagesLogic(db, SOURCE, [
      { ts: 100, type: 'say', say: 'text', text: 'hi', conversationHistoryIndex: 0 },
      { ts: 101, type: 'say', say: 'completion_result', text: 'hello', conversationHistoryIndex: 1 }
    ])
    await saveApiConversationHistoryLogic(db, SOURCE, sourceApiHistory.slice(0, 2))
    await saveTaskMetadataLogic(db, SOURCE, { title: 'Old task', hosts: hostB })

    const payload = await buildForkTaskLogic(db, SOURCE, TARGET, 101)

    expect(payload.metadata.hosts).toEqual([])
  })

  it('uses an explicit title and falls back to a default for untitled sources', async () => {
    await seedSource(db)
    expect((await buildForkTaskLogic(db, SOURCE, TARGET, 103, '  Branch  ')).title).toBe('Branch')

    await saveTaskMetadataLogic(db, SOURCE, { title: '   ' })
    expect((await buildForkTaskLogic(db, SOURCE, TARGET, 103)).title).toBe('New chat (Fork)')
  })

  it('copies the whole conversation when no boundary is given', async () => {
    await seedSource(db)

    const payload = await buildForkTaskLogic(db, SOURCE, TARGET)

    expect(payload.messages).toHaveLength(sourceMessages.length - 1)
    expect(payload.apiHistory).toEqual(sourceApiHistory)
  })

  it('appends the completion text to the API history when it ends on a user turn', async () => {
    await saveChatermMessagesLogic(db, SOURCE, [
      { ts: 100, type: 'say', say: 'text', text: 'hi', conversationHistoryIndex: 0 },
      { ts: 101, type: 'say', say: 'completion_result', text: 'hello', conversationHistoryIndex: 1 }
    ])
    await saveApiConversationHistoryLogic(db, SOURCE, sourceApiHistory.slice(0, 1))

    const payload = await buildForkTaskLogic(db, SOURCE, TARGET, 101)

    expect(payload.apiHistory).toEqual([sourceApiHistory[0], { role: 'assistant', content: [{ type: 'text', text: 'hello' }] }])
  })

  describe('rejects', () => {
    beforeEach(async () => {
      await seedSource(db)
    })

    it.each([
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['a string', '103'],
      ['null', null]
    ])('a boundary that is %s instead of copying everything', async (_label, cutoff) => {
      await expect(buildForkTaskLogic(db, SOURCE, TARGET, cutoff as unknown as number)).rejects.toThrow('Invalid fork boundary')
    })

    it('a boundary before the first message', async () => {
      await expect(buildForkTaskLogic(db, SOURCE, TARGET, 50)).rejects.toThrow('Fork boundary was not found')
    })

    it('a boundary without a position in the API history', async () => {
      const bare = [{ ts: 100, type: 'say', say: 'text', text: 'hi' }]
      await saveChatermMessagesLogic(db, 'bare-task', bare)
      await saveApiConversationHistoryLogic(db, 'bare-task', sourceApiHistory)

      await expect(buildForkTaskLogic(db, 'bare-task', TARGET, 100)).rejects.toThrow('Fork boundary has no API history position')
    })

    it.each([
      ['an empty source', '', TARGET],
      ['an empty target', SOURCE, ''],
      ['the same task as source and target', SOURCE, SOURCE]
    ])('%s', async (_label, source, target) => {
      await expect(buildForkTaskLogic(db, source, target, 103)).rejects.toThrow('Invalid fork task identifiers')
    })

    it('a source without any history', async () => {
      await expect(buildForkTaskLogic(db, 'unknown-task', TARGET, 103)).rejects.toThrow('Source task has no conversation history')
    })

    it('a target that already exists', async () => {
      await saveTaskMetadataLogic(db, TARGET, { title: 'taken' })
      await expect(buildForkTaskLogic(db, SOURCE, TARGET, 103)).rejects.toThrow('Fork target already exists')
    })
  })

  describe('context history', () => {
    const notice = (timestamp: number) => ({ version: 2, truncationNotice: { timestamp, text: 'summary' } })

    it('is carried over whole when the entire conversation is copied', async () => {
      await seedSource(db, notice(500))

      const payload = await buildForkTaskLogic(db, SOURCE, TARGET)

      expect(payload.contextHistory).toEqual(notice(500))
    })

    it('is null when the source has none', async () => {
      await seedSource(db)

      expect((await buildForkTaskLogic(db, SOURCE, TARGET, 103)).contextHistory).toBeNull()
    })

    it('is kept when a request after the summary started within the fork boundary', async () => {
      // The summary was stored against the request at ts 101 and produced by the one at ts 201
      await seedSource(db, notice(101))

      expect((await buildForkTaskLogic(db, SOURCE, TARGET, 203)).contextHistory).toEqual(notice(101))
    })

    it('is dropped when the request that produced the summary lies beyond the fork boundary', async () => {
      await seedSource(db, notice(101))

      expect((await buildForkTaskLogic(db, SOURCE, TARGET, 103)).contextHistory).toBeNull()
    })

    it('is dropped when the format cannot be tied to a boundary', async () => {
      await seedSource(db, [[1, ['text', [[0, [[100, 'summary', ['legacy'], {}]]]]]]])

      expect((await buildForkTaskLogic(db, SOURCE, TARGET, 203)).contextHistory).toBeNull()
    })

    it('is dropped when a version 2 history holds no truncation notice', async () => {
      await seedSource(db, { version: 2, truncationNotice: null })

      expect((await buildForkTaskLogic(db, SOURCE, TARGET, 203)).contextHistory).toBeNull()
    })
  })
})
