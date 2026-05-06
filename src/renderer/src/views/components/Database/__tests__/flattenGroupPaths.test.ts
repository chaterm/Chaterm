import { describe, it, expect } from 'vitest'
import { flattenGroupPaths } from '@/store/databaseWorkspaceStore.helpers'

describe('flattenGroupPaths', () => {
  it('returns only Root when no groups exist', () => {
    expect(flattenGroupPaths([], null)).toEqual([{ id: null, label: 'Root node' }])
  })

  it('flattens nested groups with slash-joined labels', () => {
    const groups = [
      { id: 'g1', name: 'A', parent_id: null },
      { id: 'g2', name: 'B', parent_id: 'g1' },
      { id: 'g3', name: 'C', parent_id: 'g2' },
      { id: 'g4', name: 'X', parent_id: null }
    ]
    expect(flattenGroupPaths(groups, null)).toEqual([
      { id: null, label: 'Root node' },
      { id: 'g1', label: 'A' },
      { id: 'g2', label: 'A/B' },
      { id: 'g3', label: 'A/B/C' },
      { id: 'g4', label: 'X' }
    ])
  })

  it('excludes the current group and its descendants', () => {
    const groups = [
      { id: 'g1', name: 'A', parent_id: null },
      { id: 'g2', name: 'B', parent_id: 'g1' }
    ]
    // Exclude g1 (current) and g2 (descendant), keep Root only.
    expect(flattenGroupPaths(groups, 'g1')).toEqual([{ id: null, label: 'Root node' }])
  })

  it('keeps Root in the list even when currentGroupId is null (moving from root)', () => {
    const groups = [{ id: 'g1', name: 'A', parent_id: null }]
    // When the asset is already at root, Root is still shown — the UI layer can
    // choose to disable it; the helper stays permissive.
    expect(flattenGroupPaths(groups, null)).toEqual([
      { id: null, label: 'Root node' },
      { id: 'g1', label: 'A' }
    ])
  })
})
