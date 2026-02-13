import { describe, it, expect } from 'vitest'
import { sanitize } from '../sanitizer'

describe('sanitizer', () => {
  describe('credential key redaction', () => {
    const sensitiveKeys = [
      'password',
      'privateKey',
      'passphrase',
      'token',
      'secret',
      'apiKey',
      'accessKey',
      'authorization',
      'cookie',
      'credential',
      'jwt',
      'bearer',
      'secretKey',
      'sessionToken',
      'refreshToken'
    ]

    for (const key of sensitiveKeys) {
      it(`redacts ${key}`, () => {
        const input = { [key]: 'sensitive-value-here' }
        const result = sanitize(input) as Record<string, unknown>
        expect(result[key]).toBe('[REDACTED]')
      })
    }

    it('redacts "key" only when value is a long string', () => {
      const longKey = { key: 'a'.repeat(20) }
      const shortKey = { key: 'short' }
      expect((sanitize(longKey) as Record<string, unknown>).key).toBe('[REDACTED]')
      expect((sanitize(shortKey) as Record<string, unknown>).key).toBe('short')
    })

    it('is case-insensitive for key matching', () => {
      const input = { PASSWORD: 'secret', ApiKey: 'key123' }
      const result = sanitize(input) as Record<string, unknown>
      expect(result['PASSWORD']).toBe('[REDACTED]')
      expect(result['ApiKey']).toBe('[REDACTED]')
    })
  })

  describe('value pattern redaction', () => {
    it('redacts PEM private key headers', () => {
      const input = { data: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...' }
      const result = sanitize(input) as Record<string, unknown>
      expect(result.data).toBe('[REDACTED]')
    })

    it('redacts JWT tokens', () => {
      const input = { data: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkw' }
      const result = sanitize(input) as Record<string, unknown>
      expect(result.data).toBe('[REDACTED]')
    })

    it('redacts AWS AKIA keys', () => {
      const input = { data: 'AKIAIOSFODNN7EXAMPLE' }
      const result = sanitize(input) as Record<string, unknown>
      expect(result.data).toBe('[REDACTED]')
    })
  })

  describe('circular reference protection', () => {
    it('handles circular references without crashing', () => {
      const obj: Record<string, unknown> = { a: 1 }
      obj.self = obj
      const result = sanitize(obj) as Record<string, unknown>
      expect(result.self).toBe('[CIRCULAR]')
      expect(result.a).toBe(1)
    })
  })

  describe('depth limiting', () => {
    it('stops at maxDepth=4', () => {
      // depth 0=root, 1=l1, 2=l2, 3=l3, 4=l4, 5=l5 exceeds MAX_DEPTH
      const deep = { l1: { l2: { l3: { l4: { l5: 'deep' } } } } }
      const result = sanitize(deep) as Record<string, unknown>
      const l4 = ((((result as Record<string, unknown>).l1 as Record<string, unknown>).l2 as Record<string, unknown>).l3 as Record<string, unknown>)
        .l4 as Record<string, unknown>
      expect(l4.l5).toBe('[MAX_DEPTH]')
    })
  })

  describe('width limiting', () => {
    it('truncates objects with more than 32 keys', () => {
      const wide: Record<string, number> = {}
      for (let i = 0; i < 40; i++) wide[`k${i}`] = i
      const result = sanitize(wide) as Record<string, unknown>
      expect(result.__truncated__).toBe('8 more keys')
    })
  })

  describe('string truncation', () => {
    it('truncates strings longer than 4096 chars', () => {
      const input = { data: 'x'.repeat(5000) }
      const result = sanitize(input) as Record<string, unknown>
      expect(typeof result.data).toBe('string')
      expect((result.data as string).length).toBeLessThan(5000)
      expect(result.data as string).toContain('[truncated')
    })
  })

  describe('Error serialization', () => {
    it('extracts only name, message, stack from Error', () => {
      const err = new Error('test error')
      const result = sanitize(err) as Record<string, unknown>
      expect(result).toHaveProperty('name', 'Error')
      expect(result).toHaveProperty('message', 'test error')
      expect(result).toHaveProperty('stack')
      expect(Object.keys(result)).toEqual(['name', 'message', 'stack'])
    })
  })

  describe('primitive values', () => {
    it('passes through numbers and booleans', () => {
      expect(sanitize(42)).toBe(42)
      expect(sanitize(true)).toBe(true)
      expect(sanitize(null)).toBe(null)
      expect(sanitize(undefined)).toBe(undefined)
    })
  })
})
