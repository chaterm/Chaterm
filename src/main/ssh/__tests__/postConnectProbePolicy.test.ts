import { describe, expect, it } from 'vitest'
import { shouldSkipPostConnectProbe } from '../postConnectProbePolicy'

describe('post connect probe policy', () => {
  it('skips probe for explicit flag', () => {
    expect(
      shouldSkipPostConnectProbe({
        disablePostConnectProbe: true
      })
    ).toBe(true)
  })

  it('skips probe for xshell wakeup source', () => {
    expect(
      shouldSkipPostConnectProbe({
        wakeupSource: 'xshell-direct'
      })
    ).toBe(true)
  })

  it('skips probe for xshell generated session id', () => {
    expect(
      shouldSkipPostConnectProbe({
        id: 'test@1.1.1.1:local:dGVzdA==:xshell-1742800000000'
      })
    ).toBe(true)
  })

  it('does not skip for regular workspace ssh', () => {
    expect(
      shouldSkipPostConnectProbe({
        id: 'user@1.1.1.1:local:dGVzdA==:regular-session',
        wakeupSource: 'workspace'
      })
    ).toBe(false)
  })
})
