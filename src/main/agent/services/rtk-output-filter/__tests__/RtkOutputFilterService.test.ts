import { describe, expect, it, vi } from 'vitest'
import { RtkOutputFilterService, type RtkRunner } from '../RtkOutputFilterService'

vi.mock('electron', () => ({
  app: { isPackaged: false }
}))

vi.mock('@logging/index', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

describe('RtkOutputFilterService', () => {
  it('runs rtk pipe with command metadata and raw output on stdin', async () => {
    const runner = vi.fn<RtkRunner>(async () => ({
      exitCode: 0,
      stdout: 'filtered output\n',
      stderr: ''
    }))
    const service = new RtkOutputFilterService({
      binaryPath: '/tmp/rtk',
      runner
    })

    const result = await service.filterOutput({
      command: 'rg main src',
      output: 'src/main.rs:42:fn main() {}\n',
      cwd: '/repo'
    })

    expect(runner).toHaveBeenCalledWith(
      '/tmp/rtk',
      ['pipe', '--command', 'rg main src'],
      expect.objectContaining({
        input: 'src/main.rs:42:fn main() {}\n',
        cwd: '/repo'
      })
    )
    expect(result).toEqual({
      output: 'filtered output\n',
      applied: true
    })
  })

  it('returns original output when no binary can be resolved', async () => {
    const runner = vi.fn<RtkRunner>()
    const service = new RtkOutputFilterService({
      resourceRoot: '/definitely/not/a/chaterm/resource/root',
      allowPathFallback: false,
      runner
    })

    const result = await service.filterOutput({
      command: 'cargo test',
      output: 'raw output\n'
    })

    expect(runner).not.toHaveBeenCalled()
    expect(result).toEqual({
      output: 'raw output\n',
      applied: false,
      reason: 'binary-missing'
    })
  })

  it('fails open when rtk exits non-zero', async () => {
    const runner = vi.fn<RtkRunner>(async () => ({
      exitCode: 2,
      stdout: 'partial filtered output',
      stderr: 'bad command'
    }))
    const service = new RtkOutputFilterService({
      binaryPath: '/tmp/rtk',
      runner
    })

    const result = await service.filterOutput({
      command: 'npm test',
      output: 'raw output\n'
    })

    expect(result).toEqual({
      output: 'raw output\n',
      applied: false,
      reason: 'non-zero-exit'
    })
  })

  it('fails open when rtk returns empty output for non-empty input', async () => {
    const runner = vi.fn<RtkRunner>(async () => ({
      exitCode: 0,
      stdout: '',
      stderr: ''
    }))
    const service = new RtkOutputFilterService({
      binaryPath: '/tmp/rtk',
      runner
    })

    const result = await service.filterOutput({
      command: 'pytest -q',
      output: 'FAILED test_example.py::test_case\n'
    })

    expect(result).toEqual({
      output: 'FAILED test_example.py::test_case\n',
      applied: false,
      reason: 'empty-filtered-output'
    })
  })

  it('fails open when the runner throws', async () => {
    const runner = vi.fn<RtkRunner>(async () => {
      throw new Error('spawn ETIMEDOUT')
    })
    const service = new RtkOutputFilterService({
      binaryPath: '/tmp/rtk',
      runner
    })

    const result = await service.filterOutput({
      command: 'go test ./...',
      output: 'raw output\n'
    })

    expect(result).toEqual({
      output: 'raw output\n',
      applied: false,
      reason: 'filter-error'
    })
  })
})
