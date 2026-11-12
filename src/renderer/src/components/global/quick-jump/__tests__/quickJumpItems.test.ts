import { describe, it, expect, vi } from 'vitest'
import {
  QUICK_JUMP_GROUP_LIMIT,
  QUICK_JUMP_RECENT_LIMIT,
  buildQuickJumpRows,
  collectHosts,
  collectKnowledgeFiles,
  collectRecentHosts,
  findDefaultRowId,
  isSelectableRow,
  moveRowId,
  type QuickJumpGroupKey,
  type QuickJumpHostNode,
  type QuickJumpRow,
  type QuickJumpSources
} from '../quickJumpItems'

const host = (overrides: Partial<QuickJumpHostNode> & { title: string }): QuickJumpHostNode => ({
  key: `key_${overrides.title}`,
  uuid: `uuid_${overrides.title}`,
  ip: '10.0.0.1',
  username: 'root',
  asset_type: 'person',
  ...overrides
})

const recentRouter = (children: QuickJumpHostNode[]): QuickJumpHostNode => ({
  key: 'recent_connections',
  title: 'Recent',
  children: children.map((child) => ({ ...child, isRecentConnection: true }))
})

const emptySources = (): QuickJumpSources => ({ hostTrees: [], tabs: [], snippets: [], knowledgeFiles: [] })
const expanded = (...groups: QuickJumpGroupKey[]) => new Set<QuickJumpGroupKey>(groups)
const itemTitles = (rows: QuickJumpRow[]) => rows.filter((row) => row.kind === 'item').map((row) => (row.kind === 'item' ? row.item.title : ''))
const headerGroups = (rows: QuickJumpRow[]) => rows.filter((row) => row.kind === 'header').map((row) => row.group)

describe('collectRecentHosts', () => {
  it('merges the personal and organization lists, newest first', () => {
    const personal = [recentRouter([host({ title: 'old', lastConnected: '2026-04-01 10:00:00' })])]
    const organization = [recentRouter([host({ title: 'new', lastConnected: '2026-04-20 10:00:00' })])]

    expect(collectRecentHosts([personal, organization]).map((node) => node.title)).toEqual(['new', 'old'])
  })

  it('drops duplicates of the same asset and tolerates a missing timestamp', () => {
    const tree = [
      recentRouter([
        host({ title: 'a', uuid: 'same', lastConnected: '2026-04-20 10:00:00' }),
        host({ title: 'a', uuid: 'same', lastConnected: '2026-04-19 10:00:00' }),
        host({ title: 'b' })
      ])
    ]

    expect(collectRecentHosts([tree]).map((node) => node.title)).toEqual(['a', 'b'])
  })

  it('ignores trees without a recent node', () => {
    expect(collectRecentHosts([[host({ title: 'plain' })]])).toEqual([])
  })
})

describe('collectHosts', () => {
  it('flattens nested groups, skips the recent node and dedupes by uuid', () => {
    const tree: QuickJumpHostNode[] = [
      recentRouter([host({ title: 'recent-only' })]),
      { key: 'favorites', title: 'Fav', children: [host({ title: 'dup', uuid: 'u1' })] },
      { key: 'g', title: 'Group', children: [host({ title: 'dup', uuid: 'u1' }), { key: 'sub', title: 'Sub', children: [host({ title: 'deep' })] }] }
    ]

    expect(collectHosts([tree]).map((node) => node.title)).toEqual(['dup', 'deep'])
  })

  it('dedupes nodes without a uuid by address, user and title, and skips untitled leaves', () => {
    const tree: QuickJumpHostNode[] = [
      {
        key: 'g',
        title: 'Group',
        children: [
          { key: 'a', title: 'same', ip: '1.1.1.1', username: 'u' },
          { key: 'b', title: 'same', ip: '1.1.1.1', username: 'u' },
          { key: 'c', title: 'other', ip: '1.1.1.1' },
          { key: 'd', title: '' }
        ]
      }
    ]

    expect(collectHosts([tree]).map((node) => node.title)).toEqual(['same', 'other'])
  })
})

describe('buildQuickJumpRows without a query', () => {
  it('shows only non-empty groups, with recent hosts expanded first', () => {
    const sources: QuickJumpSources = {
      ...emptySources(),
      hostTrees: [[recentRouter([host({ title: 'prod', ip: '10.0.0.5', username: 'root' })])]],
      tabs: [{ id: 'panel_1', title: 'prod', subtitle: '10.0.0.5' }],
      snippets: [{ uuid: 's1', snippet_name: 'disk', snippet_content: '\n  df -h\nfree -m' }],
      knowledgeFiles: [{ name: 'a.md', relPath: 'ops/a.md' }]
    }

    const rows = buildQuickJumpRows('', sources, expanded('recent'))

    expect(headerGroups(rows)).toEqual(['recent', 'tabs', 'snippets', 'knowledge'])
    expect(rows.filter((row) => row.kind === 'header').map((row) => row.kind === 'header' && row.expanded)).toEqual([true, false, false, false])
    expect(rows.map((row) => row.id)).toEqual(['group:recent', 'recent:uuid:uuid_prod', 'group:tabs', 'group:snippets', 'group:knowledge'])
    const recentItem = rows[1]
    expect(recentItem.kind === 'item' && recentItem.item.subtitle).toBe('root@10.0.0.5')
  })

  it('hides groups that have no content', () => {
    expect(buildQuickJumpRows('', emptySources(), expanded('recent'))).toEqual([])
  })

  it('reveals the items of an expanded group with their subtitles and actions', () => {
    const sources: QuickJumpSources = {
      ...emptySources(),
      tabs: [
        { id: 'panel_1', title: 'prod', subtitle: '10.0.0.5' },
        { id: 'panel_2', title: 'settings' }
      ],
      snippets: [{ uuid: 's1', snippet_name: 'disk', snippet_content: '\n  df -h\nfree -m' }],
      knowledgeFiles: [
        { name: 'a.md', relPath: 'ops/a.md' },
        { name: 'root.md', relPath: 'root.md' }
      ]
    }

    const rows = buildQuickJumpRows('', sources, expanded('tabs', 'snippets', 'knowledge'))
    const items = rows.filter((row) => row.kind === 'item').map((row) => (row.kind === 'item' ? row.item : null))

    expect(items.map((item) => [item?.title, item?.subtitle, item?.action.type])).toEqual([
      ['prod', '10.0.0.5', 'switchTab'],
      ['settings', '', 'switchTab'],
      ['disk', 'df -h', 'runSnippet'],
      ['a.md', 'ops', 'openKnowledge'],
      ['root.md', '', 'openKnowledge']
    ])
  })

  it('limits recent hosts and caps every group', () => {
    const many = Array.from({ length: QUICK_JUMP_RECENT_LIMIT + 5 }, (_, i) =>
      host({ title: `h${i}`, lastConnected: `2026-04-20 10:00:${String(i).padStart(2, '0')}` })
    )
    const tabs = Array.from({ length: QUICK_JUMP_GROUP_LIMIT + 5 }, (_, i) => ({ id: `p${i}`, title: `t${i}` }))
    const sources: QuickJumpSources = { ...emptySources(), hostTrees: [[recentRouter(many)]], tabs }

    const rows = buildQuickJumpRows('', sources, expanded('recent', 'tabs'))

    expect(itemTitles(rows).filter((title) => title.startsWith('h'))).toHaveLength(QUICK_JUMP_RECENT_LIMIT)
    expect(itemTitles(rows).filter((title) => title.startsWith('t'))).toHaveLength(QUICK_JUMP_GROUP_LIMIT)
  })

  it('omits the address for local shells', () => {
    const shell = host({ title: 'zsh', asset_type: 'shell', ip: '127.0.0.1', username: '' })
    const rows = buildQuickJumpRows('', { ...emptySources(), hostTrees: [[recentRouter([shell])]] }, expanded('recent'))

    expect(rows[1].kind === 'item' && rows[1].item.subtitle).toBe('')
  })

  it('shows the bare address when the host has no username', () => {
    const noUser = host({ title: 'bare', ip: '10.9.9.9', username: '' })
    const rows = buildQuickJumpRows('', { ...emptySources(), hostTrees: [[recentRouter([noUser])]] }, expanded('recent'))

    expect(rows[1].kind === 'item' && rows[1].item.subtitle).toBe('10.9.9.9')
  })
})

describe('buildQuickJumpRows with a query', () => {
  const sources: QuickJumpSources = {
    hostTrees: [
      [
        recentRouter([host({ title: 'web-b', uuid: 'wb', lastConnected: '2026-04-20 10:00:00' })]),
        {
          key: 'g',
          title: 'Group',
          children: [
            host({ title: 'web-a', uuid: 'wa', ip: '10.1.1.1' }),
            host({ title: 'web-b', uuid: 'wb' }),
            host({ title: 'db', uuid: 'db', ip: '10.2.2.2', username: 'admin', comment: 'primary database', group_name: 'Storage' })
          ]
        }
      ]
    ],
    tabs: [
      { id: 'p1', title: 'Web console' },
      { id: 'p2', title: 'logs' }
    ],
    snippets: [{ uuid: 's1', snippet_name: 'restart', snippet_content: 'systemctl restart web' }],
    knowledgeFiles: [
      { name: 'web.md', relPath: 'guides/web.md' },
      { name: 'db.md', relPath: 'guides/db.md' }
    ]
  }

  it('lists matching hosts, recently connected first, and expands every group', () => {
    const rows = buildQuickJumpRows('WEB', sources, expanded())

    expect(headerGroups(rows)).toEqual(['hosts', 'tabs', 'snippets', 'knowledge'])
    expect(rows.filter((row) => row.kind === 'header').every((row) => row.kind === 'header' && row.expanded && !row.collapsible)).toBe(true)
    expect(itemTitles(rows)).toEqual(['web-b', 'web-a', 'Web console', 'restart', 'web.md'])
  })

  it('matches hosts on ip, username, comment and group name', () => {
    expect(itemTitles(buildQuickJumpRows('10.2.2', sources, expanded()))).toEqual(['db'])
    expect(itemTitles(buildQuickJumpRows('admin', sources, expanded()))).toEqual(['db'])
    expect(itemTitles(buildQuickJumpRows('primary', sources, expanded()))).toEqual(['db'])
    expect(itemTitles(buildQuickJumpRows('storage', sources, expanded()))).toEqual(['db'])
  })

  it('matches snippets on content and knowledge files on their path', () => {
    expect(itemTitles(buildQuickJumpRows('systemctl', sources, expanded()))).toEqual(['restart'])
    expect(itemTitles(buildQuickJumpRows('guides/db', sources, expanded()))).toEqual(['db.md'])
  })

  it('treats a whitespace-only query as empty', () => {
    const blank = buildQuickJumpRows('   ', sources, expanded('recent'))

    expect(blank).toEqual(buildQuickJumpRows('', sources, expanded('recent')))
    expect(headerGroups(blank)).toEqual(['recent', 'tabs', 'snippets', 'knowledge'])
  })

  it('returns nothing when no group matches', () => {
    expect(buildQuickJumpRows('zzz', sources, expanded())).toEqual([])
  })
})

describe('row selection', () => {
  const rows: QuickJumpRow[] = [
    { kind: 'header', id: 'group:recent', group: 'recent', collapsible: true, expanded: true },
    { kind: 'item', id: 'recent:a', group: 'recent', item: { id: 'recent:a', title: 'a', subtitle: '', action: { type: 'switchTab', tabId: 'a' } } },
    { kind: 'header', id: 'group:tabs', group: 'tabs', collapsible: true, expanded: false }
  ]
  const searchHeader: QuickJumpRow = { kind: 'header', id: 'group:hosts', group: 'hosts', collapsible: false, expanded: true }

  it('highlights the first item, and falls back to a header when only headers exist', () => {
    expect(findDefaultRowId(rows)).toBe('recent:a')
    expect(findDefaultRowId([rows[2]])).toBe('group:tabs')
    expect(findDefaultRowId([searchHeader])).toBeNull()
    expect(findDefaultRowId([])).toBeNull()
  })

  it('treats search section labels as unselectable', () => {
    expect(isSelectableRow(searchHeader)).toBe(false)
    expect(isSelectableRow(rows[0])).toBe(true)
    expect(isSelectableRow(rows[1])).toBe(true)
  })

  it('moves through headers and items and wraps around', () => {
    expect(moveRowId(rows, 'group:recent', 1)).toBe('recent:a')
    expect(moveRowId(rows, 'recent:a', 1)).toBe('group:tabs')
    expect(moveRowId(rows, 'group:tabs', 1)).toBe('group:recent')
    expect(moveRowId(rows, 'group:recent', -1)).toBe('group:tabs')
  })

  it('starts from either end when nothing is highlighted, and handles empty lists', () => {
    expect(moveRowId(rows, null, 1)).toBe('group:recent')
    expect(moveRowId(rows, null, -1)).toBe('group:tabs')
    expect(moveRowId([searchHeader], null, 1)).toBeNull()
  })
})

describe('collectKnowledgeFiles', () => {
  it('walks directories recursively and returns files only', async () => {
    const tree: Record<string, Array<{ name: string; relPath: string; type: 'file' | 'dir' }>> = {
      '': [
        { name: 'ops', relPath: 'ops', type: 'dir' },
        { name: 'readme.md', relPath: 'readme.md', type: 'file' }
      ],
      ops: [
        { name: 'deep', relPath: 'ops/deep', type: 'dir' },
        { name: 'a.md', relPath: 'ops/a.md', type: 'file' }
      ],
      'ops/deep': [{ name: 'b.md', relPath: 'ops/deep/b.md', type: 'file' }]
    }
    const listDir = vi.fn(async (relDir: string) => tree[relDir] || [])

    const files = await collectKnowledgeFiles(listDir)

    expect(files.map((file) => file.relPath).sort()).toEqual(['ops/a.md', 'ops/deep/b.md', 'readme.md'])
    expect(listDir).toHaveBeenCalledTimes(3)
  })
})
