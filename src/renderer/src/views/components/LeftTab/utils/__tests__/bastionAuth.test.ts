import { describe, it, expect } from 'vitest'
import { resolveBastionAuthType, type BastionDefinitionSummary } from '../types'

describe('resolveBastionAuthType', () => {
  it('forces keyBased for jumpserver', () => {
    expect(resolveBastionAuthType('organization', [], 'password')).toBe('keyBased')
  })

  it('falls back to definition authPolicy when current is not allowed', () => {
    const defs: BastionDefinitionSummary[] = [{ type: 'qizhi', authPolicy: ['keyBased'] }]
    expect(resolveBastionAuthType('organization-qizhi', defs, 'password')).toBe('keyBased')
  })

  it('keeps current auth type when allowed', () => {
    const defs: BastionDefinitionSummary[] = [{ type: 'tencent', authPolicy: ['password', 'keyBased'] }]
    expect(resolveBastionAuthType('organization-tencent', defs, 'password')).toBe('password')
  })

  it('preserves current auth type when definition is missing', () => {
    expect(resolveBastionAuthType('organization-unknown', [], 'keyBased')).toBe('keyBased')
  })

  it('ignores invalid current auth type when definition is missing', () => {
    expect(resolveBastionAuthType('organization-unknown', [], 'token')).toBe('password')
  })

  it('defaults to password for personal assets', () => {
    expect(resolveBastionAuthType('person', [], 'keyBased')).toBe('password')
  })
})
