import { describe, it, expect } from 'vitest'
import { SYSTEM_PROMPT, SYSTEM_PROMPT_CN } from '../system'

describe('system prompt sudo rule', () => {
  it('does not include sudo permission prohibition in English prompt', () => {
    expect(SYSTEM_PROMPT).not.toContain("If the user doesn't have sudo permission")
  })

  it('does not include sudo permission prohibition in Chinese prompt', () => {
    expect(SYSTEM_PROMPT_CN).not.toContain('如果用户没有sudo权限')
  })
})
