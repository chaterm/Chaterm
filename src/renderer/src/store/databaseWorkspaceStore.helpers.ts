export interface FlatGroup {
  id: string
  name: string
  parent_id: string | null
}

export interface MoveToTarget {
  id: string | null
  label: string
}

/**
 * Flatten group tree into slash-joined paths, excluding the current group
 * and its descendants. Always prepends the Root sentinel entry.
 * Why: the Move-to submenu needs a flat, user-scannable list of allowed
 * destinations. Descendants are excluded to prevent cycles.
 */
export function flattenGroupPaths(groups: FlatGroup[], currentGroupId: string | null): MoveToTarget[] {
  const byParent = new Map<string | null, FlatGroup[]>()
  for (const g of groups) {
    const key = g.parent_id ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(g)
  }

  const excluded = new Set<string>()
  if (currentGroupId) {
    const queue = [currentGroupId]
    while (queue.length) {
      const id = queue.shift()!
      excluded.add(id)
      for (const child of byParent.get(id) ?? []) queue.push(child.id)
    }
  }

  const out: MoveToTarget[] = [{ id: null, label: 'Root node' }]
  const walk = (parentId: string | null, prefix: string): void => {
    for (const g of byParent.get(parentId) ?? []) {
      if (excluded.has(g.id)) continue
      const label = prefix ? `${prefix}/${g.name}` : g.name
      out.push({ id: g.id, label })
      walk(g.id, label)
    }
  }
  walk(null, '')
  return out
}
