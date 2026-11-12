export type QuickJumpGroupKey = 'recent' | 'hosts' | 'tabs' | 'snippets' | 'knowledge'

export const QUICK_JUMP_GROUP_LIMIT = 50
export const QUICK_JUMP_RECENT_LIMIT = 8

export interface QuickJumpHostNode {
  key: string
  title: string
  uuid?: string
  ip?: string
  username?: string
  comment?: string
  group_name?: string
  asset_type?: string
  lastConnected?: string
  isRecentConnection?: boolean
  children?: QuickJumpHostNode[]
  [field: string]: unknown
}

export interface QuickJumpTab {
  id: string
  title: string
  subtitle?: string
}

export interface QuickJumpSnippet {
  uuid: string
  snippet_name: string
  snippet_content: string
}

export interface QuickJumpKnowledgeFile {
  name: string
  relPath: string
}

export type QuickJumpAction =
  | { type: 'connect'; node: QuickJumpHostNode }
  | { type: 'switchTab'; tabId: string }
  | { type: 'runSnippet'; snippet: QuickJumpSnippet }
  | { type: 'openKnowledge'; file: QuickJumpKnowledgeFile }

export interface QuickJumpItem {
  id: string
  title: string
  subtitle: string
  action: QuickJumpAction
}

export type QuickJumpRow =
  | { kind: 'header'; id: string; group: QuickJumpGroupKey; collapsible: boolean; expanded: boolean }
  | { kind: 'item'; id: string; group: QuickJumpGroupKey; item: QuickJumpItem }

export interface QuickJumpSources {
  hostTrees: QuickJumpHostNode[][]
  tabs: QuickJumpTab[]
  snippets: QuickJumpSnippet[]
  knowledgeFiles: QuickJumpKnowledgeFile[]
}

const RECENT_ROUTER_KEY = 'recent_connections'

// Local shells use the loopback address, which says nothing about the target.
const hostSubtitle = (node: QuickJumpHostNode): string => {
  if (node.asset_type === 'shell') return ''
  const ip = node.ip || ''
  return node.username && ip ? `${node.username}@${ip}` : ip
}

const hostIdentity = (node: QuickJumpHostNode): string => {
  if (node.uuid) return `uuid:${node.uuid}`
  return `addr:${node.ip || ''}|${node.username || ''}|${node.title}`
}

const collectLeaves = (nodes: QuickJumpHostNode[], out: QuickJumpHostNode[]): void => {
  for (const node of nodes) {
    if (node.children) {
      collectLeaves(node.children, out)
    } else if (node.title) {
      out.push(node)
    }
  }
}

const dedupe = (nodes: QuickJumpHostNode[]): QuickJumpHostNode[] => {
  const seen = new Set<string>()
  const result: QuickJumpHostNode[] = []
  for (const node of nodes) {
    const identity = hostIdentity(node)
    if (seen.has(identity)) continue
    seen.add(identity)
    result.push(node)
  }
  return result
}

export const collectRecentHosts = (trees: QuickJumpHostNode[][]): QuickJumpHostNode[] => {
  const recent: QuickJumpHostNode[] = []
  for (const tree of trees) {
    const router = tree.find((node) => node.key === RECENT_ROUTER_KEY)
    if (router?.children) recent.push(...router.children)
  }
  return dedupe(recent.sort((a, b) => (b.lastConnected || '').localeCompare(a.lastConnected || '')))
}

export const collectHosts = (trees: QuickJumpHostNode[][]): QuickJumpHostNode[] => {
  const leaves: QuickJumpHostNode[] = []
  for (const tree of trees) {
    collectLeaves(
      tree.filter((node) => node.key !== RECENT_ROUTER_KEY),
      leaves
    )
  }
  return dedupe(leaves)
}

const hostMatches = (node: QuickJumpHostNode, needle: string): boolean =>
  [node.title, node.ip, node.username, node.comment, node.group_name].some(
    (value) => typeof value === 'string' && value.toLowerCase().includes(needle)
  )

const firstContentLine = (content: string): string =>
  content
    .split('\n')
    .find((line) => line.trim() !== '')
    ?.trim() || ''

const parentDir = (relPath: string): string => {
  const index = relPath.lastIndexOf('/')
  return index < 0 ? '' : relPath.slice(0, index)
}

const toHostItem = (node: QuickJumpHostNode, prefix: string): QuickJumpItem => ({
  id: `${prefix}:${hostIdentity(node)}`,
  title: node.title,
  subtitle: hostSubtitle(node),
  action: { type: 'connect', node }
})

export const buildQuickJumpRows = (query: string, sources: QuickJumpSources, expandedGroups: ReadonlySet<QuickJumpGroupKey>): QuickJumpRow[] => {
  const needle = query.trim().toLowerCase()
  const searching = needle !== ''

  const recentHosts = collectRecentHosts(sources.hostTrees)
  const groups = new Map<QuickJumpGroupKey, QuickJumpItem[]>()

  if (searching) {
    // Recently connected hosts rank first, most recent first.
    const recentRank = new Map(recentHosts.map((node, index) => [hostIdentity(node), index]))
    const matched = collectHosts(sources.hostTrees)
      .filter((node) => hostMatches(node, needle))
      .sort((a, b) => (recentRank.get(hostIdentity(a)) ?? Infinity) - (recentRank.get(hostIdentity(b)) ?? Infinity))
    groups.set(
      'hosts',
      matched.map((node) => toHostItem(node, 'host'))
    )
  } else {
    groups.set(
      'recent',
      recentHosts.slice(0, QUICK_JUMP_RECENT_LIMIT).map((node) => toHostItem(node, 'recent'))
    )
  }

  groups.set(
    'tabs',
    sources.tabs
      .filter((tab) => !searching || tab.title.toLowerCase().includes(needle))
      .map((tab) => ({ id: `tab:${tab.id}`, title: tab.title, subtitle: tab.subtitle || '', action: { type: 'switchTab', tabId: tab.id } }))
  )
  groups.set(
    'snippets',
    sources.snippets
      .filter((snippet) => !searching || [snippet.snippet_name, snippet.snippet_content].some((value) => value.toLowerCase().includes(needle)))
      .map((snippet) => ({
        id: `snippet:${snippet.uuid}`,
        title: snippet.snippet_name,
        subtitle: firstContentLine(snippet.snippet_content),
        action: { type: 'runSnippet', snippet }
      }))
  )
  groups.set(
    'knowledge',
    sources.knowledgeFiles
      .filter((file) => !searching || file.relPath.toLowerCase().includes(needle))
      .map((file) => ({ id: `kb:${file.relPath}`, title: file.name, subtitle: parentDir(file.relPath), action: { type: 'openKnowledge', file } }))
  )

  const order: QuickJumpGroupKey[] = searching ? ['hosts', 'tabs', 'snippets', 'knowledge'] : ['recent', 'tabs', 'snippets', 'knowledge']
  const rows: QuickJumpRow[] = []
  for (const group of order) {
    const items = groups.get(group) || []
    if (items.length === 0) continue
    const expanded = searching || expandedGroups.has(group)
    rows.push({ kind: 'header', id: `group:${group}`, group, collapsible: !searching, expanded })
    if (!expanded) continue
    for (const item of items.slice(0, QUICK_JUMP_GROUP_LIMIT)) {
      rows.push({ kind: 'item', id: item.id, group, item })
    }
  }
  return rows
}

// Headers of a search result are plain section labels, so they cannot hold the highlight.
export const isSelectableRow = (row: QuickJumpRow): boolean => row.kind === 'item' || row.collapsible

export const findDefaultRowId = (rows: QuickJumpRow[]): string | null => {
  const firstItem = rows.find((row) => row.kind === 'item')
  return (firstItem ?? rows.find(isSelectableRow))?.id ?? null
}

export const moveRowId = (rows: QuickJumpRow[], currentId: string | null, step: 1 | -1): string | null => {
  const selectable = rows.filter(isSelectableRow)
  if (selectable.length === 0) return null
  const index = selectable.findIndex((row) => row.id === currentId)
  if (index < 0) return selectable[step === 1 ? 0 : selectable.length - 1].id
  return selectable[(index + step + selectable.length) % selectable.length].id
}

export const collectKnowledgeFiles = async (
  listDir: (relDir: string) => Promise<Array<{ name: string; relPath: string; type: 'file' | 'dir' }>>,
  relDir = ''
): Promise<QuickJumpKnowledgeFile[]> => {
  const entries = await listDir(relDir)
  const nested = await Promise.all(
    entries.map(async (entry) => {
      if (entry.type === 'dir') return collectKnowledgeFiles(listDir, entry.relPath)
      return [{ name: entry.name, relPath: entry.relPath }]
    })
  )
  return nested.flat()
}
