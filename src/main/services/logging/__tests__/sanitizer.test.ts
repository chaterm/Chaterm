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

    describe('camelCase / prefixed key substring matching', () => {
      const camelCaseKeys = [
        'anthropicApiKey',
        'openAiApiKey',
        'deepSeekApiKey',
        'liteLlmApiKey',
        'defaultApiKey',
        'awsAccessKey',
        'awsSecretKey',
        'awsSessionToken',
        'userPassword',
        'dbPassword',
        'clientSecret',
        'oauthRefreshToken',
        'httpAuthorization'
      ]

      for (const key of camelCaseKeys) {
        it(`redacts camelCase key: ${key}`, () => {
          const input = { [key]: 'some-sensitive-value-12345' }
          const result = sanitize(input) as Record<string, unknown>
          expect(result[key]).toBe('[REDACTED]')
        })
      }

      it('does not false-positive on unrelated keys', () => {
        const input = { tokenizer: 'gpt-4', keyboard: 'us', secrets_count: 5 }
        const result = sanitize(input) as Record<string, unknown>
        // "tokenizer" should NOT match (token is exact-match only)
        expect(result['tokenizer']).toBe('gpt-4')
        // "keyboard" should NOT match (key is exact-match only)
        expect(result['keyboard']).toBe('us')
        // "secrets_count" SHOULD match (contains "secret" substring)
        expect(result['secrets_count']).toBe('[REDACTED]')
        // "ghostwriter" should NOT match (host is exact-match only)
        expect((sanitize({ ghostwriter: 'text' }) as Record<string, unknown>)['ghostwriter']).toBe('text')
      })
    })

    describe('host/hostname partial masking', () => {
      it('masks IP-style host by hiding last octet', () => {
        const input = { host: '192.168.1.100' }
        const result = sanitize(input) as Record<string, string>
        expect(result.host).toBe('192.168.1.***')
      })

      it('masks domain-style host by hiding last segment', () => {
        const input = { host: 'prod.db.example.com' }
        const result = sanitize(input) as Record<string, string>
        expect(result.host).toBe('prod.db.example.***')
      })

      it('masks hostname field the same way', () => {
        const input = { hostname: '10.0.0.5' }
        const result = sanitize(input) as Record<string, string>
        expect(result.hostname).toBe('10.0.0.***')
      })

      it('masks single-label host', () => {
        const input = { host: 'myserver' }
        const result = sanitize(input) as Record<string, string>
        expect(result.host).toBe('myse***')
      })

      it('masks short host', () => {
        const input = { host: 'db' }
        const result = sanitize(input) as Record<string, string>
        expect(result.host).toBe('***')
      })

      it('does not affect non-string host values', () => {
        const input = { host: 12345 }
        const result = sanitize(input) as Record<string, number>
        expect(result.host).toBe(12345)
      })
    })

    describe('connection-related key redaction', () => {
      it('redacts username field', () => {
        const input = { username: 'admin' }
        expect((sanitize(input) as Record<string, unknown>).username).toBe('[REDACTED]')
      })

      it('redacts proxyUrl field', () => {
        const input = { proxyUrl: 'http://proxy.corp:8080' }
        expect((sanitize(input) as Record<string, unknown>).proxyUrl).toBe('[REDACTED]')
      })

      it('redacts proxyPassword field', () => {
        const input = { proxyPassword: 'secret123' }
        expect((sanitize(input) as Record<string, unknown>).proxyPassword).toBe('[REDACTED]')
      })

      it('redacts encryptionKey field', () => {
        const input = { encryptionKey: 'aes-256-key-here' }
        expect((sanitize(input) as Record<string, unknown>).encryptionKey).toBe('[REDACTED]')
      })
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

    it('redacts Anthropic API keys (sk-ant-...)', () => {
      const input = { data: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz' }
      const result = sanitize(input) as Record<string, unknown>
      expect(result.data).toBe('[REDACTED]')
    })

    it('redacts OpenAI API keys (sk-...)', () => {
      const input = { data: 'sk-proj-abcdefghijklmnopqrstuvwxyz1234' }
      const result = sanitize(input) as Record<string, unknown>
      expect(result.data).toBe('[REDACTED]')
    })

    it('redacts OpenAI legacy keys (sk-...)', () => {
      const input = { data: 'sk-abcdefghijklmnopqrstuvwxyz1234' }
      const result = sanitize(input) as Record<string, unknown>
      expect(result.data).toBe('[REDACTED]')
    })

    it('redacts URL credentials (proto://user:pass@host)', () => {
      const input = { data: 'mongodb://admin:p4ssw0rd@db.example.com:27017/mydb' }
      const result = sanitize(input) as Record<string, unknown>
      expect(result.data).toBe('[REDACTED]')
    })

    it('redacts HTTP proxy URL credentials', () => {
      const input = { data: 'http://user:secret@proxy.corp.com:8080' }
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

    it('sanitizes credentials embedded in Error message', () => {
      const err = new Error('400 "Invalid Authorization apikey: adaffas019b211532867484a4fa67b7b8cb8206"')
      const result = sanitize(err) as Record<string, unknown>
      expect(result.message).not.toContain('adaffas019b211532867484a4fa67b7b8cb8206')
      expect(result.message as string).toContain('apikey:')
      expect(result.message as string).toContain('***')
    })

    it('sanitizes credentials in Error stack trace', () => {
      const err = new Error('token: mysecrettoken12345678')
      const result = sanitize(err) as Record<string, unknown>
      expect(result.message).not.toContain('mysecrettoken12345678')
      expect(result.stack).not.toContain('mysecrettoken12345678')
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

  describe('PII partial masking', () => {
    describe('Chinese phone numbers', () => {
      it('masks 11-digit mainland number', () => {
        expect(sanitize('call 13812345678 now')).toBe('call 138****5678 now')
      })

      it('masks with +86 prefix', () => {
        expect(sanitize('+8613812345678')).toBe('+86138****5678')
      })

      it('masks with 86 prefix (no plus)', () => {
        expect(sanitize('8613812345678')).toBe('86138****5678')
      })

      it('masks with separators', () => {
        expect(sanitize('138-1234-5678')).toBe('138****5678')
      })

      it('masks with +86 and separator', () => {
        expect(sanitize('+86 13812345678')).toBe('+86138****5678')
      })

      it('preserves non-phone digit sequences', () => {
        expect(sanitize('order 12345')).toBe('order 12345')
      })
    })

    describe('international phone numbers', () => {
      it('masks +1 US number', () => {
        expect(sanitize('+1 2025551234')).toBe('+120****1234')
      })

      it('masks +44 UK number', () => {
        expect(sanitize('+44 7911123456')).toBe('+447****3456')
      })
    })

    describe('email addresses', () => {
      it('masks standard email', () => {
        expect(sanitize('email: john.doe@example.com')).toBe('email: j***@example.com')
      })

      it('masks short local part (2 chars)', () => {
        expect(sanitize('ab@test.com')).toBe('**@test.com')
      })

      it('masks single char local part', () => {
        expect(sanitize('a@test.com')).toBe('*@test.com')
      })

      it('preserves domain', () => {
        const result = sanitize('user@company.co.uk') as string
        expect(result).toContain('@company.co.uk')
        expect(result).toBe('u***@company.co.uk')
      })
    })

    describe('credit card numbers', () => {
      it('masks 16-digit card with spaces', () => {
        expect(sanitize('card: 4111 1111 1111 1111')).toBe('card: 4111 **** **** 1111')
      })

      it('masks 16-digit card with dashes', () => {
        expect(sanitize('4111-1111-1111-1111')).toBe('4111 **** **** 1111')
      })

      it('masks continuous 16-digit card', () => {
        expect(sanitize('4111111111111111')).toBe('4111 **** **** 1111')
      })
    })

    describe('Chinese ID card numbers', () => {
      it('masks 18-digit ID card', () => {
        // Valid structure: 6-digit area + 8-digit birthdate + 3-digit sequence + check digit
        expect(sanitize('ID: 110101199003071234')).toBe('ID: 110101********1234')
      })

      it('masks ID card with X check digit', () => {
        expect(sanitize('11010119900307123X')).toBe('110101********123X')
      })
    })

    describe('IPv4 addresses', () => {
      it('masks last octet', () => {
        expect(sanitize('server: 192.168.1.100')).toBe('server: 192.168.1.***')
      })

      it('masks loopback address', () => {
        expect(sanitize('127.0.0.1')).toBe('127.0.0.***')
      })

      it('does not mask invalid IPs', () => {
        expect(sanitize('999.999.999.999')).toBe('999.999.999.999')
      })
    })

    describe('MAC addresses', () => {
      it('masks colon-separated MAC address', () => {
        expect(sanitize('device AA:BB:CC:DD:EE:FF online')).toBe('device AA:BB:CC:**:**:** online')
      })

      it('masks dash-separated MAC address', () => {
        expect(sanitize('AA-BB-CC-DD-EE-FF')).toBe('AA-BB-CC-**-**-**')
      })

      it('masks lowercase MAC address', () => {
        expect(sanitize('mac: aa:bb:cc:dd:ee:ff')).toBe('mac: aa:bb:cc:**:**:**')
      })

      it('does not mask partial hex sequences', () => {
        expect(sanitize('version 1.2.3')).toBe('version 1.2.3')
      })
    })

    describe('IPv6 addresses', () => {
      it('masks full IPv6 address', () => {
        expect(sanitize('addr: 2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('addr: 2001:***')
      })

      it('masks compressed IPv6 address', () => {
        expect(sanitize('from fe80::1')).toBe('from fe80:***')
      })

      it('masks loopback ::1', () => {
        const result = sanitize('localhost ::1') as string
        expect(result).toContain(':***')
      })
    })

    describe('mixed PII in strings', () => {
      it('masks multiple PII types in one string', () => {
        const input = 'User 13812345678 email john@test.com from 10.0.0.1'
        const result = sanitize(input) as string
        expect(result).toContain('138****5678')
        expect(result).toContain('j***@test.com')
        expect(result).toContain('10.0.0.***')
      })
    })

    describe('PII in nested objects', () => {
      it('masks PII in nested object values', () => {
        const input = {
          user: {
            phone: '13812345678',
            email: 'alice@example.com',
            ip: '192.168.0.1'
          }
        }
        const result = sanitize(input) as Record<string, Record<string, string>>
        expect(result.user.phone).toBe('138****5678')
        expect(result.user.email).toBe('a***@example.com')
        expect(result.user.ip).toBe('192.168.0.***')
      })

      it('masks PII in arrays', () => {
        const input = { phones: ['13812345678', '13987654321'] }
        const result = sanitize(input) as Record<string, string[]>
        expect(result.phones[0]).toBe('138****5678')
        expect(result.phones[1]).toBe('139****4321')
      })
    })

    describe('inline credential labels in strings', () => {
      it('masks apikey value in error message', () => {
        const input = '400 "Invalid Authorization apikey: adaffas019b211532867484a4fa67b7b8cb8206"'
        const result = sanitize(input) as string
        expect(result).not.toContain('adaffas019b211532867484a4fa67b7b8cb8206')
        expect(result).toContain('apikey:')
        expect(result).toContain('***')
      })

      it('masks token value in error message', () => {
        const result = sanitize('invalid token: abcdef1234567890abcdef') as string
        expect(result).not.toContain('abcdef1234567890abcdef')
        expect(result).toContain('token:')
      })

      it('masks password value in error message', () => {
        const result = sanitize('auth failed password: mysuperpassword123') as string
        expect(result).not.toContain('mysuperpassword123')
        expect(result).toContain('password:')
      })

      it('does not mask short values (< 8 chars)', () => {
        const result = sanitize('apikey: short') as string
        expect(result).toBe('apikey: short')
      })
    })

    describe('existing credential redaction still works', () => {
      it('still redacts password key', () => {
        expect((sanitize({ password: 'secret123' }) as Record<string, unknown>).password).toBe('[REDACTED]')
      })

      it('still redacts JWT in values', () => {
        expect(sanitize('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkw')).toBe('[REDACTED]')
      })

      it('still redacts PEM keys in values', () => {
        expect(sanitize('-----BEGIN RSA PRIVATE KEY-----\nMIIE...')).toBe('[REDACTED]')
      })
    })
  })
})
