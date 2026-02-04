import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('system information sudo check', () => {
  it('does not include SUDO_CHECK or sudo -n in system info script', () => {
    const taskPath = path.join(process.cwd(), 'src/main/agent/core/task/index.ts')
    const content = fs.readFileSync(taskPath, 'utf8')

    const match = content.match(/const systemInfoScript = `([\s\S]*?)`/)
    expect(match).not.toBeNull()

    const systemInfoScript = match?.[1] ?? ''
    expect(systemInfoScript).toContain('uname -a')
    expect(systemInfoScript).not.toContain('SUDO_CHECK')
    expect(systemInfoScript).not.toContain('sudo -n')
  })
})
