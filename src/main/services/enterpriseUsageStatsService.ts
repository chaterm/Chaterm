import { getApiBaseUrl } from '../config/edition'
import { chatermAuthAdapter } from '../storage/data_sync/envelope_encryption/services/auth'

const logger = createLogger('usageStats')

type UsageStatsEventType = 'client_active' | 'agent_session_started' | 'agent_command_executed' | 'agent_ssh_connected' | 'desktop_ssh_connected'
type UsageStatsCommandCategory = 'diagnose' | 'inspect' | 'change' | 'unknown'

export interface UsageStatsEventPayload {
  eventType: UsageStatsEventType
  eventAt?: string
  commandCategory?: UsageStatsCommandCategory
  targetCount?: number
}

const parsePolicyEnabled = (raw: unknown): boolean | null => {
  if (typeof raw !== 'string') return null
  const normalized = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return null
}

const categoryPriority = (category: UsageStatsCommandCategory): number => {
  switch (category) {
    case 'change':
      return 4
    case 'diagnose':
      return 3
    case 'inspect':
      return 2
    default:
      return 1
  }
}

const splitCommandSegments = (command: string): string[] => {
  const trimmed = command.trim()
  if (!trimmed) return []

  const segments: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false

  const flush = () => {
    const segment = current.trim()
    if (segment) segments.push(segment)
    current = ''
  }

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (escaped) {
      current += ch
      escaped = false
      continue
    }
    if (ch === '\\') {
      current += ch
      escaped = true
      continue
    }
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      current += ch
      continue
    }
    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      current += ch
      continue
    }
    if (!inSingleQuote && !inDoubleQuote && ['&', '|', ';'].includes(ch)) {
      flush()
      if ((ch === '&' || ch === '|') && trimmed[i + 1] === ch) i++
      continue
    }
    current += ch
  }

  flush()
  return segments
}

const extractWrappedCommand = (normalized: string): string => {
  const wrappers = [
    ['powershell', '-command', '-c'],
    ['powershell.exe', '-command', '-c'],
    ['pwsh', '-command', '-c'],
    ['pwsh.exe', '-command', '-c'],
    ['cmd', '/c', '/k'],
    ['cmd.exe', '/c', '/k']
  ]

  for (const wrapper of wrappers) {
    const prefix = wrapper[0]
    if (normalized !== prefix && !normalized.startsWith(`${prefix} `)) continue
    for (const flag of wrapper.slice(1)) {
      const needle = ` ${flag} `
      const index = normalized.indexOf(needle)
      if (index < 0) continue
      return normalized
        .slice(index + needle.length)
        .trim()
        .replace(/^[\s"'`]+|[\s"'`]+$/g, '')
    }
  }

  return ''
}

const containsSqlVerb = (normalized: string, verbs: string[]): boolean => {
  return verbs.some((verb) => {
    if (normalized.startsWith(`${verb} `)) return true
    return [` ${verb} `, `"${verb} `, `'${verb} `, `(${verb} `, `\`${verb} `].some((pattern) => normalized.includes(pattern))
  })
}

const normalizeCommandPrimary = (token: string): string => {
  const candidate = token.replace(/^[`"'({\[$@]+/, '')
  return candidate.match(/^([a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)+)/)?.[1] || token
}

const classifyCommandSegment = (segment: string): UsageStatsCommandCategory => {
  const normalized = segment.trim().toLowerCase()
  if (!normalized) return 'unknown'

  const inner = extractWrappedCommand(normalized)
  if (inner && inner !== normalized) return classifyAgentCommand(inner)

  const filtered = normalized
    .split(/\s+/)
    .filter((part) => part && part !== 'sudo')
    .filter((part) => !(part.includes('=') && !part.startsWith('=') && !part.includes('/')))

  if (filtered.length === 0) return 'unknown'

  const [rawPrimary, sub = '', third = ''] = filtered
  const primary = normalizeCommandPrimary(rawPrimary)
  if (['cd', 'source', '.', 'export'].includes(primary)) return 'unknown'

  const containsLogPath =
    normalized.includes('.log') ||
    normalized.includes('/log') ||
    normalized.includes('\\log') ||
    normalized.includes('/logs/') ||
    normalized.includes('\\logs\\')
  const containsLogKeyword = normalized.includes('journalctl') || normalized.includes('syslog') || normalized.includes('error.log')
  const containsWriteSql = containsSqlVerb(normalized, ['insert', 'update', 'delete', 'create', 'alter', 'drop', 'grant', 'revoke', 'flush'])
  const containsReadSql = containsSqlVerb(normalized, ['select', 'show', 'describe', 'explain', 'pragma', 'info'])

  if (
    [
      'grep',
      'rg',
      'ag',
      'zgrep',
      'bzgrep',
      'tail',
      'head',
      'less',
      'more',
      'journalctl',
      'select-string',
      'sls',
      'get-winevent',
      'get-eventlog'
    ].includes(primary)
  )
    return 'diagnose'

  if (['set-content', 'add-content', 'clear-content'].includes(primary)) return 'change'

  if (['awk', 'sed', 'cat', 'get-content', 'gc', 'type'].includes(primary)) {
    if (primary === 'sed' && (sub === '-i' || normalized.includes(' -i'))) return 'change'
    if (containsLogPath || containsLogKeyword) return 'diagnose'
    return 'inspect'
  }

  if (
    [
      'ls',
      'pwd',
      'ps',
      'df',
      'du',
      'free',
      'find',
      'whoami',
      'id',
      'uname',
      'env',
      'printenv',
      'which',
      'whereis',
      'history',
      'alias',
      'netstat',
      'ss',
      'dir',
      'get-ciminstance',
      'get-process',
      'gps',
      'get-service',
      'gsv',
      'get-childitem',
      'gci',
      'get-item',
      'gi',
      'get-location',
      'gl',
      'get-volume',
      'get-disk',
      'get-computerinfo',
      'test-connection',
      'select-object',
      'sort-object',
      'format-table',
      'format-list',
      'format-wide',
      'measure-object',
      'where-object',
      'foreach-object',
      'top',
      'htop',
      'lsof',
      'pgrep',
      'pidof',
      'iostat',
      'vmstat',
      'sar',
      'nslookup',
      'dig',
      'host',
      'traceroute',
      'tracepath',
      'ping'
    ].includes(primary)
  )
    return 'inspect'

  if (primary === 'curl' && ['-i', '--head', '-I'].includes(sub)) return 'inspect'
  if (primary === 'wget' && sub === '--spider') return 'inspect'

  if (['npm', 'pnpm', 'yarn'].includes(primary)) {
    if (['list', 'ls'].includes(sub)) return 'inspect'
    if (['run', 'build', 'start', 'dev', 'install', 'add', 'remove', 'test'].includes(sub)) return 'change'
  }

  if (['apt-get', 'apt', 'yum', 'dnf', 'apk', 'pacman', 'zypper', 'pip', 'pip3', 'gem', 'cargo', 'go'].includes(primary))
    return ['list', 'ls', 'search', 'show', 'info', 'policy'].includes(sub) ? 'inspect' : 'change'

  if (primary === 'systemctl') {
    if (['status', 'is-active', 'is-enabled', 'show'].includes(sub)) return 'inspect'
    if (['start', 'stop', 'restart', 'reload', 'enable', 'disable'].includes(sub)) return 'change'
  }

  if (primary === 'service') {
    if (sub === 'status') return 'inspect'
    if (['start', 'stop', 'restart', 'reload'].includes(sub)) return 'change'
  }

  if (
    [
      'restart-service',
      'stop-service',
      'start-service',
      'set-service',
      'new-item',
      'remove-item',
      'copy-item',
      'move-item',
      'rename-item',
      'set-item'
    ].includes(primary)
  )
    return 'change'

  if (primary === 'supervisorctl') {
    if (sub === 'status') return 'inspect'
    if (['start', 'stop', 'restart', 'reload', 'update'].includes(sub)) return 'change'
  }

  if (primary === 'pm2') {
    if (['list', 'status', 'show'].includes(sub)) return 'inspect'
    if (sub === 'logs') return 'diagnose'
    if (['start', 'stop', 'restart', 'reload', 'delete'].includes(sub)) return 'change'
  }

  if (primary === 'kubectl') {
    if (sub === 'logs') return 'diagnose'
    if (['get', 'describe', 'top'].includes(sub)) return 'inspect'
    if (['apply', 'delete', 'exec', 'scale', 'rollout', 'patch', 'cp'].includes(sub)) return 'change'
  }

  if (primary === 'helm') {
    if (['list', 'status', 'get', 'show', 'template'].includes(sub)) return 'inspect'
    if (['install', 'upgrade', 'uninstall', 'rollback'].includes(sub)) return 'change'
  }

  if (primary === 'docker-compose') {
    if (['ps', 'images', 'config'].includes(sub)) return 'inspect'
    if (sub === 'logs') return 'diagnose'
    if (['up', 'down', 'start', 'stop', 'restart', 'pull', 'build'].includes(sub)) return 'change'
  }

  if (primary === 'docker') {
    if (sub === 'compose') {
      if (['ps', 'images', 'config'].includes(third)) return 'inspect'
      if (third === 'logs') return 'diagnose'
      if (['up', 'down', 'start', 'stop', 'restart', 'pull', 'build'].includes(third)) return 'change'
    }
    if (sub === 'logs') return 'diagnose'
    if (['ps', 'images', 'inspect', 'stats'].includes(sub)) return 'inspect'
    if (['run', 'exec', 'start', 'stop', 'restart', 'rm', 'cp'].includes(sub)) return 'change'
  }

  if (['mysql', 'mariadb', 'psql', 'sqlite3', 'sqlcmd', 'mongo', 'mongosh'].includes(primary)) {
    if (containsWriteSql) return 'change'
    if (containsReadSql) return 'inspect'
  }

  if (primary === 'redis-cli') {
    if ([' flushall', ' flushdb', ' set ', ' del ', ' expire ', ' hset ', ' config set'].some((part) => normalized.includes(part))) return 'change'
    if ([' info', ' get ', ' hgetall', ' ttl ', ' keys ', ' scan', ' ping'].some((part) => normalized.includes(part))) return 'inspect'
  }

  if (primary === 'tar') return normalized.includes(' -x') ? 'change' : 'inspect'
  if (
    [
      'unzip',
      'scp',
      'rsync',
      'rm',
      'mv',
      'cp',
      'copy',
      'move',
      'rename',
      'mkdir',
      'touch',
      'chmod',
      'chown',
      'kill',
      'vim',
      'nano',
      'crontab',
      'python',
      'python3',
      'node',
      'bash',
      'sh',
      'ansible-playbook',
      'terraform'
    ].includes(primary)
  )
    return 'change'

  if (containsLogPath || containsLogKeyword) return 'diagnose'
  return 'unknown'
}

export const classifyAgentCommand = (command: string): UsageStatsCommandCategory => {
  const segments = splitCommandSegments(command)
  let best: UsageStatsCommandCategory = 'unknown'
  for (const segment of segments) {
    const category = classifyCommandSegment(segment)
    if (categoryPriority(category) > categoryPriority(best)) best = category
  }
  return best
}

class EnterpriseUsageStatsService {
  isEnabled(): boolean {
    return parsePolicyEnabled(process.env.CHATERM_ENTERPRISE_STATS_ENABLED) === true
  }

  async captureEvent(payload: UsageStatsEventPayload): Promise<{ success: boolean; skipped?: string; error?: string }> {
    try {
      if (!this.isEnabled()) {
        return { success: false, skipped: 'disabled' }
      }

      const token = await chatermAuthAdapter.getAuthToken()
      const userId = await chatermAuthAdapter.getCurrentUserId()
      if (!token || token === 'guest_token' || !userId || userId === 'guest_user') {
        return { success: false, skipped: 'unauthenticated' }
      }

      const response = await fetch(`${getApiBaseUrl()}/user/usage-stats/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`
        },
        body: JSON.stringify({
          eventType: payload.eventType,
          eventAt: payload.eventAt || new Date().toISOString(),
          commandCategory: payload.commandCategory || '',
          targetCount: payload.targetCount || 0
        })
      })

      if (!response.ok) {
        logger.warn('Usage stats event request failed', {
          event: 'usage.stats.capture.failed',
          eventType: payload.eventType,
          status: response.status,
          targetCount: payload.targetCount || 0
        })
        return { success: false, error: `HTTP_${response.status}` }
      }
      return { success: true }
    } catch (error) {
      logger.warn('Usage stats event request error', {
        event: 'usage.stats.capture.error',
        eventType: payload.eventType,
        targetCount: payload.targetCount || 0,
        error: error instanceof Error ? error.message : String(error)
      })
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

export const enterpriseUsageStatsService = new EnterpriseUsageStatsService()
