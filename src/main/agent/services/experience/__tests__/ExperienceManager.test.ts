import os from 'os'
import path from 'path'
import * as fs from 'fs/promises'
import { get_encoding } from 'tiktoken'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/chaterm-test-user-data') },
  ipcMain: { handle: vi.fn(), on: vi.fn(), once: vi.fn(), removeAllListeners: vi.fn() }
}))

import { ExperienceManager, type ExperienceExtractionInput } from '../ExperienceManager'
import type { TaskExperienceLedgerEntry } from '../../../core/context/context-tracking/ContextTrackerTypes'
import type { KbSearchResult } from '../../../../services/knowledgebase/search/types'

describe('ExperienceManager', () => {
  let kbRoot: string
  let searchMock: ReturnType<typeof vi.fn>
  let onFileChangedMock: ReturnType<typeof vi.fn>
  let llmCalls: string[]

  beforeEach(async () => {
    kbRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'experience-manager-'))
    await fs.mkdir(path.join(kbRoot, 'experience'), { recursive: true })
    searchMock = vi.fn().mockResolvedValue([])
    onFileChangedMock = vi.fn()
    llmCalls = []
  })

  afterEach(async () => {
    await fs.rm(kbRoot, { recursive: true, force: true })
  })

  function createInput(overrides: Partial<ExperienceExtractionInput> = {}): ExperienceExtractionInput {
    return {
      taskId: 'task-1',
      conversationHistory: [
        { role: 'user', content: 'SSH login hangs after banner on bastion' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'execute_command',
              input: { command: 'ssh bastion' }
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: JSON.stringify({
                toolName: 'execute_command',
                result: 'Pseudo-terminal will not be allocated because stdin is not a terminal.'
              })
            }
          ]
        },
        {
          role: 'assistant',
          content: 'The login hangs because no PTY is allocated after the bastion banner.'
        }
      ],
      locale: 'zh-CN',
      taskExperienceLedger: [],
      timestamp: '2026-04-13T15:00:00.000Z',
      ...overrides
    }
  }

  function createManager(responses: string[]) {
    return new ExperienceManager({
      kbRoot,
      kbSearchManager: {
        search: async (query, opts) => (searchMock as any)(query, opts) as Promise<KbSearchResult[]>,
        onFileChanged: (relPath) => {
          ;(onFileChangedMock as any)(relPath)
        }
      },
      now: () => new Date('2026-04-13T15:00:00.000Z'),
      completeWithLlm: vi.fn(async (_systemPrompt: string, userPrompt: string) => {
        llmCalls.push(userPrompt)
        const next = responses.shift()
        if (!next) throw new Error('Unexpected LLM call')
        return next
      })
    })
  }

  function toFingerprint(markdown: string): string {
    return markdown.replace(/\s+/g, ' ').trim()
  }

  it('does not write a file when all candidates are skipped', async () => {
    const manager = createManager([
      JSON.stringify({
        experiences: [
          {
            action: 'skip',
            dedupeKey: 'ssh-bastion-login-hang',
            slug: 'ssh-bastion-login-hang',
            title: 'SSH login hangs after banner on bastion',
            keywords: ['ssh', 'bastion'],
            gist: '只是一次普通交付',
            summaryMarkdown:
              '# 问题场景\nN/A\n\n# 典型症状 / 线索\nN/A\n\n# 根因判断路径\nN/A\n\n# 有效解决方案\nN/A\n\n# 关键命令 / 配置 / 观察点\nN/A\n\n# 适用边界与注意事项\nN/A',
            skipReason: 'ordinary_delivery'
          }
        ]
      })
    ])

    const outcome = await manager.extractFromCompletedTask(createInput())

    expect(outcome.wroteAny).toBe(false)
    expect(outcome.taskExperienceLedger).toEqual([])
    await expect(fs.readdir(path.join(kbRoot, 'experience'))).resolves.toEqual([])
    expect(onFileChangedMock).not.toHaveBeenCalled()
  })

  it('creates multiple new experience files and updates ledger', async () => {
    const manager = createManager([
      JSON.stringify({
        experiences: [
          {
            action: 'new',
            dedupeKey: 'ssh-bastion-login-hang',
            slug: 'ssh-bastion-login-hang',
            title: 'SSH login hangs after banner on bastion host',
            keywords: ['ssh', 'bastion', 'tty'],
            gist: 'SSH 登录在堡垒机 banner 后卡住，根因是未分配 PTY。',
            summaryMarkdown: `# 问题场景
SSH 登录经由堡垒机时，在 banner 输出后卡住。

# 典型症状 / 线索
终端显示 banner 后无响应，且提示没有分配伪终端。

# 根因判断路径
结合报错与行为确认问题出在 PTY 分配而不是网络连通性。

# 有效解决方案
强制分配 TTY，并检查 banner 或登录脚本是否依赖交互终端。

# 关键命令 / 配置 / 观察点
ssh -tt bastion

# 适用边界与注意事项
仅适用于依赖交互终端的登录脚本场景。`
          },
          {
            action: 'new',
            dedupeKey: 'sudo-requires-tty',
            slug: 'sudo-requires-tty',
            title: 'Remote sudo requires a TTY before running privileged commands',
            keywords: ['sudo', 'tty', 'ssh'],
            gist: '远程 sudo 依赖交互终端时，需要先解决 TTY 分配。',
            summaryMarkdown: `# 问题场景
通过 SSH 在远端执行 sudo 命令时失败。

# 典型症状 / 线索
sudo 提示需要终端，或命令直接卡住。

# 根因判断路径
先确认 SSH 会话是否拿到了 PTY，再判断 sudo 策略是否限制非交互执行。

# 有效解决方案
先分配 PTY，再执行需要交互终端的 sudo 命令。

# 关键命令 / 配置 / 观察点
ssh -tt host 'sudo -l'

# 适用边界与注意事项
仅适用于 sudoers 或 PAM 策略依赖 TTY 的环境。`
          }
        ]
      })
    ])

    const outcome = await manager.extractFromCompletedTask(createInput())

    expect(outcome.wroteAny).toBe(true)
    expect(outcome.taskExperienceLedger).toHaveLength(2)
    expect(outcome.taskExperienceLedger.map((entry) => entry.dedupeKey)).toEqual(['ssh-bastion-login-hang', 'sudo-requires-tty'])
    await expect(fs.readFile(path.join(kbRoot, 'experience', 'ssh-bastion-login-hang.md'), 'utf-8')).resolves.toContain('ssh -tt bastion')
    await expect(fs.readFile(path.join(kbRoot, 'experience', 'sudo-requires-tty.md'), 'utf-8')).resolves.toContain("ssh -tt host 'sudo -l'")
    expect(onFileChangedMock).toHaveBeenCalledTimes(2)
  })

  it('skips rewriting an already-ledgered experience when content fingerprint is unchanged', async () => {
    const summaryMarkdown = `# 问题场景
SSH 登录经由堡垒机时，在 banner 输出后卡住。

# 典型症状 / 线索
终端显示 banner 后无响应，且提示没有分配伪终端。

# 根因判断路径
结合报错与行为确认问题出在 PTY 分配而不是网络连通性。

# 有效解决方案
强制分配 TTY，并检查 banner 或登录脚本是否依赖交互终端。

# 关键命令 / 配置 / 观察点
ssh -tt bastion

# 适用边界与注意事项
仅适用于依赖交互终端的登录脚本场景。`
    await fs.writeFile(path.join(kbRoot, 'experience', 'ssh-bastion-login-hang.md'), summaryMarkdown, 'utf-8')

    const existingLedger: TaskExperienceLedgerEntry[] = [
      {
        dedupeKey: 'ssh-bastion-login-hang',
        title: 'SSH login hangs after banner on bastion host',
        slug: 'ssh-bastion-login-hang',
        keywords: ['ssh', 'bastion', 'tty'],
        gist: 'SSH 登录在堡垒机 banner 后卡住，根因是未分配 PTY。',
        kbRelPath: 'experience/ssh-bastion-login-hang.md',
        lastAction: 'new',
        contentFingerprint: toFingerprint(summaryMarkdown),
        updatedAt: '2026-04-13T15:00:00.000Z'
      }
    ]

    const manager = createManager([
      JSON.stringify({
        experiences: [
          {
            action: 'update',
            dedupeKey: 'ssh-bastion-login-hang',
            slug: 'ssh-bastion-login-hang',
            title: 'SSH login hangs after banner on bastion host',
            keywords: ['ssh', 'bastion', 'tty'],
            gist: 'SSH 登录在堡垒机 banner 后卡住，根因是未分配 PTY。',
            summaryMarkdown
          }
        ]
      })
    ])

    const outcome = await manager.extractFromCompletedTask(createInput({ taskExperienceLedger: existingLedger }))

    expect(outcome.wroteAny).toBe(false)
    expect(outcome.taskExperienceLedger).toEqual(existingLedger)
    expect(onFileChangedMock).not.toHaveBeenCalled()
  })

  it('recreates a deleted ledger-linked experience when fingerprint is unchanged', async () => {
    const summaryMarkdown = `# 问题场景
SSH 登录经由堡垒机时，在 banner 输出后卡住。

# 典型症状 / 线索
终端显示 banner 后无响应，且提示没有分配伪终端。

# 根因判断路径
结合报错与行为确认问题出在 PTY 分配而不是网络连通性。

# 有效解决方案
强制分配 TTY，并检查 banner 或登录脚本是否依赖交互终端。

# 关键命令 / 配置 / 观察点
ssh -tt bastion

# 适用边界与注意事项
仅适用于依赖交互终端的登录脚本场景。`
    const manager = createManager([
      JSON.stringify({
        experiences: [
          {
            action: 'update',
            dedupeKey: 'ssh-bastion-login-hang',
            slug: 'ssh-bastion-login-hang',
            title: 'SSH login hangs after banner on bastion host',
            keywords: ['ssh', 'bastion', 'tty'],
            gist: 'SSH 登录在堡垒机 banner 后卡住，根因是未分配 PTY。',
            summaryMarkdown
          }
        ]
      })
    ])

    const outcome = await manager.extractFromCompletedTask(
      createInput({
        taskExperienceLedger: [
          {
            dedupeKey: 'ssh-bastion-login-hang',
            title: 'SSH login hangs after banner on bastion host',
            slug: 'ssh-bastion-login-hang',
            keywords: ['ssh', 'bastion', 'tty'],
            gist: 'SSH 登录在堡垒机 banner 后卡住，根因是未分配 PTY。',
            kbRelPath: 'experience/ssh-bastion-login-hang.md',
            lastAction: 'new',
            contentFingerprint: toFingerprint(summaryMarkdown),
            updatedAt: '2026-04-13T15:00:00.000Z'
          }
        ]
      })
    )

    expect(outcome.wroteAny).toBe(true)
    expect(outcome.taskExperienceLedger).toHaveLength(1)
    expect(outcome.taskExperienceLedger[0].lastAction).toBe('new')
    expect(outcome.taskExperienceLedger[0].kbRelPath).toBe('experience/ssh-bastion-login-hang.md')
    await expect(fs.readFile(path.join(kbRoot, 'experience', 'ssh-bastion-login-hang.md'), 'utf-8')).resolves.toContain('ssh -tt bastion')
    expect(onFileChangedMock).toHaveBeenCalledWith('experience/ssh-bastion-login-hang.md')
  })

  it('prunes deleted ledger entries before building extraction context', async () => {
    const manager = createManager([
      JSON.stringify({
        experiences: []
      })
    ])

    const outcome = await manager.extractFromCompletedTask(
      createInput({
        taskExperienceLedger: [
          {
            dedupeKey: 'deleted-experience',
            title: 'Deleted experience',
            slug: 'deleted-experience',
            keywords: ['ssh', 'ledger'],
            gist: 'This entry should be pruned before extraction.',
            kbRelPath: 'experience/deleted-experience.md',
            lastAction: 'new',
            contentFingerprint: 'fingerprint',
            updatedAt: '2026-04-13T15:00:00.000Z'
          }
        ]
      })
    )

    expect(outcome.wroteAny).toBe(false)
    expect(outcome.taskExperienceLedger).toEqual([])
    expect(llmCalls[0]).not.toContain('deleted-experience')
    expect(onFileChangedMock).not.toHaveBeenCalled()
  })

  it('truncates extraction context by tokens (keeps head/tail with omission marker)', async () => {
    const manager = createManager([
      JSON.stringify({
        experiences: []
      })
    ])

    const headMarker = 'HEAD_MARKER'
    const tailMarker = 'TAIL_MARKER'
    const longBody = ` ${'a '.repeat(210_000)}` // token-ish: should exceed 200k tokens under o200k_base
    await manager.extractFromCompletedTask(
      createInput({
        conversationHistory: [{ role: 'user', content: `${headMarker}${longBody}${tailMarker}` }]
      })
    )

    const userPrompt = llmCalls[0]
    expect(userPrompt).toContain('[... omitted ...]')
    expect(userPrompt).toContain(headMarker)
    expect(userPrompt).toContain(tailMarker)

    const enc = get_encoding('o200k_base')
    try {
      expect(enc.encode(userPrompt).length).toBeLessThanOrEqual(200_000)
    } finally {
      enc.free()
    }
  })

  it('merges into an existing ledger-linked experience when content changed', async () => {
    const existingPath = path.join(kbRoot, 'experience', 'ssh-bastion-login-hang.md')
    await fs.writeFile(
      existingPath,
      `---
title: "Old title"
source: auto-experience
scope: global
created_at: "2026-04-10T10:00:00.000Z"
updated_at: "2026-04-10T10:00:00.000Z"
keywords:
  - "ssh"
dedupe_key: "ssh-bastion-login-hang"
---

# 问题场景
旧场景

# 典型症状 / 线索
旧线索

# 根因判断路径
旧路径

# 有效解决方案
旧方案

# 关键命令 / 配置 / 观察点
旧命令

# 适用边界与注意事项
旧注意事项
`,
      'utf-8'
    )

    const manager = createManager([
      JSON.stringify({
        experiences: [
          {
            action: 'update',
            dedupeKey: 'ssh-bastion-login-hang',
            slug: 'ssh-bastion-login-hang',
            title: 'SSH login hangs after banner on bastion host',
            keywords: ['ssh', 'bastion', 'tty'],
            gist: '补充了需要强制 PTY 的稳定修复方案。',
            summaryMarkdown: `# 问题场景
新场景

# 典型症状 / 线索
新线索

# 根因判断路径
新路径

# 有效解决方案
新方案

# 关键命令 / 配置 / 观察点
ssh -tt bastion

# 适用边界与注意事项
新注意事项`
          }
        ]
      }),
      JSON.stringify({
        title: 'Merged title',
        keywords: ['ssh', 'bastion', 'tty'],
        summaryMarkdown: `# 问题描述
SSH 登录经由堡垒机时，在 banner 输出后卡住。

# 有效解决方案
强制分配 TTY，并执行 ssh -tt bastion 以恢复交互登录。`
      })
    ])

    const outcome = await manager.extractFromCompletedTask(
      createInput({
        taskExperienceLedger: [
          {
            dedupeKey: 'ssh-bastion-login-hang',
            title: 'SSH login hangs after banner on bastion host',
            slug: 'ssh-bastion-login-hang',
            keywords: ['ssh'],
            gist: '旧 gist',
            kbRelPath: 'experience/ssh-bastion-login-hang.md',
            lastAction: 'new',
            contentFingerprint: 'old-fingerprint',
            updatedAt: '2026-04-10T10:00:00.000Z'
          }
        ]
      })
    )

    expect(outcome.wroteAny).toBe(true)
    expect(outcome.taskExperienceLedger[0].lastAction).toBe('update')
    const content = await fs.readFile(existingPath, 'utf-8')
    expect(content).toContain('title: "Merged title"')
    expect(content).toContain('ssh -tt bastion')
    expect(onFileChangedMock).toHaveBeenCalledWith('experience/ssh-bastion-login-hang.md')
  })

  it('falls back to a timestamped file when merge fails', async () => {
    const existingPath = path.join(kbRoot, 'experience', 'ssh-bastion-login-hang.md')
    await fs.writeFile(
      existingPath,
      `---
title: "Old title"
source: auto-experience
scope: global
created_at: "2026-04-10T10:00:00.000Z"
updated_at: "2026-04-10T10:00:00.000Z"
keywords:
  - "ssh"
dedupe_key: "ssh-bastion-login-hang"
---

# 问题场景
旧场景

# 典型症状 / 线索
旧线索

# 根因判断路径
旧路径

# 有效解决方案
旧方案

# 关键命令 / 配置 / 观察点
旧命令

# 适用边界与注意事项
旧注意事项
`,
      'utf-8'
    )

    const manager = createManager([
      JSON.stringify({
        experiences: [
          {
            action: 'update',
            dedupeKey: 'ssh-bastion-login-hang',
            slug: 'ssh-bastion-login-hang',
            title: 'SSH login hangs after banner on bastion host',
            keywords: ['ssh', 'bastion'],
            gist: '新增了更可靠的修复命令。',
            summaryMarkdown: `# 问题场景
新场景

# 典型症状 / 线索
新线索

# 根因判断路径
新路径

# 有效解决方案
新方案

# 关键命令 / 配置 / 观察点
新命令

# 适用边界与注意事项
新注意事项`
          }
        ]
      }),
      '{"title":"broken-json"'
    ])

    const outcome = await manager.extractFromCompletedTask(
      createInput({
        taskExperienceLedger: [
          {
            dedupeKey: 'ssh-bastion-login-hang',
            title: 'SSH login hangs after banner on bastion host',
            slug: 'ssh-bastion-login-hang',
            keywords: ['ssh'],
            gist: '旧 gist',
            kbRelPath: 'experience/ssh-bastion-login-hang.md',
            lastAction: 'new',
            contentFingerprint: 'old-fingerprint',
            updatedAt: '2026-04-10T10:00:00.000Z'
          }
        ]
      })
    )

    expect(outcome.wroteAny).toBe(true)
    const originalContent = await fs.readFile(existingPath, 'utf-8')
    expect(originalContent).toContain('Old title')

    const files = await fs.readdir(path.join(kbRoot, 'experience'))
    expect(files).toContain('ssh-bastion-login-hang.md')
    expect(files).toContain('ssh-bastion-login-hang-20260413T150000Z.md')
    expect(onFileChangedMock).toHaveBeenCalledWith('experience/ssh-bastion-login-hang-20260413T150000Z.md')
  })

  it('truncates oversized context only once at the final stage', async () => {
    const longConversationHistory = Array.from({ length: 220 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `line-${index}-${'x '.repeat(1000)}`
    })) as ExperienceExtractionInput['conversationHistory']
    await fs.writeFile(path.join(kbRoot, 'experience', 'existing-ledger-entry.md'), 'placeholder', 'utf-8')

    const manager = createManager([
      JSON.stringify({
        experiences: []
      })
    ])

    await manager.extractFromCompletedTask(
      createInput({
        conversationHistory: longConversationHistory,
        taskExperienceLedger: [
          {
            dedupeKey: 'existing-ledger-entry',
            title: 'Existing ledger entry',
            slug: 'existing-ledger-entry',
            keywords: ['ssh', 'ledger'],
            gist: 'This entry should still appear in the serialized context.',
            kbRelPath: 'experience/existing-ledger-entry.md',
            lastAction: 'new',
            contentFingerprint: 'fingerprint',
            updatedAt: '2026-04-13T15:00:00.000Z'
          }
        ]
      })
    )

    expect(llmCalls).toHaveLength(1)
    expect(llmCalls[0]).toContain('[... omitted ...]')
    expect(llmCalls[0]).toContain('line-0-')
    expect(llmCalls[0]).toContain('line-219-')
    expect(llmCalls[0]).toContain('existing-ledger-entry')
  })

  it('keeps only a tool_result stub in serialized context', async () => {
    const manager = createManager([
      JSON.stringify({
        experiences: []
      })
    ])

    await manager.extractFromCompletedTask(
      createInput({
        conversationHistory: [
          { role: 'user', content: 'Check why SSH command failed' },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-1',
                content: JSON.stringify({
                  toolName: 'execute_command',
                  result: 'Pseudo-terminal will not be allocated because stdin is not a terminal.',
                  isError: true,
                  docPath: '@offload/tool/out.txt'
                })
              }
            ]
          }
        ]
      })
    )

    expect(llmCalls).toHaveLength(1)
    expect(llmCalls[0]).toContain('tool_result execute_command error')
    expect(llmCalls[0]).not.toContain('Pseudo-terminal will not be allocated because stdin is not a terminal.')
    expect(llmCalls[0]).not.toContain('@offload/tool/out.txt')
  })

  it('strips environment_details from serialized conversation text', async () => {
    const manager = createManager([
      JSON.stringify({
        experiences: []
      })
    ])

    await manager.extractFromCompletedTask(
      createInput({
        conversationHistory: [
          {
            role: 'user',
            content:
              'Please inspect the current state.\n<environment_details>\n# 当前时间:\n2026/4/16 上午10:16:35 (Asia/Shanghai, UTC+8:00)\n\n# 当前主机:[127.0.0.1]\n</environment_details>'
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'I will use the available context.\n<environment_details>\n# 上下文窗口使用情况:\n0 / 128K 令牌已使用 (0%)\n</environment_details>\nThen continue.'
              }
            ]
          }
        ]
      })
    )

    expect(llmCalls).toHaveLength(1)
    expect(llmCalls[0]).toContain('Please inspect the current state.')
    expect(llmCalls[0]).toContain('I will use the available context.\nThen continue.')
    expect(llmCalls[0]).not.toContain('<environment_details>')
    expect(llmCalls[0]).not.toContain('127.0.0.1')
    expect(llmCalls[0]).not.toContain('0 / 128K')
  })

  it('accepts English headings when locale is en-US', async () => {
    const manager = createManager([
      JSON.stringify({
        experiences: [
          {
            action: 'new',
            dedupeKey: 'ssh-bastion-login-hang',
            slug: 'ssh-bastion-login-hang',
            title: 'SSH login hangs after banner on bastion host',
            keywords: ['ssh', 'bastion', 'tty'],
            gist: 'SSH login stalls after the bastion banner because no PTY is allocated.',
            summaryMarkdown: `# Problem Context
SSH login through a bastion host stalls after the banner is printed.

# Typical Symptoms / Clues
The banner is shown and the session stops progressing, with a PTY-related message.

# Root Cause Analysis Path
The failure pattern points to PTY allocation rather than a transport connectivity issue.

# Effective Solution
Force TTY allocation and verify whether the login path depends on an interactive terminal.

# Key Commands / Config / Observations
ssh -tt bastion

# Scope and Caveats
This applies when the bastion login flow depends on an interactive terminal.`
          }
        ]
      })
    ])

    const outcome = await manager.extractFromCompletedTask(
      createInput({
        locale: 'en-US'
      })
    )

    expect(outcome.wroteAny).toBe(true)
    await expect(fs.readFile(path.join(kbRoot, 'experience', 'ssh-bastion-login-hang.md'), 'utf-8')).resolves.toContain('# Problem Context')
  })
})
