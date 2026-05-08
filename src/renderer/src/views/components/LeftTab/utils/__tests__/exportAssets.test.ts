import { describe, it, expect } from 'vitest'
import type { AssetNode } from '../types'
import {
  buildExportTree,
  collectAllGroupKeys,
  collectAllLeafKeys,
  countExportableLeaves,
  filterExportTree,
  isExportableLeaf,
  resolveCheckedLeafNodes,
  toExportPayloads
} from '../exportAssets'

const leaf = (overrides: Partial<AssetNode> = {}): AssetNode => ({
  key: 'default_key',
  title: 'host',
  ip: '10.0.0.1',
  username: 'root',
  ...overrides
})

const group = (key: string, title: string, children: AssetNode[]): AssetNode => ({
  key,
  title,
  children
})

// A small tree with two groups and a mix of valid / invalid leaves used
// across most of the suite.
const sampleTree: AssetNode[] = [
  group('production', 'production', [
    leaf({ key: 'production_10.0.0.1', title: 'web-a', ip: '10.0.0.1', username: 'root', uuid: 'uuid-1', group_name: 'production' }),
    leaf({ key: 'production_10.0.0.2', title: 'web-b', ip: '10.0.0.2', username: 'root', uuid: 'uuid-2', group_name: 'production' }),
    // Invalid leaf: no ip/username — must be ignored by all helpers.
    { key: 'production_placeholder', title: 'placeholder' } as AssetNode
  ]),
  group('staging', 'staging', [
    leaf({ key: 'staging_10.0.0.3', title: 'stage-a', ip: '10.0.0.3', username: 'ubuntu', uuid: 'uuid-3', group_name: 'staging' })
  ])
]

describe('isExportableLeaf', () => {
  it('accepts a node with ip and username and no children', () => {
    expect(isExportableLeaf(leaf())).toBe(true)
  })

  it('rejects a node with children regardless of ip/username', () => {
    expect(isExportableLeaf({ key: 'g', title: 'g', children: [leaf()] } as AssetNode)).toBe(false)
  })

  it('rejects a node missing ip or username', () => {
    expect(isExportableLeaf({ key: 'x', title: 'x', ip: '10.0.0.1' } as AssetNode)).toBe(false)
    expect(isExportableLeaf({ key: 'x', title: 'x', username: 'root' } as AssetNode)).toBe(false)
  })
})

describe('countExportableLeaves', () => {
  it('counts only valid leaves across the tree', () => {
    expect(countExportableLeaves(sampleTree)).toBe(3)
  })

  it('handles empty or invalid input', () => {
    expect(countExportableLeaves([])).toBe(0)
    expect(countExportableLeaves(null)).toBe(0)
    expect(countExportableLeaves(undefined)).toBe(0)
  })

  it('returns zero when no leaves have ip and username', () => {
    const tree: AssetNode[] = [group('empty', 'empty', [{ key: 'x', title: 'x' } as AssetNode])]
    expect(countExportableLeaves(tree)).toBe(0)
  })
})

describe('collectAllLeafKeys', () => {
  it('returns every valid leaf key, skipping groups and invalid leaves', () => {
    expect(collectAllLeafKeys(sampleTree)).toEqual(['production_10.0.0.1', 'production_10.0.0.2', 'staging_10.0.0.3'])
  })

  it('handles empty input', () => {
    expect(collectAllLeafKeys([])).toEqual([])
    expect(collectAllLeafKeys(null)).toEqual([])
  })
})

describe('collectAllGroupKeys', () => {
  it('returns only non-leaf group keys', () => {
    expect(collectAllGroupKeys(sampleTree)).toEqual(['production', 'staging'])
  })

  it('includes nested groups', () => {
    const nested: AssetNode[] = [group('outer', 'outer', [group('inner', 'inner', [leaf()])])]
    expect(collectAllGroupKeys(nested)).toEqual(['outer', 'inner'])
  })

  it('skips groups with no children', () => {
    const empty: AssetNode[] = [{ key: 'g', title: 'g', children: [] } as AssetNode]
    expect(collectAllGroupKeys(empty)).toEqual([])
  })
})

describe('resolveCheckedLeafNodes', () => {
  it('returns leaves whose own key is checked', () => {
    const result = resolveCheckedLeafNodes(sampleTree, new Set(['production_10.0.0.1']))
    expect(result.map((n) => n.ip)).toEqual(['10.0.0.1'])
  })

  it('cascades when a group key is checked, including all descendant leaves', () => {
    const result = resolveCheckedLeafNodes(sampleTree, new Set(['production']))
    // placeholder leaf (no ip/username) is still excluded from the output
    expect(result.map((n) => n.ip)).toEqual(['10.0.0.1', '10.0.0.2'])
  })

  it('unions self-checked leaves with group-checked descendants without duplicates by source', () => {
    const result = resolveCheckedLeafNodes(sampleTree, new Set(['production', 'staging_10.0.0.3']))
    expect(result.map((n) => n.ip)).toEqual(['10.0.0.1', '10.0.0.2', '10.0.0.3'])
  })

  it('returns nothing when nothing is checked', () => {
    expect(resolveCheckedLeafNodes(sampleTree, new Set())).toEqual([])
  })

  it('handles empty / nullish tree input', () => {
    expect(resolveCheckedLeafNodes([], new Set(['anything']))).toEqual([])
    expect(resolveCheckedLeafNodes(null, new Set(['anything']))).toEqual([])
  })

  it('respects ancestorChecked propagation through nested groups', () => {
    const nested: AssetNode[] = [
      group('outer', 'outer', [
        group('inner', 'inner', [
          leaf({ key: 'inner_10.0.0.1', ip: '10.0.0.1', username: 'u1' }),
          leaf({ key: 'inner_10.0.0.2', ip: '10.0.0.2', username: 'u2' })
        ])
      ])
    ]
    const result = resolveCheckedLeafNodes(nested, new Set(['outer']))
    expect(result.map((n) => n.ip)).toEqual(['10.0.0.1', '10.0.0.2'])
  })
})

describe('buildExportTree', () => {
  it('produces a unique key for every node', () => {
    // Duplicate backend key: same group_name + ip but different aliases.
    // Without uniqueness this is the exact root cause of "check one ticks all".
    const dupTree: AssetNode[] = [
      group('production', 'production', [
        leaf({ key: 'production_10.0.0.1', title: 'web-primary', ip: '10.0.0.1', username: 'root', uuid: 'uuid-a', group_name: 'production' }),
        leaf({ key: 'production_10.0.0.1', title: 'web-alias', ip: '10.0.0.1', username: 'root', uuid: 'uuid-b', group_name: 'production' })
      ])
    ]
    const rebuilt = buildExportTree(dupTree)
    const children = rebuilt[0].children as AssetNode[]
    expect(children.length).toBe(2)
    expect(children[0].key).not.toBe(children[1].key)
  })

  it('prefers uuid for leaf keys to keep two aliases distinct', () => {
    const tree: AssetNode[] = [
      group('g', 'g', [
        leaf({ key: 'g_1', ip: '10.0.0.1', username: 'root', uuid: 'uuid-a' }),
        leaf({ key: 'g_2', ip: '10.0.0.1', username: 'root', uuid: 'uuid-b' })
      ])
    ]
    const children = buildExportTree(tree)[0].children as AssetNode[]
    expect(children[0].key).toBe('leaf::uuid-a')
    expect(children[1].key).toBe('leaf::uuid-b')
  })

  it('falls back to composite key when uuid is missing', () => {
    const tree: AssetNode[] = [group('g', 'g', [{ key: 'g_host1', title: 'host1', ip: '10.0.0.1', username: 'root', group_name: 'g' } as AssetNode])]
    const children = buildExportTree(tree)[0].children as AssetNode[]
    expect(children[0].key).toBe('leaf::g_10.0.0.1_root')
  })

  it('disambiguates duplicate fallback keys with #n suffix', () => {
    const tree: AssetNode[] = [
      group('g', 'g', [
        { key: 'a', title: 'a', ip: '10.0.0.1', username: 'root', group_name: 'g' } as AssetNode,
        { key: 'b', title: 'b', ip: '10.0.0.1', username: 'root', group_name: 'g' } as AssetNode
      ])
    ]
    const children = buildExportTree(tree)[0].children as AssetNode[]
    expect(children[0].key).toBe('leaf::g_10.0.0.1_root')
    expect(children[1].key).toBe('leaf::g_10.0.0.1_root#1')
  })

  it('prefixes group keys with group:: and preserves structure', () => {
    const rebuilt = buildExportTree(sampleTree)
    expect(rebuilt[0].key).toBe('group::production')
    expect(rebuilt[1].key).toBe('group::staging')
    expect((rebuilt[0].children as AssetNode[]).length).toBe(3)
  })

  it('does not mutate the input tree', () => {
    const snapshot = JSON.parse(JSON.stringify(sampleTree))
    buildExportTree(sampleTree)
    expect(sampleTree).toEqual(snapshot)
  })

  it('returns empty array for nullish input', () => {
    expect(buildExportTree(null)).toEqual([])
    expect(buildExportTree(undefined)).toEqual([])
    expect(buildExportTree([])).toEqual([])
  })

  it('integrates with resolveCheckedLeafNodes so two same-ip aliases can be independently checked', () => {
    const dupTree: AssetNode[] = [
      group('production', 'production', [
        leaf({ title: 'web-primary', ip: '10.0.0.1', username: 'root', uuid: 'uuid-a' }),
        leaf({ title: 'web-alias', ip: '10.0.0.1', username: 'root', uuid: 'uuid-b' })
      ])
    ]
    const rebuilt = buildExportTree(dupTree)
    const firstKey = (rebuilt[0].children as AssetNode[])[0].key
    const result = resolveCheckedLeafNodes(rebuilt, new Set([firstKey]))
    expect(result.length).toBe(1)
    expect(result[0].title).toBe('web-primary')
  })
})

describe('filterExportTree', () => {
  it('returns the original tree when keyword is empty', () => {
    expect(filterExportTree(sampleTree, '')).toBe(sampleTree)
    expect(filterExportTree(sampleTree, '   ')).toBe(sampleTree)
  })

  it('matches by title (case-insensitive)', () => {
    const result = filterExportTree(sampleTree, 'WEB-A')
    expect(result.length).toBe(1)
    expect(result[0].key).toBe('production')
    expect(result[0].children?.length).toBe(1)
    expect(result[0].children?.[0].title).toBe('web-a')
  })

  it('matches by ip', () => {
    const result = filterExportTree(sampleTree, '10.0.0.3')
    expect(result.length).toBe(1)
    expect(result[0].key).toBe('staging')
    expect(result[0].children?.[0].ip).toBe('10.0.0.3')
  })

  it('matches by label', () => {
    const tree: AssetNode[] = [group('g', 'g', [leaf({ title: 'anon', label: 'custom-label', ip: '10.0.0.9', username: 'root' })])]
    const result = filterExportTree(tree, 'custom-label')
    expect(result.length).toBe(1)
    expect(result[0].children?.[0].label).toBe('custom-label')
  })

  it('keeps parent groups when only descendants match', () => {
    const result = filterExportTree(sampleTree, 'stage-a')
    expect(result.length).toBe(1)
    expect(result[0].key).toBe('staging')
  })

  it('drops branches with no matches', () => {
    expect(filterExportTree(sampleTree, 'no-such-thing')).toEqual([])
  })

  it('handles nullish input', () => {
    expect(filterExportTree(null, 'x')).toEqual([])
    expect(filterExportTree(undefined, '')).toEqual([])
  })
})

describe('toExportPayloads', () => {
  it('maps a leaf to the expected JSON payload shape with defaults', () => {
    const [payload] = toExportPayloads([
      leaf({
        ip: '10.0.0.1',
        username: 'root',
        title: 'fallback-title',
        group_name: 'production'
      })
    ])
    expect(payload).toEqual({
      username: 'root',
      password: '',
      ip: '10.0.0.1',
      label: 'fallback-title',
      group_name: 'production',
      auth_type: 'password',
      keyChain: undefined,
      port: 22,
      asset_type: 'person',
      needProxy: false,
      proxyName: ''
    })
  })

  it('preserves explicit optional fields', () => {
    const [payload] = toExportPayloads([
      leaf({
        ip: '10.0.0.2',
        username: 'ubuntu',
        password: 'secret',
        label: 'web-b',
        auth_type: 'keyBased',
        key_chain_id: 42,
        port: 2222,
        asset_type: 'organization',
        needProxy: true,
        proxyName: 'bastion-1'
      })
    ])
    expect(payload.password).toBe('secret')
    expect(payload.label).toBe('web-b')
    expect(payload.auth_type).toBe('keyBased')
    expect(payload.keyChain).toBe(42)
    expect(payload.port).toBe(2222)
    expect(payload.asset_type).toBe('organization')
    expect(payload.needProxy).toBe(true)
    expect(payload.proxyName).toBe('bastion-1')
  })

  it('prefers explicit label over title as the label output', () => {
    const [payload] = toExportPayloads([leaf({ title: 'title-value', label: 'label-value' })])
    expect(payload.label).toBe('label-value')
  })
})
