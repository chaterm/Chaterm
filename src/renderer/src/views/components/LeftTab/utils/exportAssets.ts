import type { AssetNode } from './types'

// Leaf asset payload produced when preparing the JSON export file.
export interface ExportAssetPayload {
  username: string
  password: string
  ip: string
  label: string
  group_name: string | undefined
  auth_type: string
  keyChain: number | undefined
  port: number
  asset_type: string
  needProxy: boolean
  proxyName: string
}

// A leaf node is a terminal host: no children AND both ip and username populated.
export const isExportableLeaf = (node: AssetNode): boolean => {
  const hasChildren = !!(node?.children && node.children.length > 0)
  return !hasChildren && !!node?.ip && !!node?.username
}

// Count all exportable leaves anywhere in the tree.
export const countExportableLeaves = (nodes: AssetNode[] | undefined | null): number => {
  if (!Array.isArray(nodes)) return 0
  let count = 0
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      count += countExportableLeaves(node.children)
    } else if (isExportableLeaf(node)) {
      count += 1
    }
  }
  return count
}

// Collect all leaf keys from the tree (used by the "Select All" action).
export const collectAllLeafKeys = (nodes: AssetNode[] | undefined | null): string[] => {
  if (!Array.isArray(nodes)) return []
  const out: string[] = []
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      out.push(...collectAllLeafKeys(node.children))
    } else if (isExportableLeaf(node) && node.key) {
      out.push(node.key)
    }
  }
  return out
}

// Collect all group (non-leaf) keys for default-expand behavior.
export const collectAllGroupKeys = (nodes: AssetNode[] | undefined | null): string[] => {
  if (!Array.isArray(nodes)) return []
  const out: string[] = []
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      if (node.key) out.push(node.key)
      out.push(...collectAllGroupKeys(node.children))
    }
  }
  return out
}

// Walk the tree and collect all leaf hosts that are either checked themselves
// or have an ancestor checked. Robust to a-tree returning a group key rather
// than descendant leaf keys when the whole group is checked.
export const resolveCheckedLeafNodes = (nodes: AssetNode[] | undefined | null, checkedSet: Set<string>, ancestorChecked = false): AssetNode[] => {
  const out: AssetNode[] = []
  if (!Array.isArray(nodes)) return out
  for (const node of nodes) {
    const selfOrAncestor = ancestorChecked || checkedSet.has(node.key)
    const hasChildren = !!(node.children && node.children.length > 0)
    if (hasChildren) {
      out.push(...resolveCheckedLeafNodes(node.children as AssetNode[], checkedSet, selfOrAncestor))
    } else if (isExportableLeaf(node) && selfOrAncestor) {
      out.push(node)
    }
  }
  return out
}

// Rebuild the asset tree with guaranteed-unique keys for export use.
// The backend can produce duplicate keys (e.g. two hosts with same IP in same
// group, or aliases pointing at the same IP across groups). a-tree treats
// duplicate keys as a single node, so checking one ticks all siblings.
export const buildExportTree = (nodes: AssetNode[] | undefined | null): AssetNode[] => {
  const seen = new Set<string>()
  const makeUnique = (base: string): string => {
    let candidate = base
    let n = 1
    while (seen.has(candidate)) {
      candidate = `${base}#${n++}`
    }
    seen.add(candidate)
    return candidate
  }
  const walk = (input: AssetNode[] | undefined | null): AssetNode[] => {
    if (!Array.isArray(input)) return []
    return input.map((node) => {
      const hasChildren = !!(node.children && node.children.length > 0)
      const baseKey = hasChildren
        ? `group::${node.key || node.title}`
        : `leaf::${node.uuid || `${node.group_name || ''}_${node.ip || ''}_${node.username || ''}`}`
      const uniqueKey = makeUnique(baseKey)
      const clone: AssetNode = { ...node, key: uniqueKey }
      if (hasChildren) clone.children = walk(node.children as AssetNode[])
      return clone
    })
  }
  return walk(nodes)
}

// Filter the tree by keyword against title / ip / label. Mirrors AssetList.vue
// filterNodes: keeps a branch if any descendant matches, preserving structure.
export const filterExportTree = (nodes: AssetNode[] | undefined | null, keyword: string): AssetNode[] => {
  const kw = (keyword || '').trim().toLowerCase()
  if (!kw) return Array.isArray(nodes) ? nodes : []
  const walk = (input: AssetNode[] | undefined | null): AssetNode[] => {
    if (!Array.isArray(input)) return []
    return input
      .map((node) => {
        if (!node || typeof node.title !== 'string') return null
        const titleMatch = node.title.toLowerCase().includes(kw)
        const ipMatch = typeof node.ip === 'string' && node.ip.toLowerCase().includes(kw)
        const labelMatch = typeof node.label === 'string' && node.label.toLowerCase().includes(kw)
        if (titleMatch || ipMatch || labelMatch) return { ...node }
        if (node.children && Array.isArray(node.children)) {
          const filteredChildren = walk(node.children)
          if (filteredChildren.length > 0) {
            return { ...node, children: filteredChildren }
          }
        }
        return null
      })
      .filter(Boolean) as AssetNode[]
  }
  return walk(nodes)
}

// Map a list of leaf AssetNodes into the JSON export payload shape.
export const toExportPayloads = (leaves: AssetNode[]): ExportAssetPayload[] => {
  return leaves.map((node) => ({
    username: node.username as string,
    password: node.password || '',
    ip: node.ip as string,
    label: node.label || node.title,
    group_name: node.group_name,
    auth_type: node.auth_type || 'password',
    keyChain: node.key_chain_id,
    port: node.port || 22,
    asset_type: node.asset_type || 'person',
    needProxy: node.needProxy || false,
    proxyName: node.proxyName || ''
  }))
}
