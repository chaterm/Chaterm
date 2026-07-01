import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../tabIndex.vue'), 'utf8')

describe('tabIndex.vue tree cursor styles', () => {
  it('makes the whole tree row part of the clickable and draggable label area', () => {
    const treeWrapperRule = source.match(/\.ant-tree-node-content-wrapper\s*\{[\s\S]*?\n\s*\}/)?.[0] || ''
    const treeTitleRule = source.match(/\.ant-tree-title\s*\{[\s\S]*?\n\s*\}/)?.[0] || ''
    const customTreeRule = source.slice(source.indexOf('.custom-tree-node {'))
    const titleRule = customTreeRule.match(/\.title-with-icon\s*\{[\s\S]*?\n\s*&:hover/)?.[0] || ''

    expect(treeWrapperRule).toContain('cursor: pointer')
    expect(treeTitleRule).toContain('flex: 1 1 auto')
    expect(titleRule).toContain('cursor: pointer')
    expect(titleRule).toContain('flex: 1')
  })
})
