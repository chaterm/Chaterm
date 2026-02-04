import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'

describe('interaction-detector CJS compatibility', () => {
  it('avoids ESM-only strip-ansi in CJS output', () => {
    const sourcePath = join(process.cwd(), 'src/main/agent/services/interaction-detector/index.ts')
    const source = readFileSync(sourcePath, 'utf8')
    const { outputText } = transpileModule(source, {
      compilerOptions: {
        module: ModuleKind.CommonJS,
        target: ScriptTarget.ES2019,
        esModuleInterop: true
      }
    })
    expect(outputText).toContain('strip-ansi-cjs')
    expect(outputText).not.toContain('require(\"strip-ansi\")')
  })
})
