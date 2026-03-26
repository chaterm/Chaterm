import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'

vi.mock('../../../agent/core/offload', () => ({
  getOffloadDir: vi.fn((taskId: string) => path.join('/offload', taskId))
}))

vi.mock('../../knowledgebase', () => ({
  getKnowledgeBaseRoot: vi.fn(() => path.join('/data', 'knowledgebase'))
}))

vi.mock('fs/promises', () => ({
  stat: vi.fn(),
  mkdir: vi.fn(),
  copyFile: vi.fn()
}))

import * as fs from 'fs/promises'
import { stageChatAttachment, MAX_CHAT_ATTACHMENT_BYTES } from '../stageChatAttachment'

describe('stageChatAttachment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(process, 'cwd').mockReturnValue(path.resolve('/workspace/proj'))
  })

  it('returns as_is when file is under workspace', async () => {
    const underWs = path.join(process.cwd(), 'src', 'a.md')
    vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true, size: 10 } as any)

    const r = await stageChatAttachment('t1', underWs)

    expect(r).toEqual({ mode: 'as_is', refPath: path.resolve(underWs) })
    expect(fs.copyFile).not.toHaveBeenCalled()
  })

  it('copies to offload when outside workspace', async () => {
    const outside = '/etc/secret.md'
    vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true, size: 5 } as any)
    vi.mocked(fs.mkdir).mockResolvedValue(undefined)
    vi.mocked(fs.copyFile).mockResolvedValue(undefined)

    const r = await stageChatAttachment('t1', outside)

    expect(r.mode).toBe('offload')
    expect(r.refPath).toMatch(/^offload\/user-uploads\/[0-9a-f-]+-secret\.md$/i)
    expect(fs.copyFile).toHaveBeenCalledTimes(1)
    const [, dest] = vi.mocked(fs.copyFile).mock.calls[0]
    expect(String(dest)).toContain(path.join('offload', 't1', 'user-uploads'))
  })

  it('rejects oversized files', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true, size: MAX_CHAT_ATTACHMENT_BYTES + 1 } as any)

    await expect(stageChatAttachment('t1', '/x.txt')).rejects.toThrow(/exceeds maximum size/)
  })

  it('rejects empty taskId', async () => {
    await expect(stageChatAttachment('', '/x.txt')).rejects.toThrow(/taskId is required/)
  })
})
