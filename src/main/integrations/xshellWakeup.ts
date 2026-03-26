export interface XshellWakeupPayload {
  source: 'xshell-direct' | 'xshell-encoded'
  rawArgs: string[]
  url: string
  host: string
  port: number
  username: string
  password: string
  targetHint: string
  newTab: boolean
  receivedAt: string
}

const DEFAULT_SSH_PORT = 22

function findOptionValue(argv: string[], names: string[]): { value: string; consumedIndexes: number[] } | null {
  const loweredNames = names.map((name) => name.toLowerCase())

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const lower = arg.toLowerCase()

    if (loweredNames.includes(lower)) {
      if (i + 1 < argv.length) {
        return { value: argv[i + 1], consumedIndexes: [i, i + 1] }
      }
      return null
    }

    for (const name of loweredNames) {
      const withEq = `${name}=`
      if (lower.startsWith(withEq)) {
        return { value: arg.slice(withEq.length), consumedIndexes: [i] }
      }
    }
  }

  return null
}

function parseSshUrl(urlText: string): { host: string; port: number; username: string; password: string } | null {
  try {
    const parsed = new URL(urlText)
    if (parsed.protocol.toLowerCase() !== 'ssh:') return null
    const host = parsed.hostname
    if (!host) return null
    const port = parsed.port ? Number(parsed.port) : DEFAULT_SSH_PORT
    const username = decodeURIComponent(parsed.username || '')
    const password = decodeURIComponent(parsed.password || '')
    return { host, port: Number.isFinite(port) ? port : DEFAULT_SSH_PORT, username, password }
  } catch {
    return null
  }
}

function buildDirectPayload(argv: string[]): XshellWakeupPayload | null {
  const urlOption = findOptionValue(argv, ['-url', '--url'])
  if (!urlOption || !urlOption.value) return null

  const url = urlOption.value
  const parsed = parseSshUrl(url)
  if (!parsed) return null

  const consumed = new Set<number>(urlOption.consumedIndexes)
  let newTab = false
  let targetHint = ''

  for (let i = 0; i < argv.length; i++) {
    const current = argv[i]
    const lower = current.toLowerCase()

    if (lower === '-newtab' || lower === '--newtab') {
      newTab = true
      consumed.add(i)
      if (i + 1 < argv.length && argv[i + 1] && !argv[i + 1].startsWith('-')) {
        targetHint = argv[i + 1]
        consumed.add(i + 1)
        i++
      }
      continue
    }

    if (lower.startsWith('-newtab=') || lower.startsWith('--newtab=')) {
      newTab = true
      consumed.add(i)
      const nextTargetHint = current.slice(current.indexOf('=') + 1)
      if (nextTargetHint) {
        targetHint = nextTargetHint
      }
    }
  }

  const positional = argv.filter((arg, idx) => !consumed.has(idx) && arg && !arg.startsWith('-'))
  if (!targetHint) {
    targetHint = positional.length > 0 ? positional[positional.length - 1] : ''
  }

  return {
    source: 'xshell-direct',
    rawArgs: argv,
    url,
    host: parsed.host,
    port: parsed.port,
    username: parsed.username,
    password: parsed.password,
    targetHint,
    newTab,
    receivedAt: new Date().toISOString()
  }
}

function buildEncodedPayload(argv: string[]): XshellWakeupPayload | null {
  const encodedOption = findOptionValue(argv, ['--xshell-wakeup'])
  if (!encodedOption || !encodedOption.value) return null

  try {
    const raw = Buffer.from(encodedOption.value, 'base64').toString('utf8')
    const parsed = JSON.parse(raw) as Partial<XshellWakeupPayload>
    if (!parsed.url) return null
    const ssh = parseSshUrl(parsed.url)
    if (!ssh) return null

    return {
      source: 'xshell-encoded',
      rawArgs: Array.isArray(parsed.rawArgs) ? parsed.rawArgs : argv,
      url: parsed.url,
      host: parsed.host || ssh.host,
      port: Number(parsed.port || ssh.port || DEFAULT_SSH_PORT),
      username: parsed.username || ssh.username || '',
      password: parsed.password || ssh.password || '',
      targetHint: parsed.targetHint || '',
      newTab: Boolean(parsed.newTab),
      receivedAt: new Date().toISOString()
    }
  } catch {
    return null
  }
}

export function parseXshellWakeupFromArgv(argv: string[]): XshellWakeupPayload | null {
  if (!argv || argv.length === 0) return null
  return buildEncodedPayload(argv) || buildDirectPayload(argv)
}

export function redactXshellWakeupForLog(payload: XshellWakeupPayload): Record<string, unknown> {
  return {
    ...payload,
    password: payload.password ? '***' : '',
    url: payload.url.replace(/(ssh:\/\/)([^@\s]+)@/i, '$1***@'),
    rawArgs: payload.rawArgs.map((arg, idx) => {
      if (idx > 0 && ['-url', '--url'].includes(payload.rawArgs[idx - 1].toLowerCase())) {
        return arg.replace(/(ssh:\/\/)([^@\s]+)@/i, '$1***@')
      }
      return arg
    })
  }
}
