import { describe, it, expect } from 'vitest'
import { convertFileLocalResourceSrc } from '../convertFileLocalResourceSrc'

describe('convertFileLocalResourceSrc', () => {
  it('maps file URL to local-resource with absolute path (three-slash form)', () => {
    const fileUrl = 'file:///Users/test/Library/Application%20Support/chaterm-global/chaterm_db/2000009/plugins/aws-ec2-connect-1.0.0/icons/aws.svg'
    const out = convertFileLocalResourceSrc(fileUrl)
    expect(out).toBe(
      'local-resource:///Users/test/Library/Application%20Support/chaterm-global/chaterm_db/2000009/plugins/aws-ec2-connect-1.0.0/icons/aws.svg'
    )
    expect(decodeURIComponent(new URL(out).pathname)).toBe(
      '/Users/test/Library/Application Support/chaterm-global/chaterm_db/2000009/plugins/aws-ec2-connect-1.0.0/icons/aws.svg'
    )
  })

  it('returns http and data URLs unchanged', () => {
    expect(convertFileLocalResourceSrc('https://example.com/i.png')).toBe('https://example.com/i.png')
    expect(convertFileLocalResourceSrc('data:image/png;base64,xx')).toBe('data:image/png;base64,xx')
  })

  it('returns empty for null', () => {
    expect(convertFileLocalResourceSrc(null)).toBe('')
  })
})
