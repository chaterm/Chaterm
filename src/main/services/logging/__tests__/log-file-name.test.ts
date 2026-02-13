import { describe, expect, it } from 'vitest'
import { buildLogFileName } from '../logFileName'

describe('log file naming', () => {
  it('uses a single daily log file without channel suffix', () => {
    const fileName = buildLogFileName(new Date('2026-02-11T12:00:00.000Z'))

    expect(fileName).toBe('chaterm_2026-02-11.log')
    expect(fileName).not.toContain('app')
    expect(fileName).not.toContain('terminal')
  })
})
