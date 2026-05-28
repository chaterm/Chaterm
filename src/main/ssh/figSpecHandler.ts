import { join } from 'path'

export interface FigArg {
  name?: string
  description?: string
  suggestions?: (string | { name: string | string[]; description?: string })[]
  template?: string | string[]
  isOptional?: boolean
  isVariadic?: boolean
}

export interface FigOption {
  name: string | string[]
  description?: string
  args?: FigArg | FigArg[]
  isPersistent?: boolean
}

export interface FigSubcommand {
  name: string | string[]
  description?: string
  subcommands?: FigSubcommand[]
  options?: FigOption[]
  args?: FigArg | FigArg[]
}

export interface FigSpec extends FigSubcommand {}

export interface FigSuggestion {
  text: string
  displayText: string
  description?: string
  source: 'subcommand' | 'option' | 'arg' | 'command'
}

function resolveNames(name: string | string[]): string[] {
  return Array.isArray(name) ? name : [name]
}

function normalizeCommandName(raw: string): string {
  const parts = raw.split('/')
  return parts[parts.length - 1].replace(/\.(exe|cmd|bat|sh|bash|zsh|fish)$/i, '').toLowerCase()
}

// In-memory spec cache — specs don't change at runtime
const specCache = new Map<string, FigSpec | null>()
let availableSpecs: Set<string> | null = null

function getSpecsDir(): string {
  try {
    const { app } = require('electron')
    if (app.isPackaged) {
      // Packaged: node_modules is inside app.asar, accessible via require()
      // resourcesPath/app.asar/node_modules/@withfig/autocomplete/build
      return join((process as any).resourcesPath, 'app.asar', 'node_modules', '@withfig', 'autocomplete', 'build')
    }
  } catch {
    // Not in Electron context (tests), fall through
  }
  // Dev: __dirname = out/main/, project root is two levels up
  return join(__dirname, '..', '..', 'node_modules', '@withfig', 'autocomplete', 'build')
}

async function loadAvailableSpecs(): Promise<Set<string>> {
  if (availableSpecs) return availableSpecs
  try {
    const indexPath = join(getSpecsDir(), 'index.json')
    const index = require(indexPath) as { completions: string[] }
    availableSpecs = new Set(index.completions)
  } catch {
    availableSpecs = new Set()
  }
  return availableSpecs
}

async function loadSpec(commandName: string): Promise<FigSpec | null> {
  if (specCache.has(commandName)) return specCache.get(commandName) ?? null

  try {
    const specFile = join(getSpecsDir(), `${commandName}.js`)
    const mod = require(specFile) as { default?: FigSpec } | FigSpec
    const spec: FigSpec | null = (mod as { default?: FigSpec }).default ?? (mod as FigSpec) ?? null
    // JSON round-trip removes functions/symbols — IPC requires serializable data
    const cleaned = spec ? (JSON.parse(JSON.stringify(spec)) as FigSpec) : null
    specCache.set(commandName, cleaned)
    return cleaned
  } catch {
    specCache.set(commandName, null)
    return null
  }
}

interface ResolvedContext {
  subcommands?: FigSubcommand[]
  options?: FigOption[]
  inheritedOptions?: FigOption[]
  args?: FigArg | FigArg[]
}

function mergeOptions(left: FigOption[] | undefined, right: FigOption[] | undefined): FigOption[] {
  const merged: FigOption[] = []
  const seen = new Set<string>()
  for (const opt of [...(left ?? []), ...(right ?? [])]) {
    const key = resolveNames(opt.name).sort().join('\0')
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(opt)
    }
  }
  return merged
}

function resolveSpecContext(spec: FigSpec, consumedTokens: string[]): ResolvedContext {
  let current: FigSubcommand = spec
  let inheritedOptions: FigOption[] = []
  let skipNext = false

  for (const token of consumedTokens) {
    if (skipNext) {
      skipNext = false
      continue
    }

    if (token.startsWith('-')) {
      const opt = [...(current.options ?? []), ...inheritedOptions].find((o) => resolveNames(o.name).includes(token))
      if (opt?.args) {
        const args = Array.isArray(opt.args) ? opt.args : [opt.args]
        if (args.length > 0 && !args[0].isOptional) skipNext = true
      }
      continue
    }

    if (current.subcommands) {
      const sub = current.subcommands.find((s) => resolveNames(s.name).includes(token))
      if (sub) {
        inheritedOptions = mergeOptions(inheritedOptions, current.options)
        current = sub
        continue
      }
    }

    break
  }

  return {
    subcommands: current.subcommands,
    options: current.options,
    inheritedOptions: inheritedOptions.length > 0 ? inheritedOptions : undefined,
    args: current.args
  }
}

function rebuildCommand(tokens: string[], replaceIndex: number, replacement: string): string {
  const rebuilt = [...tokens]
  rebuilt[replaceIndex] = replacement
  return rebuilt.join(' ')
}

export async function getFigSuggestions(data: { commandLine: string; tokens: string[] }): Promise<FigSuggestion[]> {
  const { commandLine, tokens } = data
  if (!tokens.length) return []

  const wordIndex = tokens.length - 1
  const currentWord = tokens[wordIndex] ?? ''
  const rawCommandName = tokens[0] ?? ''
  const commandName = normalizeCommandName(rawCommandName)

  if (!commandName) return []

  const specs = await loadAvailableSpecs()

  // wordIndex === 0: user is still typing the command name — suggest matching commands
  if (wordIndex === 0) {
    if (currentWord.length < 1) return []
    const lower = currentWord.toLowerCase()
    const suggestions: FigSuggestion[] = []
    for (const name of specs) {
      // Skip sub-path specs like aws/s3
      if (name.includes('/')) continue
      if (name.startsWith(lower) && name !== lower) {
        suggestions.push({ text: name, displayText: name, source: 'command' })
        if (suggestions.length >= 10) break
      }
    }
    return suggestions
  }

  // wordIndex >= 1: command name is complete, need spec context
  if (!specs.has(commandName)) return []

  const spec = await loadSpec(commandName)
  if (!spec) return []

  const suggestions: FigSuggestion[] = []
  const ctx = resolveSpecContext(spec, tokens.slice(1, wordIndex))

  // Exact match on current word — show children as preview
  if (currentWord && ctx.subcommands) {
    const exact = ctx.subcommands.find((s) => resolveNames(s.name).includes(currentWord))
    if (exact) {
      const child = resolveSpecContext(spec, tokens.slice(1, wordIndex + 1))
      for (const sub of child.subcommands ?? []) {
        const names = resolveNames(sub.name)
        suggestions.push({ text: commandLine + ' ' + names[0], displayText: names[0], description: sub.description, source: 'subcommand' })
        if (suggestions.length >= 10) break
      }
      appendOptionPreviews(suggestions, commandLine, child.options, child.inheritedOptions, 15)
      return suggestions
    }
  }

  // Prefix-match subcommands
  for (const sub of ctx.subcommands ?? []) {
    if (suggestions.length >= 10) break
    for (const name of resolveNames(sub.name)) {
      if (name.startsWith(currentWord) && name !== currentWord) {
        suggestions.push({ text: rebuildCommand(tokens, wordIndex, name), displayText: name, description: sub.description, source: 'subcommand' })
        break
      }
    }
  }

  // Prefix-match options
  const allOptions = mergeOptions(ctx.options, ctx.inheritedOptions)
  for (const opt of allOptions) {
    if (suggestions.length >= 10) break
    for (const name of resolveNames(opt.name)) {
      if (name.startsWith(currentWord) && name !== currentWord) {
        suggestions.push({ text: rebuildCommand(tokens, wordIndex, name), displayText: name, description: opt.description, source: 'option' })
        break
      }
    }
  }

  // Arg suggestions from spec
  const args = ctx.args ? (Array.isArray(ctx.args) ? ctx.args : [ctx.args]) : []
  for (const arg of args) {
    for (const sug of arg.suggestions ?? []) {
      if (suggestions.length >= 10) break
      const sugName = typeof sug === 'string' ? sug : resolveNames(sug.name)[0]
      const sugDesc = typeof sug === 'string' ? undefined : sug.description
      if (sugName.startsWith(currentWord) && sugName !== currentWord) {
        suggestions.push({ text: rebuildCommand(tokens, wordIndex, sugName), displayText: sugName, description: sugDesc, source: 'arg' })
      }
    }
  }

  return suggestions
}

function appendOptionPreviews(
  suggestions: FigSuggestion[],
  commandLine: string,
  options: FigOption[] | undefined,
  inheritedOptions: FigOption[] | undefined,
  limit: number
): void {
  const all = mergeOptions(options, inheritedOptions)
  for (const opt of all) {
    if (suggestions.length >= limit) break
    const names = resolveNames(opt.name)
    suggestions.push({ text: commandLine + ' ' + names[0], displayText: names[0], description: opt.description, source: 'option' })
  }
}

export async function listAvailableSpecs(): Promise<string[]> {
  const specs = await loadAvailableSpecs()
  return Array.from(specs)
}
