import { describe, it, expect, vi } from 'vitest'

vi.mock('path', async () => {
  const actual = await vi.importActual('path')
  return actual
})

import { arePathsEqual } from '../path'

describe('Path Utilities', () => {
  describe('arePathsEqual', () => {
    it('should handle undefined paths', () => {
      expect(arePathsEqual(undefined, undefined)).toBe(true)
      expect(arePathsEqual('foo', undefined)).toBe(false)
      expect(arePathsEqual(undefined, 'foo')).toBe(false)
    })

    it('should handle case sensitivity based on platform', () => {
      if (process.platform === 'win32') {
        expect(arePathsEqual('FOO/BAR', 'foo/bar')).toBe(true)
      } else {
        expect(arePathsEqual('FOO/BAR', 'foo/bar')).toBe(false)
      }
    })

    it('should handle normalized paths', () => {
      expect(arePathsEqual('/tmp/./dir', '/tmp/../tmp/dir')).toBe(true)
      expect(arePathsEqual('/tmp/./dir', '/tmp/../dir')).toBe(false)
    })
  })
})
