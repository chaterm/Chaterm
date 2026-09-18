import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../../config/edition', () => ({
  getDefaultLanguage: () => 'en-US'
}))

import { buildFtsQuery } from '../searcher'

describe('CJK content detection', () => {
  it('keeps pure Latin input on the Latin tokenizer', () => {
    expect(buildFtsQuery('nginx.conf reload')).toBe('"nginx" OR "conf" OR "reload"')
  })

  it('detects CJK Extension B characters', () => {
    expect(buildFtsQuery('\u{20000}\u{2000B}\u{20089}')).toBe('"\u{20000}" OR "\u{2000B}" OR "\u{20089}"')
  })
})
