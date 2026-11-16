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

export interface QuickJumpKnowledgeNode extends QuickJumpKnowledgeFile {
  type: 'file' | 'dir'
  children?: QuickJumpKnowledgeNode[]
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
  | { kind: 'dir'; id: string; group: QuickJumpGroupKey; relPath: string; title: string; depth: number; collapsible: boolean; expanded: boolean }
  | { kind: 'item'; id: string; group: QuickJumpGroupKey; depth: number; item: QuickJumpItem }

export interface QuickJumpSources {
  hostTrees: QuickJumpHostNode[][]
  tabs: QuickJumpTab[]
  snippets: QuickJumpSnippet[]
  knowledgeTree: QuickJumpKnowledgeNode[]
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

const nameMatches = (node: QuickJumpKnowledgeNode, needle: string): boolean => node.name.toLowerCase().includes(needle)

const hasMatchingDescendant = (node: QuickJumpKnowledgeNode, needle: string): boolean =>
  (node.children || []).some((child) => nameMatches(child, needle) || hasMatchingDescendant(child, needle))

// Same shape as the knowledge base list: folders first as returned by the listing, a hit keeps its
// ancestors, and a hit folder keeps its whole subtree. Ancestors of a hit open by themselves.
const buildKnowledgeRows = (
  nodes: QuickJumpKnowledgeNode[],
  needle: string,
  expandedDirs: ReadonlySet<string>,
  depth: number,
  insideHit: boolean,
  rows: QuickJumpRow[]
): void => {
  for (const node of nodes) {
    const selfHit = needle === '' || nameMatches(node, needle)
    const keep = insideHit || selfHit || hasMatchingDescendant(node, needle)
    if (!keep) continue

    if (node.type === 'file') {
      const item: QuickJumpItem = { id: `kb:${node.relPath}`, title: node.name, subtitle: '', action: { type: 'openKnowledge', file: node } }
      rows.push({ kind: 'item', id: item.id, group: 'knowledge', depth, item })
      continue
    }

    const forced = needle !== '' && hasMatchingDescendant(node, needle)
    const expanded = forced || expandedDirs.has(node.relPath)
    rows.push({
      kind: 'dir',
      id: `kbdir:${node.relPath}`,
      group: 'knowledge',
      relPath: node.relPath,
      title: node.name,
      depth,
      collapsible: !forced,
      expanded
    })
    if (expanded) buildKnowledgeRows(node.children || [], needle, expandedDirs, depth + 1, insideHit || selfHit, rows)
  }
}

const toHostItem = (node: QuickJumpHostNode, prefix: string): QuickJumpItem => ({
  id: `${prefix}:${hostIdentity(node)}`,
  title: node.title,
  subtitle: hostSubtitle(node),
  action: { type: 'connect', node }
})

const itemRows = (group: QuickJumpGroupKey, items: QuickJumpItem[]): QuickJumpRow[] =>
  items.map((item) => ({ kind: 'item', id: item.id, group, depth: 0, item }))

export const buildQuickJumpRows = (
  query: string,
  sources: QuickJumpSources,
  expandedGroups: ReadonlySet<QuickJumpGroupKey>,
  expandedKnowledgeDirs: ReadonlySet<string> = new Set()
): QuickJumpRow[] => {
  const needle = query.trim().toLowerCase()
  const searching = needle !== ''

  const recentHosts = collectRecentHosts(sources.hostTrees)
  const bodies = new Map<QuickJumpGroupKey, QuickJumpRow[]>()

  if (searching) {
    // Recently connected hosts rank first, most recent first.
    const recentRank = new Map(recentHosts.map((node, index) => [hostIdentity(node), index]))
    const matched = collectHosts(sources.hostTrees)
      .filter((node) => hostMatches(node, needle))
      .sort((a, b) => (recentRank.get(hostIdentity(a)) ?? Infinity) - (recentRank.get(hostIdentity(b)) ?? Infinity))
    bodies.set(
      'hosts',
      itemRows(
        'hosts',
        matched.map((node) => toHostItem(node, 'host'))
      )
    )
  } else {
    bodies.set(
      'recent',
      itemRows(
        'recent',
        recentHosts.slice(0, QUICK_JUMP_RECENT_LIMIT).map((node) => toHostItem(node, 'recent'))
      )
    )
  }

  bodies.set(
    'tabs',
    itemRows(
      'tabs',
      sources.tabs
        .filter((tab) => !searching || tab.title.toLowerCase().includes(needle))
        .map((tab) => ({ id: `tab:${tab.id}`, title: tab.title, subtitle: tab.subtitle || '', action: { type: 'switchTab', tabId: tab.id } }))
    )
  )
  bodies.set(
    'snippets',
    itemRows(
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
  )
  const knowledgeRows: QuickJumpRow[] = []
  buildKnowledgeRows(sources.knowledgeTree, needle, expandedKnowledgeDirs, 0, false, knowledgeRows)
  bodies.set('knowledge', knowledgeRows)

  const order: QuickJumpGroupKey[] = searching ? ['hosts', 'tabs', 'snippets', 'knowledge'] : ['recent', 'tabs', 'snippets', 'knowledge']
  const rows: QuickJumpRow[] = []
  for (const group of order) {
    const body = bodies.get(group) || []
    if (body.length === 0) continue
    const expanded = searching || expandedGroups.has(group)
    rows.push({ kind: 'header', id: `group:${group}`, group, collapsible: !searching, expanded })
    // An opened knowledge folder lists everything in it, like the knowledge base list does.
    const limit = group === 'knowledge' && !searching ? Infinity : QUICK_JUMP_GROUP_LIMIT
    if (expanded) rows.push(...body.slice(0, limit))
  }
  return rows
}

// Headers and folders that a search opened by itself are plain labels, so they cannot hold the highlight.
export const isSelectableRow = (row: QuickJumpRow): boolean => row.kind === 'item' || row.collapsible

export const isCollapsibleRow = (row: QuickJumpRow): row is Extract<QuickJumpRow, { collapsible: boolean }> => row.kind !== 'item' && row.collapsible

// The row that holds this one: its folder, or the group header when it sits at the top level.
export const parentRowId = (row: QuickJumpRow): string => {
  const relPath =
    row.kind === 'dir' ? row.relPath : row.kind === 'item' && row.item.action.type === 'openKnowledge' ? row.item.action.file.relPath : ''
  const dir = relPath ? parentDir(relPath) : ''
  return dir ? `kbdir:${dir}` : `group:${row.group}`
}

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

export const collectKnowledgeTree = async (
  listDir: (relDir: string) => Promise<Array<{ name: string; relPath: string; type: 'file' | 'dir' }>>,
  relDir = ''
): Promise<QuickJumpKnowledgeNode[]> => {
  const entries = await listDir(relDir)
  return Promise.all(
    entries.map(async (entry) => {
      const node: QuickJumpKnowledgeNode = { name: entry.name, relPath: entry.relPath, type: entry.type }
      if (entry.type === 'dir') node.children = await collectKnowledgeTree(listDir, entry.relPath)
      return node
    })
  )
}
