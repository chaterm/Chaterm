import { describe, expect, it } from 'vitest'

import { sanitizeHtml, stripInvisibleUnicode } from '../web-fetch-visibility'

describe('web-fetch-visibility', () => {
  it('removes comment nodes through DOM traversal', async () => {
    const sanitized = await sanitizeHtml('<div>safe<!-- hidden --><span>text</span></div>')

    expect(sanitized).toContain('safe')
    expect(sanitized).toContain('text')
    expect(sanitized).not.toContain('hidden')
    expect(sanitized).not.toContain('<!--')
  })

  it('removes invisible unicode characters until stable', () => {
    const text = `a\u200Bb\u2060c\uFEFFd`

    expect(stripInvisibleUnicode(text)).toBe('abcd')
  })
})
