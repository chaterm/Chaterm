import { describe, it, expect, vi } from 'vitest'

vi.mock('better-sqlite3', () => ({
  default: class {}
}))

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234'
}))

interface Snippet {
  id: number
  uuid: string
  snippet_name: string
  snippet_content: string
  group_uuid: string | null
  sort_order: number
  updated_at: string
}

interface FakeStmt {
  all?: () => Snippet[]
  run: (...args: unknown[]) => { changes: number }
}

const createDb = () => {
  const snippets: Snippet[] = [
    { id: 1, uuid: 'uuid-1', snippet_name: 'cmd1', snippet_content: 'ls', group_uuid: null, sort_order: 10, updated_at: '1' },
    { id: 2, uuid: 'uuid-2', snippet_name: 'cmd2', snippet_content: 'pwd', group_uuid: null, sort_order: 20, updated_at: '1' },
    { id: 3, uuid: 'uuid-3', snippet_name: 'cmd3', snippet_content: 'cd', group_uuid: null, sort_order: 30, updated_at: '1' },
    { id: 4, uuid: 'uuid-4', snippet_name: 'grp-cmd1', snippet_content: 'echo', group_uuid: 'group-a', sort_order: 10, updated_at: '1' },
    { id: 5, uuid: 'uuid-5', snippet_name: 'grp-cmd2', snippet_content: 'cat', group_uuid: 'group-a', sort_order: 20, updated_at: '1' }
  ]

  const prepare = (sql: string): FakeStmt => {
    // Handle reorder UPDATE statement
    if (sql.includes('UPDATE user_snippet_v1') && sql.includes('sort_order = ?')) {
      return {
        run: (newSortOrder: unknown, id: unknown, groupUuid1: unknown, groupUuid2: unknown) => {
          const snippet = snippets.find((s) => s.id === id)
          if (!snippet) return { changes: 0 }

          // Check group_uuid constraint
          const matchesGroup = (snippet.group_uuid === null && groupUuid1 === null) || snippet.group_uuid === groupUuid2

          if (matchesGroup) {
            snippet.sort_order = newSortOrder as number
            snippet.updated_at = 'updated'
            return { changes: 1 }
          }
          return { changes: 0 }
        }
      }
    }

    throw new Error(`Unexpected SQL: ${sql}`)
  }

  const transaction = <T>(fn: () => T): (() => T) => {
    return () => fn()
  }

  return {
    prepare,
    transaction,
    snippets
  }
}

describe('userSnippetOperationLogic - reorder', () => {
  it('reorders snippets at root level (group_uuid = null)', async () => {
    const { userSnippetOperationLogic } = await import('../snippets')
    const db = createDb()

    // Reorder: move cmd3 (id:3) to first position
    const result = userSnippetOperationLogic(db as any, 'reorder', {
      group_uuid: null,
      ordered_ids: [3, 1, 2]
    })

    expect(result.code).toBe(200)
    expect(result.data.updatedCount).toBe(3)

    // Verify new sort_order values
    const cmd1 = db.snippets.find((s) => s.id === 1)
    const cmd2 = db.snippets.find((s) => s.id === 2)
    const cmd3 = db.snippets.find((s) => s.id === 3)

    expect(cmd3?.sort_order).toBe(10) // First position
    expect(cmd1?.sort_order).toBe(20) // Second position
    expect(cmd2?.sort_order).toBe(30) // Third position

    // Group snippets should remain unchanged
    const grpCmd1 = db.snippets.find((s) => s.id === 4)
    const grpCmd2 = db.snippets.find((s) => s.id === 5)
    expect(grpCmd1?.sort_order).toBe(10)
    expect(grpCmd2?.sort_order).toBe(20)
  })

  it('reorders snippets within a specific group', async () => {
    const { userSnippetOperationLogic } = await import('../snippets')
    const db = createDb()

    // Reorder within group-a: swap order
    const result = userSnippetOperationLogic(db as any, 'reorder', {
      group_uuid: 'group-a',
      ordered_ids: [5, 4]
    })

    expect(result.code).toBe(200)
    expect(result.data.updatedCount).toBe(2)

    // Verify group snippets reordered
    const grpCmd1 = db.snippets.find((s) => s.id === 4)
    const grpCmd2 = db.snippets.find((s) => s.id === 5)

    expect(grpCmd2?.sort_order).toBe(10) // Now first
    expect(grpCmd1?.sort_order).toBe(20) // Now second

    // Root snippets should remain unchanged
    const cmd1 = db.snippets.find((s) => s.id === 1)
    expect(cmd1?.sort_order).toBe(10)
  })

  it('returns error when ordered_ids is empty', async () => {
    const { userSnippetOperationLogic } = await import('../snippets')
    const db = createDb()

    const result = userSnippetOperationLogic(db as any, 'reorder', {
      group_uuid: null,
      ordered_ids: []
    })

    expect(result.code).toBe(400)
    expect(result.message).toContain('ordered_ids')
  })

  it('returns error when ordered_ids is missing', async () => {
    const { userSnippetOperationLogic } = await import('../snippets')
    const db = createDb()

    const result = userSnippetOperationLogic(db as any, 'reorder', {
      group_uuid: null
    })

    expect(result.code).toBe(400)
    expect(result.message).toContain('ordered_ids')
  })

  it('returns 409 when group mismatch causes incomplete update', async () => {
    const { userSnippetOperationLogic } = await import('../snippets')
    const db = createDb()

    // Try to reorder root snippets with group_uuid = 'group-a'
    // IDs 1,2,3 are at root level, not in group-a, so none will be updated
    const result = userSnippetOperationLogic(db as any, 'reorder', {
      group_uuid: 'group-a',
      ordered_ids: [1, 2, 3]
    })

    expect(result.code).toBe(409)
    expect(result.message).toContain('incomplete')
    expect(result.data.updatedCount).toBe(0)
    expect(result.data.expectedCount).toBe(3)
  })

  it('returns 409 when some IDs do not exist', async () => {
    const { userSnippetOperationLogic } = await import('../snippets')
    const db = createDb()

    // ID 999 does not exist
    const result = userSnippetOperationLogic(db as any, 'reorder', {
      group_uuid: null,
      ordered_ids: [1, 2, 999]
    })

    expect(result.code).toBe(409)
    expect(result.data.updatedCount).toBe(2)
    expect(result.data.expectedCount).toBe(3)
  })
})
