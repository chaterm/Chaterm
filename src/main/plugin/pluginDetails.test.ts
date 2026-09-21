import { describe, it, expect } from 'vitest'
import { fmtTime } from './pluginDetails'

/**
 * Regression test for the plugin-detail timestamp bug.
 *
 * `toISOString()` always formats in UTC.  For a user in UTC+8 whose file was
 * last modified at 2026-01-15 22:30:00 local, the old code rendered
 * "2026-01-15 14:30:00" (UTC) — eight hours too early.  The fix uses the
 * same local-time formatter (`fmtTime`) that sftpTransfer already adopted
 * in commit d101cc1.
 */

const pad2 = (n: number) => String(n).padStart(2, '0')

describe('pluginDetails timestamp formatting', () => {
  it('fmtTime returns local time, not UTC', () => {
    // Pick a fixed epoch.  The exact local rendering depends on the machine's
    // timezone, but we can assert it matches Date's own local accessors —
    // which is the whole point of the fix.
    const epoch = 1736976600000 // 2025-01-15T22:30:00.000Z
    const d = new Date(epoch)

    const result = fmtTime(d)

    // Build the expected string from the same local accessors fmtTime uses.
    const expected =
      `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
      `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`

    expect(result).toBe(expected)
  })

  it('old toISOString pattern diverges from local time when offset != 0', () => {
    const epoch = 1736976600000
    const d = new Date(epoch)

    // Old pattern (the bug):
    const utcStr = d.toISOString().replace('T', ' ').substring(0, 19)
    // New pattern:
    const localStr = fmtTime(d)

    // If the machine's UTC offset is non-zero the two strings differ — that
    // is the bug.  If the offset happens to be zero the test still passes
    // (both are equal) but doesn't demonstrate the divergence.
    const offsetMinutes = d.getTimezoneOffset()
    if (offsetMinutes !== 0) {
      expect(utcStr).not.toBe(localStr)
    }
    // Either way, fmtTime must match the local accessors.
    expect(localStr).toContain(String(d.getFullYear()))
    expect(localStr).toContain(pad2(d.getHours()))
  })

  it('fmtTime returns empty string for invalid dates', () => {
    expect(fmtTime(new Date(NaN))).toBe('')
    expect(fmtTime(new Date('not-a-date'))).toBe('')
  })
})
