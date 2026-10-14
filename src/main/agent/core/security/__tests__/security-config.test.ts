import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { SecurityConfigManager } from '../SecurityConfig'

describe('SecurityConfigManager.loadConfig', () => {
  let dir: string
  let configPath: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chaterm-security-'))
    configPath = path.join(dir, 'chaterm-security.json')
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('keeps patterns that contain // such as URLs', async () => {
    await fs.writeFile(
      configPath,
      `// Chaterm AI Security Configuration File
{
  "security": {
    // Blacklist
    "blacklistPatterns": ["curl http://*", "wget https://*"],
    /* Whitelist */
    "whitelistPatterns": ["ls *"]
  }
}
`,
      'utf-8'
    )

    const manager = new SecurityConfigManager(configPath)
    await manager.loadConfig()

    expect(manager.getConfig().blacklistPatterns).toEqual(['curl http://*', 'wget https://*'])
    expect(manager.getConfig().whitelistPatterns).toEqual(['ls *'])
  })

  it('keeps /* inside a string', async () => {
    await fs.writeFile(configPath, '{ "security": { "blacklistPatterns": ["rm -rf /*", "chmod -R 777 /*/"] } }', 'utf-8')

    const manager = new SecurityConfigManager(configPath)
    await manager.loadConfig()

    expect(manager.getConfig().blacklistPatterns).toEqual(['rm -rf /*', 'chmod -R 777 /*/'])
  })
})
