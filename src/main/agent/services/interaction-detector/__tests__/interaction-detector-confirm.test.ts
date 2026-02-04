import { describe, it, expect } from 'vitest'
import { InteractionDetector, InteractionRequest } from '../index'

describe('interaction-detector confirm patterns', () => {
  it('detects rm -i prompt as confirm', () => {
    const detector = new InteractionDetector('rm -i /tmp/itest_file', 'cmd_test')
    let seen: InteractionRequest | null = null
    detector.on('interaction-needed', (req) => {
      seen = req
    })

    detector.onOutput("rm: remove regular empty file '/tmp/itest_file'?\n")

    expect(seen).not.toBeNull()
    expect(seen!.interactionType).toBe('confirm')
  })

  it('includes taskId in interaction requests when provided', () => {
    const detector = new InteractionDetector('rm -i /tmp/itest_file', 'cmd_test', undefined, 'task-1')
    let seen: InteractionRequest | null = null
    detector.on('interaction-needed', (req) => {
      seen = req
    })

    detector.onOutput("rm: remove regular empty file '/tmp/itest_file'?\n")

    expect(seen).not.toBeNull()
    expect(seen!.taskId).toBe('task-1')
  })

  it('accepts confirmValues.default as null by normalizing', () => {
    const detector = new InteractionDetector('rm -i /tmp/itest_file', 'cmd_test')

    const result = (detector as any).validateResult({
      needsInteraction: true,
      interactionType: 'confirm',
      promptHint: '确认是否删除文件',
      confirmValues: { yes: 'y', no: 'n', default: null }
    })

    expect(result.interactionType).toBe('confirm')
    expect(result.confirmValues?.default).toBeUndefined()
  })
})
