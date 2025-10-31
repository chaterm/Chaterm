// npx vitest run index.test.ts

import { describe, expect, it } from 'vitest'

import { decodeHtmlEntities } from '@utils/decodeHtmlEntities'

describe('decodeHtmlEntities', () => {
  it('decodes &gt; within a command string', () => {
    const input = 'ls -t /var/log/*.log 2&gt;/dev/null | head -n 5'
    const output = decodeHtmlEntities(input)
    expect(output).toBe('ls -t /var/log/*.log 2>/dev/null | head -n 5')
  })

  it('decodes mixed named entities', () => {
    const input = 'echo hello &amp;&amp; ls -l &lt; /tmp/input.txt'
    const output = decodeHtmlEntities(input)
    expect(output).toBe('echo hello && ls -l < /tmp/input.txt')
  })

  it('decodes named entities without trailing semicolon', () => {
    const input = 'grep "error" /var/log/syslog 2&gt&1'
    const output = decodeHtmlEntities(input)
    expect(output).toBe('grep "error" /var/log/syslog 2>&1')
  })

  it('decodes numeric decimal entities', () => {
    const input = 'printf "Letter: &#65;"'
    const output = decodeHtmlEntities(input)
    expect(output).toBe('printf "Letter: A"')
  })

  it('decodes numeric hexadecimal entities', () => {
    const input = 'printf "Arrow: &#x2192;"'
    const output = decodeHtmlEntities(input)
    expect(output).toBe('printf "Arrow: →"')
  })

  it('returns original string when no entities are present', () => {
    const input = 'echo plain text'
    const output = decodeHtmlEntities(input)
    expect(output).toBe(input)
  })
})
