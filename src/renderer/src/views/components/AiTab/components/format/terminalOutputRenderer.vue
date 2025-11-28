<template>
  <div class="terminal-output-container">
    <div
      v-show="true"
      class="terminal-output-header"
    >
      <div
        class="output-title-section"
        @click="toggleOutput"
      >
        <a-button
          class="toggle-button"
          type="text"
          size="small"
        >
          <CaretDownOutlined v-if="isExpanded" />
          <CaretRightOutlined v-else />
        </a-button>
        <span class="output-title">OUTPUT</span>
      </div>
      <div class="output-controls">
        <span class="output-lines">{{ outputLines }} lines</span>
        <a-button
          class="copy-button-header"
          type="text"
          size="small"
          @click="copyOutput"
        >
          <img
            :src="copySvg"
            alt="copy"
            class="copy-icon"
          />
        </a-button>
      </div>
    </div>
    <div
      v-show="true"
      ref="terminalContainer"
      class="terminal-output"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from 'vue'
import { Terminal } from 'xterm'
import { CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons-vue'
import copySvg from '@/assets/icons/copy.svg'
import { message } from 'ant-design-vue'
import i18n from '@/locales'
import { isDarkTheme } from '@/utils/themeUtils'
import 'xterm/css/xterm.css'

const { t } = i18n.global

const props = defineProps<{
  content: string
}>()

const terminalContainer = ref<HTMLElement | null>(null)
const isExpanded = ref(true) // Terminal output expanded by default
const outputLines = ref(0)
const isCollapsible = computed(() => outputLines.value > 10)

let terminal: Terminal | null = null
let lastContent: string = ''

// Performance optimization: precompile regex patterns
// Unified color scheme
const COLORS = {
  // Basic colors
  reset: '\x1b[0m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Primary colors (bright colors for better readability)
  red: '\x1b[91m', // Error, danger state
  green: '\x1b[92m', // Success, normal state
  yellow: '\x1b[93m', // Warning, key name
  blue: '\x1b[94m', // Info, number
  magenta: '\x1b[95m', // Command, special identifier
  cyan: '\x1b[96m', // Header, method

  // Status colors
  success: '\x1b[92m', // Success state
  warning: '\x1b[93m', // Warning state
  error: '\x1b[91m', // Error state
  info: '\x1b[94m', // Info state

  // Semantic colors
  command: '\x1b[95m', // Command name
  header: '\x1b[96m', // Table header, header name
  key: '\x1b[93m', // JSON key, config item
  value: '\x1b[92m', // String value
  number: '\x1b[94m', // Number value
  boolean: '\x1b[95m', // Boolean value
  url: '\x1b[94m', // URL link
  method: '\x1b[96m', // HTTP method
  status: '\x1b[92m', // Status info
  structure: '\x1b[90m' // Structure symbol
}

const REGEX_PATTERNS = {
  ls: /^([dlrwx-]+)\s+(\d+)\s+(\w+)\s+(\w+)\s+(\d+)\s+([A-Za-z]+\s+\d+\s+(?:\d{1,2}:\d{2}|\d{4}))\s+(.+)$/,
  ps: /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)/,
  psFlexible: /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)/,
  psStrict: /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)$/,
  psFixed: /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)/,
  psSimple: /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)/,
  psUltraSimple: /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)/,
  psHeader: /^\s*(UID|PID|PPID|C|STIME|TTY|TIME|CMD)\s+(\d+)\s+(\d+)\s+(\d+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)$/,
  psHeaderOnly: /^\s*(UID|PID|PPID|C|STIME|TTY|TIME|CMD)\s*$/,
  // Add simplified ps command format support
  psSimpleHeader: /^\s*(PID|TTY|TIME|CMD)\s+(PID|TTY|TIME|CMD)\s+(PID|TTY|TIME|CMD)\s+(PID|TTY|TIME|CMD)\s*$/,
  psSimpleData: /^\s*(\d+)\s+([^\s]+)\s+(\d{1,2}:\d{2}:\d{2})\s+(.+)$/,
  netstat: /^(tcp|udp|tcp6|udp6)\s+(\d+)\s+(\d+)\s+([^\s]+):([^\s]+)\s+([^\s]+):([^\s]+)(?:\s+([A-Z_]+))?(?:\s+(.+))?$/,
  df: /^(.+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+%)\s+(.+)$/,
  error: /error|Error|ERROR|warning|Warning|WARNING|fatal|Fatal|FATAL/i,
  success: /success|Success|SUCCESS|done|Done|DONE|completed|Completed|COMPLETED/i,
  git: /^git|^commit|^branch|On branch|Your branch|Changes to be committed|Changes not staged|Untracked files|modified:|added:|deleted:|renamed:|new file:|modified file:|deleted file:|renamed file:/,
  docker: /^docker|^container|^image/,
  npm: /^npm|^yarn|^pnpm/,
  http: /^curl|^wget|^http/,
  top: /PID.*CPU.*MEM/,
  topHeader: /^\s*PID\s+USER\s+PR\s+NI\s+VIRT\s+RES\s+SHR\s+S\s+%CPU\s+%MEM\s+TIME\+\s+COMMAND\s*$/,
  tail: /==>.*<==/,
  codeFiles: /\.(js|ts|vue|py|java|cpp|c|h|go)$/,
  imageFiles: /\.(jpg|jpeg|png|gif|svg|ico)$/,
  archiveFiles: /\.(zip|tar|gz|rar|7z|deb|rpm|pkg)$|\.(?:tar\.(?:gz|xz|bz2|zst)|tgz|tbz2|txz)$/,
  httpStatus: /\b(\d{3})\b/,
  cpuUsage: /(\d+\.\d+)%/,
  memoryUsage: /(\d+\.\d+)M/,
  pid: /\b(\d{4,6})\b/,
  url: /(https?:\/\/[^\s]+)/,
  httpMethod: /\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/,
  packageName: /\b([a-zA-Z0-9._-]+@[0-9]+\.[0-9]+\.[0-9]+)\b/,
  version: /\b(\d+\.\d+\.\d+)\b/,
  commitHash: /\b([a-f0-9]{7,40})\b/,
  branchName: /\b(main|master|develop|feature|hotfix|release)\b/,
  fileStatus: /\b(modified|added|deleted|renamed|untracked|staged|new file|modified file|deleted file|renamed file)\b/,
  gitStatus: /(On branch|Your branch|Changes to be committed|Changes not staged|Untracked files)/,
  gitFileChange: /(modified:|added:|deleted:|renamed:|new file:|modified file:|deleted file:|renamed file:)/,
  containerId: /\b([a-f0-9]{12})\b/,
  imageName: /\b([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+)\b/,
  containerStatus: /\b(running|exited|created|restarting|paused|dead)\b/,
  npmStatus: /\b(installed|updated|removed|added|deprecated)\b/,
  npmCommand: /\b(npm|yarn|pnpm|install|uninstall|update|list|audit)\b/,
  npmWarn: /\b(warn|WARN|error|ERROR)\b/,
  gitCommand: /\b(git|commit|push|pull|merge|rebase|checkout|branch|status|log|diff)\b/,
  dockerCommand: /\b(docker|container|image|volume|network)\b/,
  httpCommand: /\b(curl|wget|http)\b/,
  tailFile: /==>\s*(.+?)\s*<==/,
  tailLine: /^\s*(\d+)\s+/gm,
  iptables: /^iptables|^Chain\s+\w+|^pkts\s+bytes\s+target\s+prot\s+opt\s+in\s+out\s+source\s+destination|^\s*\d+\s+\d+[KM]?\s+\w+/,
  iptablesChain: /^Chain\s+([\w-]+)\s*\((\d+)\s+references?\)/,
  iptablesPolicy: /^target\s+prot\s+opt\s+source\s+destination\s+$/,
  iptablesRule: /^\s*(\d+)\s+(\d+[KM]?)\s+(\w+)\s+(\w+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/,
  iptablesTarget: /\b(ACCEPT|DROP|REJECT|RETURN|LOG|DNAT|SNAT|MASQUERADE|DOCKER|DOCKER-USER|DOCKER-ISOLATION|FORWARD|INPUT|OUTPUT)\b/,
  iptablesProtocol: /\b(all|tcp|udp|icmp|esp|ah)\b/,
  iptablesInterface: /\b(\*|docker0|br-\w+|eth\d+|lo|wlan\d+)\b/,
  iptablesIP: /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\/\d+)?)\b/,
  macAddress: /\b([0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2})\b/,
  systemctlHeader: /^UNIT\s+LOAD\s+ACTIVE\s+SUB\s+DESCRIPTION/,
  systemctlService: /^[\w\-@.]+\.service\s+loaded\s+\w+\s+\w+/,
  systemctlUnit: /^[\w\-@.]+\.(service|socket|target|timer|mount|path|slice|scope)\s+loaded\s+\w+/
}

/**
 * Calculate string display width (considering full-width characters like Chinese)
 * Chinese, Japanese, Korean characters occupy 2 columns in terminal
 */
function getStringDisplayWidth(str: string): number {
  let width = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    // Determine if it's a wide character (CJK characters, full-width characters, etc.)
    // Unicode ranges:
    // - 0x1100-0x115F: Korean
    // - 0x2E80-0x9FFF: CJK unified ideographs, symbols
    // - 0xA960-0xA97F: Korean extended
    // - 0xAC00-0xD7AF: Korean syllables
    // - 0xF900-0xFAFF: CJK compatibility ideographs
    // - 0xFE10-0xFE19: Vertical punctuation
    // - 0xFE30-0xFE6F: CJK compatibility forms
    // - 0xFF00-0xFF60: Full-width ASCII, full-width punctuation
    // - 0xFFE0-0xFFE6: Full-width symbols
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xa960 && code <= 0xa97f) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    ) {
      width += 2
    } else {
      width += 1
    }
  }
  return width
}

/**
 * Smart format field, dynamically adjust based on actual content width
 * @param text Text to format
 * @param maxWidth Maximum width limit
 * @param color Color code
 * @param minWidth Minimum width (optional)
 */
function smartFormatField(text: string, maxWidth: number, color: string, minWidth: number = 1): string {
  const targetWidth = Math.max(minWidth, maxWidth)

  if (text.length > targetWidth) {
    const truncated = text.substring(0, targetWidth)
    return `${color}${truncated}${COLORS.reset}`
  } else {
    const padded = text.padEnd(targetWidth)
    return `${color}${padded}${COLORS.reset}`
  }
}

/**
 * Simple format field, ensure basic alignment
 * @param text Text to format
 * @param width Fixed width
 * @param color Color code
 */
function simpleFormatField(text: string, width: number, color: string): string {
  return `${color}${text.padEnd(width)}${COLORS.reset}`
}

// Cache highlight results
const highlightCache = new Map<string, string>()
const CACHE_SIZE_LIMIT = 1000

// Clear cache
const clearCache = () => {
  if (highlightCache.size > CACHE_SIZE_LIMIT) {
    const entries = Array.from(highlightCache.entries())
    const toDelete = entries.slice(0, Math.floor(CACHE_SIZE_LIMIT / 2))
    toDelete.forEach(([key]) => highlightCache.delete(key))
  }
}

// Universal format detector
interface FormatDetectionResult {
  type: string
  confidence: number
  metadata?: any
}

const detectFormat = (line: string): FormatDetectionResult | null => {
  const trimmedLine = line.trim()
  if (!trimmedLine) return null

  // Detect top command system info line (highest priority)
  if (
    trimmedLine.match(/^top\s+-/) ||
    trimmedLine.match(/^Tasks:/) ||
    trimmedLine.match(/^%Cpu\(s\):/) ||
    trimmedLine.match(/^MiB\s+Mem\s*:/) ||
    trimmedLine.match(/^MiB\s+Swap:/) ||
    trimmedLine.match(/^KiB\s+Mem\s*:/) ||
    trimmedLine.match(/^KiB\s+Swap:/) ||
    trimmedLine.match(/^Mem:/) ||
    trimmedLine.match(/^Swap:/)
  ) {
    return {
      type: 'top_system_info',
      confidence: 0.95,
      metadata: { command: 'top' }
    }
  }

  // Detect timestamp format (second priority)
  const timestampPatterns = [
    // ISO 8601 full format (with microseconds and timezone) - highest priority
    /\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:?\d{2})?/,
    // Nginx access log format: [15/Oct/2025:14:17:39 +0800]
    /\[\d{1,2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2}\s+[+-]\d{4}\]/,
    // Standard datetime format (without microseconds and timezone)
    /\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}:\d{2}/,
    /\d{1,2}:\d{2}:\d{2}/,
    /\w{3}\s+\d{1,2}\s+\d{1,2}:\d{2}/,
    /^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{1,2}:\d{2}:\d{2}/ // New: Aug 26 14:38:31 format
  ]

  // Timestamp detection: detect even if contains colon, as system logs often contain colons
  for (let pattern of timestampPatterns) {
    if (pattern.test(trimmedLine)) {
      return {
        type: 'timestamped',
        confidence: 0.9, // Increase confidence to ensure priority over table header detection
        metadata: { pattern: pattern.source }
      }
    }
  }

  // Detect Nginx access log format (special case with binary data)
  // Format: IP - - [timestamp] "request" status_code size "referer" "user-agent"
  const nginxLogPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\s+-\s+-\s+\[[\d\/\w\s:+-]+\]\s+".*"\s+\d{3}\s+\d+/
  if (nginxLogPattern.test(trimmedLine)) {
    return {
      type: 'timestamped',
      confidence: 0.95, // High confidence to ensure Nginx logs are correctly identified
      metadata: { pattern: 'nginx_access_log' }
    }
  }

  // Detect table format (column-aligned data) - stricter detection to avoid misjudging continuation lines
  const tablePattern = /^[\w\-+.@]+\s+[\w\-+.@]+\s+[\w\-+.@]+/

  // Determine if it's a continuation line based on features (universal method)
  // Continuation line features: 1. Starts with space 2. Starts with lowercase letter 3. Key-value pair format 4. Short line length with few words
  const startsWithSpace = trimmedLine.startsWith(' ')
  const startsWithLowercase = !!trimmedLine.match(/^[a-z]/)
  const isKeyValuePair = trimmedLine.includes(':') && !!trimmedLine.match(/^[^:]+:\s+.+$/)

  const isContinuationLine = startsWithSpace || startsWithLowercase || isKeyValuePair

  if (tablePattern.test(trimmedLine) && !isContinuationLine) {
    const parts = trimmedLine.split(/\s+/)
    if (parts.length >= 3) {
      // Detect if it's a number-dominated line (likely a data row)
      const numericParts = parts.filter((part) => /^\d+(\.\d+)?%?$/.test(part))
      const confidence = numericParts.length / parts.length

      // Check if it's a table header (universal detection based on statistical features)
      // Table header features: moderate column count, moderate word length, no colon, doesn't start with space
      const startsWithSpace = trimmedLine.startsWith(' ')
      const startsWithLowercase = trimmedLine.match(/^[a-z]/)

      // Table header detection based on statistical features
      // Colon in table header cannot be an ending character, must be followed by other characters (e.g., Address:Port)
      const hasColonAtEnd = trimmedLine.includes(':') && trimmedLine.match(/:\s*$/)

      // Check if there are numeric columns (table headers usually correspond to data rows with numeric values)
      const hasNumericColumns = numericParts.length > 0

      const isTableHeader =
        !startsWithSpace && // Doesn't start with space (continuation line feature)
        !startsWithLowercase && // Doesn't start with lowercase letter (continuation line feature)
        !hasColonAtEnd && // Colon cannot be ending character (key-value pair feature)
        hasNumericColumns // Must have corresponding numeric columns

      if (isTableHeader) {
        return {
          type: 'table_header',
          confidence: 0.9,
          metadata: {
            columns: parts.length,
            parts: parts
          }
        }
      }

      // Avoid misjudging non-table data: if line contains colon but is not table header, prioritize key-value pair detection
      const hasColonAtEndForTable = trimmedLine.includes(':') && trimmedLine.match(/:\s*$/)
      if (hasColonAtEndForTable) {
        // Don't return any detection result, let key-value pair detection handle it
      } else {
        return {
          type: 'table_data',
          confidence: confidence * 0.8, // Reduce confidence slightly to avoid misjudgment
          metadata: {
            columns: parts.length,
            numericColumns: numericParts.length,
            parts: parts
          }
        }
      }
    }
  }

  // Detect key-value pair format (supports key names with spaces and special characters)
  // Match pattern: any non-empty characters + colon + space + any characters
  // Exclude PID/program name format: number + space + "program name"
  if ((/^[^:]+:\s*.+$/.test(trimmedLine) || /^[^=]+=\s*.+$/.test(trimmedLine)) && !/^\d+\s+".*"$/.test(trimmedLine)) {
    const separator = trimmedLine.includes(':') ? ':' : '='
    if (trimmedLine.includes('Vulnerabilities') || trimmedLine.includes('Mitigation') || trimmedLine.includes('Vulnerable')) {
    }
    return {
      type: 'key_value',
      confidence: 0.7, // Increase priority to ensure key-value pairs take precedence over status detection
      metadata: {
        separator: separator
      }
    }
  }

  // Detect path format
  if (/^[\/~][\w\/\-\.]*/.test(trimmedLine) || /^[A-Z]:\\/.test(trimmedLine)) {
    return {
      type: 'path',
      confidence: 0.8
    }
  }

  // Detect network address format
  if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(trimmedLine) || /:[0-9]+/.test(trimmedLine)) {
    return {
      type: 'network',
      confidence: 0.7
    }
  }

  // Detect status info format (lower priority to avoid conflict with key-value pairs)
  const statusWords = ['running', 'stopped', 'active', 'inactive', 'enabled', 'disabled', 'ok', 'failed', 'error']
  // Only perform status detection when line doesn't contain colon, to avoid conflict with key-value pairs
  if (!trimmedLine.includes(':') && statusWords.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(trimmedLine))) {
    return {
      type: 'status',
      confidence: 0.4 // Lower priority
    }
  }

  return null
}

// Smart highlight function
const applySmartHighlight = (line: string, detection: FormatDetectionResult): string => {
  switch (detection.type) {
    case 'table_data':
      return highlightTableData(line, detection.metadata)

    case 'table_header':
      return highlightTableHeader(line, detection.metadata)

    case 'timestamped':
      return highlightTimestamped(line)

    case 'top_system_info':
      return highlightTopSystemInfo(line)

    case 'key_value':
      return highlightKeyValue(line, detection.metadata.separator)

    case 'path':
      return highlightPath(line)

    case 'network':
      return highlightNetwork(line)

    case 'status':
      return highlightStatus(line)

    default:
      return line
  }
}

// Table header highlight
const highlightTableHeader = (line: string, metadata: any): string => {
  const { reset, header } = COLORS
  const parts = metadata.parts

  let result = ''
  let currentPos = 0

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const partStart = line.indexOf(part, currentPos)

    // Add spaces before
    if (partStart > currentPos) {
      result += line.substring(currentPos, partStart)
    }

    // Table header uses unified header color
    result += `${header}${part}${reset}`
    currentPos = partStart + part.length
  }

  // Add remaining content
  if (currentPos < line.length) {
    result += line.substring(currentPos)
  }

  return result
}

// Table data highlight
const highlightTableData = (line: string, metadata: any): string => {
  const { reset, number, info, success, warning } = COLORS
  const parts = metadata.parts

  let result = ''
  let currentPos = 0

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const partStart = line.indexOf(part, currentPos)

    // Add spaces before
    if (partStart > currentPos) {
      result += line.substring(currentPos, partStart)
    }

    // Choose color for different data types
    let color = info // Default color
    if (/^\d+$/.test(part)) {
      color = number // Pure number
    } else if (/^\d+\.\d+$/.test(part)) {
      color = success // Decimal
    } else if (/^\d+%$/.test(part)) {
      const percent = parseInt(part)
      color = percent > 80 ? warning : percent > 50 ? info : success // Percentage
    } else if (i === 0) {
      color = COLORS.header // First column is usually identifier
    }

    result += `${color}${part}${reset}`
    currentPos = partStart + part.length
  }

  // Add remaining content
  if (currentPos < line.length) {
    result += line.substring(currentPos)
  }

  return result
}

// Timestamp highlight
const highlightTimestamped = (line: string): string => {
  const { reset, cyan, yellow, green, red, blue } = COLORS

  // Check if it's Nginx access log format
  const nginxLogPattern = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+-\s+-\s+(\[[\d\/\w\s:+-]+\])\s+(".*")\s+(\d{3})\s+(\d+)(?:\s+(".*")\s+(".*"))?/
  const nginxMatch = line.match(nginxLogPattern)

  if (nginxMatch) {
    // Specifically handle Nginx access log format
    const [, ip, timestamp, request, status, size, referer, userAgent] = nginxMatch

    let highlighted = line
    // Highlight IP address
    highlighted = highlighted.replace(ip, `${blue}${ip}${reset}`)
    // Highlight timestamp
    highlighted = highlighted.replace(timestamp, `${cyan}${timestamp}${reset}`)
    // Highlight request (including binary data)
    highlighted = highlighted.replace(request, `${yellow}${request}${reset}`)
    // Highlight status code
    const statusCode = parseInt(status)
    let statusColor = green
    if (statusCode >= 400 && statusCode < 500) {
      statusColor = yellow
    } else if (statusCode >= 500) {
      statusColor = red
    }
    highlighted = highlighted.replace(status, `${statusColor}${status}${reset}`)
    // Highlight size
    highlighted = highlighted.replace(size, `${cyan}${size}${reset}`)

    if (referer && userAgent) {
      // Highlight referer and user agent
      highlighted = highlighted.replace(referer, `${blue}${referer}${reset}`)
      highlighted = highlighted.replace(userAgent, `${blue}${userAgent}${reset}`)
    }

    return highlighted
  }

  // Highlight timestamp part
  let highlighted = line

  // Save already highlighted positions to avoid duplicate highlighting
  const highlightedPositions: Array<[number, number]> = []

  // Match timestamp formats in order from longest to shortest
  const patterns = [
    // ISO 8601 full format (with microseconds and timezone) - highest priority
    /(\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:?\d{2})?)/g,
    // Nginx access log format: [15/Oct/2025:14:17:39 +0800]
    /(\[\d{1,2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2}\s+[+-]\d{4}\])/g,
    // Full datetime format (2025/9/1 11:35:16)
    /(\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}:\d{2})/g,
    // ISO format datetime (without microseconds and timezone)
    /(\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}:\d{2})/g,
    // Month-day time format (Aug 26 14:38:31) - includes seconds
    /(\w{3}\s+\d{1,2}\s+\d{1,2}:\d{2}:\d{2})/g,
    // Month-day time format (Sep 1 11:35) - without seconds
    /(\w{3}\s+\d{1,2}\s+\d{1,2}:\d{2})/g,
    // Pure time format (3:35:16 or 11:35:16)
    /(\d{1,2}:\d{2}:\d{2})/g,
    // Simple time format (3:35 or 11:35)
    /(\d{1,2}:\d{2})/g
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(highlighted)) !== null) {
      const start = match.index
      const end = start + match[0].length

      // Check if this position has already been highlighted
      let isOverlap = false
      for (const [existingStart, existingEnd] of highlightedPositions) {
        if ((start >= existingStart && start < existingEnd) || (end > existingStart && end <= existingEnd)) {
          isOverlap = true
          break
        }
      }

      if (!isOverlap) {
        highlightedPositions.push([start, end])
        const before = highlighted.slice(0, start)
        const after = highlighted.slice(end)
        highlighted = before + `${cyan}${match[0]}${reset}` + after

        // Update regex lastIndex since we modified the string
        pattern.lastIndex += cyan.length + reset.length
      } else {
      }
    }
  }

  return highlighted
}

// Key-value pair highlight (preserve original alignment)
const highlightKeyValue = (line: string, separator: string): string => {
  const { reset, white } = COLORS

  const escSeparator = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Improved regex: support key names with spaces and special characters, preserve original spaces
  const regex = new RegExp(`^([^${escSeparator}]+)(\\s*${escSeparator}\\s*)(.*)$`)

  return line.replace(regex, (_, k, separatorPart, v) => {
    // Preserve original leading spaces, set both key and value to white
    const leadingSpaces = k.match(/^(\s*)/)?.[1] || ''
    const keyName = k.trim()
    return `${leadingSpaces}${white}${keyName}${reset}${separatorPart}${white}${v}${reset}`
  })
}

// Path highlight
const highlightPath = (line: string): string => {
  const { reset, cyan } = COLORS

  return line.replace(/(\/[\w\/\-\.]*|[A-Z]:\$$\w\\\-\.]*)/g, `${cyan}$1${reset}`)
}

// Network address highlight
const highlightNetwork = (line: string): string => {
  const { reset, blue, yellow } = COLORS

  // First highlight IPv4 addresses
  let highlighted = line.replace(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g, `${blue}$1${reset}`)

  // Highlight IPv6 addresses (avoid conflict with port numbers)
  highlighted = highlighted.replace(/([0-9a-fA-F]{1,4}:[0-9a-fA-F:]+)/g, `${blue}$1${reset}`)

  // Only highlight port numbers (colon followed by pure number, not in IPv6 address)
  highlighted = highlighted.replace(/(?<![0-9a-fA-F]):(\d+)(?![0-9a-fA-F:])/g, `:${yellow}$1${reset}`)

  return highlighted
}

// MAC address highlight
const highlightMacAddress = (line: string): string => {
  const { reset, cyan, yellow } = COLORS

  return line.replace(REGEX_PATTERNS.macAddress, (match) => {
    // Determine color based on MAC address prefix
    if (match.startsWith('52:54:00')) {
      return `${cyan}${match}${reset}` // Virtual machine default MAC - cyan
    } else if (match.startsWith('02:42')) {
      return `${yellow}${match}${reset}` // Docker MAC - yellow
    } else {
      return `${cyan}${match}${reset}` // Other MAC - cyan
    }
  })
}

// Status info highlight
const highlightStatus = (line: string): string => {
  const { reset, success, error, warning, info } = COLORS

  return line
    .replace(/\b(running|active|enabled|ok|success)\b/gi, `${success}$1${reset}`)
    .replace(/\b(stopped|inactive|disabled|failed|error)\b/gi, `${error}$1${reset}`)
    .replace(/\b(pending|warning|caution)\b/gi, `${warning}$1${reset}`)
    .replace(/\b(info|status|state)\b/gi, `${info}$1${reset}`)
}

// TCP connection table highlight
const highlightTcpConnectionTable = (line: string): string => {
  const { reset, header, number, cyan, yellow, green, blue, magenta } = COLORS

  // Check if it's a table header - support multiple network connection table formats
  if ((line.includes('State') && line.includes('Recv-Q') && line.includes('Send-Q')) || (line.includes('Netid') && line.includes('State'))) {
    // Use more flexible regex to match table header, handle possible space variations
    return line.replace(/(Netid|State|Recv-Q|Send-Q|Local\s+Address:Port|Peer\s+Address:Port|Process)/g, `${header}$1${reset}`)
  }

  // Process data rows
  let highlighted = line

  // Highlight status field
  highlighted = highlighted.replace(/\b(LISTEN|ESTAB|SYN-RECV|CLOSE_WAIT|TIME_WAIT|FIN_WAIT|CLOSING|LAST_ACK|CLOSED|UNCONN)\b/g, (match) => {
    let color = cyan // Default cyan
    if (match === 'LISTEN') {
      color = green // Listening state - green
    } else if (match === 'ESTAB') {
      color = blue // Established - blue
    } else if (match === 'SYN-RECV') {
      color = yellow // Half-open connection - yellow
    } else if (match === 'UNCONN') {
      color = magenta // Unconnected - magenta
    } else if (match.includes('WAIT') || match.includes('CLOSING')) {
      color = magenta // Waiting state - magenta
    }
    return `${color}${match}${reset}`
  })

  // First process IP addresses and ports (before number highlighting)

  // Process IPv6 addresses (including interface names)
  highlighted = highlighted.replace(/\[([0-9a-fA-F:]*[0-9a-fA-F:]+[0-9a-fA-F:]*|::)](%[a-zA-Z0-9]+)?:([0-9*]+)/g, (_, ipv6, iface, port) => {
    const interfacePart = iface ? `${yellow}${iface}${reset}` : ''
    return `${cyan}[${ipv6}]${reset}${interfacePart}:${yellow}${port}${reset}`
  })

  // Process IPv4 addresses (including interface names)
  highlighted = highlighted.replace(/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})(%[a-zA-Z0-9]+)?:([0-9*]+)/g, (_, ipv4, iface, port) => {
    const interfacePart = iface ? `${yellow}${iface}${reset}` : ''
    return `${blue}${ipv4}${reset}${interfacePart}:${yellow}${port}${reset}`
  })

  // Process wildcard addresses
  highlighted = highlighted.replace(/\*:([0-9*]+)/g, (_, port) => {
    return `${yellow}*${reset}:${yellow}${port}${reset}`
  })

  // Highlight independent port numbers (without colon prefix)
  highlighted = highlighted.replace(/(?<![:\w]):([0-9*]+)/g, (_, port) => {
    return `:${yellow}${port}${reset}`
  })

  // Highlight wildcard
  highlighted = highlighted.replace(/\*/g, (_) => {
    return `${yellow}*${reset}`
  })

  // Finally process number fields (Recv-Q, Send-Q), but exclude already highlighted IPv6 addresses
  highlighted = highlighted.replace(/(?<!\[[^\]]*)\b(\d+)\b(?![^\]]*\])/g, (match) => {
    return `${number}${match}${reset}`
  })

  return highlighted
}

// Dynamically adjust terminal height based on content (vertical adaptive, no vertical scrolling; horizontal scroll bar appears when not enough)
const adjustTerminalHeight = () => {
  if (!terminal) return

  let actualContentLines = 0
  let maxLineLength = 0
  let totalLines = 0

  // Calculate total number of lines (including empty lines)
  for (let i = 0; i < terminal.buffer.active.length; i++) {
    const line = terminal.buffer.active.getLine(i)
    if (line) {
      const text = line.translateToString()
      totalLines = i + 1
      if (text.trim()) actualContentLines = i + 1
      const lineWidth = getStringDisplayWidth(text)
      if (lineWidth > maxLineLength) maxLineLength = lineWidth
    }
  }

  const minRows = 1
  // Use total number of lines instead of non-empty lines, ensure all content can be displayed
  // If total number of lines is 0, use actual content lines
  const actualRows = Math.max(minRows, totalLines || actualContentLines)
  const rowsToShow = !isExpanded.value && isCollapsible.value ? 10 : actualRows

  // Adjust terminal size based on content width
  const cols = maxLineLength
  terminal.resize(cols, rowsToShow)

  if (terminalContainer.value) {
    const rowEl = terminalContainer.value.querySelector('.xterm-rows > div') as HTMLElement | null
    let rowHeight = rowEl ? rowEl.getBoundingClientRect().height : 18
    rowHeight = Math.ceil(rowHeight)
    const styles = window.getComputedStyle(terminalContainer.value)
    const paddingTop = parseFloat(styles.paddingTop) || 0
    const paddingBottom = parseFloat(styles.paddingBottom) || 0
    const newHeight = rowsToShow * rowHeight + paddingTop + paddingBottom + 14
    terminalContainer.value.style.height = `${newHeight}px`
  }
}

// Get theme related colors
const getThemeColors = () => {
  const isDark = isDarkTheme()
  return {
    background: isDark ? '#1e1e1e' : '#f8fafc',
    foreground: isDark ? '#d4d4d4' : '#0f172a',
    cursor: 'transparent',
    cursorAccent: 'transparent',
    black: '#000000',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#4a9ba8',
    white: '#abb2bf',
    brightBlack: '#5c6370',
    brightRed: '#ff7b86',
    brightGreen: '#b5e890',
    brightYellow: '#ffd68a',
    brightBlue: '#79c0ff',
    brightMagenta: '#d8a6ff',
    brightCyan: '#6bb6c7',
    brightWhite: '#ffffff'
  }
}

// Initialize terminal
const initTerminal = async () => {
  if (!terminalContainer.value) return

  terminal = new Terminal({
    cursorBlink: false,
    cursorStyle: 'block',
    scrollback: Number.MAX_SAFE_INTEGER,
    fontSize: 11,
    fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
    theme: getThemeColors(),
    allowTransparency: false,
    allowProposedApi: true,
    convertEol: true,
    disableStdin: true,
    scrollOnUserInput: false
  })

  terminal.open(terminalContainer.value)

  terminal.options.cursorBlink = false
  terminal.options.cursorStyle = 'block'

  nextTick(() => {
    adjustTerminalHeight()
  })
}
// Enhanced terminal output syntax highlighting (with cache optimization)
const addTerminalSyntaxHighlighting = (content: string): string => {
  if (!content || typeof content !== 'string') {
    return content
  }

  // Check cache
  if (highlightCache.has(content)) {
    return highlightCache.get(content)!
  }

  // First process existing ANSI color codes
  let processedContent = processAnsiCodes(content)

  const lines = processedContent.split('\n')
  const highlightedLines = lines.map((line) => {
    // Skip empty lines (but preserve original format of lines containing only spaces)
    if (line === '') return line

    // 0. Prioritize processing simplified ps command format (PID TTY TIME CMD)
    if (line.trim() === 'PID TTY TIME CMD') {
      return highlightPsSimpleHeaderPreserveSpacing(line)
    }

    // 0.1 Detect simplified ps data line (4 fields: number terminal time command)
    const simpleParts = line.trim().split(/\s+/)
    if (
      simpleParts.length === 4 &&
      /^\d+$/.test(simpleParts[0]) &&
      /^\d{1,2}:\d{2}:\d{2}$/.test(simpleParts[2]) &&
      !line.includes('UID') &&
      !line.includes('PPID') &&
      !line.includes('USER')
    ) {
      return highlightPsSimpleOutputPreserveSpacing(line)
    }

    // 1. Process ls -la command header
    if (line.match(/^total\s+\d+$/)) {
      return highlightLsHeaderPreserveSpacing(line)
    }

    // 1.1 Process ls -la format output (preserve original spacing)
    if (line.match(/^[dlrwx-]+\s+\d+\s+\w+\s+\w+\s+\d+\s+[A-Za-z]+\s+\d+\s+(?:\d{1,2}:\d{2}|\d{4})\s+.+$/)) {
      return highlightLsOutputPreserveSpacing(line)
    }

    // 1.1 Process ls -la format output (regular expression matching)
    const lsMatch = line.match(REGEX_PATTERNS.ls)
    if (lsMatch) {
      return highlightLsOutput(lsMatch)
    }

    // 2.1 Process ps command header (pure header line)
    const psHeaderOnlyMatch = line.match(REGEX_PATTERNS.psHeaderOnly)
    if (psHeaderOnlyMatch) {
      return highlightPsHeaderOnlyOutput(line)
    }

    // 2.1.1 Process ps command header (manual detection)
    if (
      line.includes('UID') &&
      line.includes('PID') &&
      line.includes('PPID') &&
      line.includes('CMD') &&
      !line.includes('USER') &&
      !line.includes('%CPU') &&
      !line.includes('%MEM')
    ) {
      return highlightPsHeaderPreserveSpacing(line)
    }

    // 2.1.2 Process ps aux command header (manual detection)
    // Check if it is ps aux format (USER before PID)
    if (
      line.includes('USER') &&
      line.includes('PID') &&
      line.includes('%CPU') &&
      line.includes('%MEM') &&
      line.includes('COMMAND') &&
      line.indexOf('USER') < line.indexOf('PID')
    ) {
      return highlightPsAuxHeaderPreserveSpacing(line)
    }

    // 2.1.2.1 Process top command header (PID in USER before)
    if (
      line.includes('USER') &&
      line.includes('PID') &&
      line.includes('%CPU') &&
      line.includes('%MEM') &&
      line.includes('COMMAND') &&
      line.indexOf('PID') < line.indexOf('USER')
    ) {
      return highlightTopHeaderPreserveSpacing(line)
    }

    // 2.1.3 Process simplified ps command header (PID TTY TIME CMD)
    if (
      line.includes('PID') &&
      line.includes('TTY') &&
      line.includes('TIME') &&
      line.includes('CMD') &&
      !line.includes('UID') &&
      !line.includes('PPID') &&
      !line.includes('USER')
    ) {
      return highlightPsSimpleHeaderPreserveSpacing(line)
    }

    // 2.2 Process ps command header (header line with data)
    const psHeaderMatch = line.match(REGEX_PATTERNS.psHeader)
    if (psHeaderMatch) {
      return highlightPsHeaderOutput(psHeaderMatch)
    }

    // 2.3 Process simplified ps command data line (PID TTY TIME CMD) - prioritize simplified format detection
    // Detect format: number terminal time command (4 fields, time format is HH:MM:SS)
    if (
      line.match(/^\s*\d+\s+\S+\s+\d{1,2}:\d{2}:\d{2}\s+.+$/) &&
      !line.match(/^\s*\d+\s+\d+\s+\d+\s+\d+\s+/) &&
      !line.includes('UID') &&
      !line.includes('PPID') &&
      !line.includes('USER')
    ) {
      return highlightPsSimpleOutputPreserveSpacing(line)
    }

    // 2.4 Process ps command data line - preserve original spacing information
    // Check if it looks like ps line (contains time format and starts with number)
    if (line.match(/^\s*\d+\s+\d+\s+\d+\s+\d+\s+/) && line.match(/\d{1,2}:\d{2}/)) {
      // Directly highlight original line, preserve spacing information
      return highlightPsOutputPreserveSpacing(line)
    }

    // 2.4.1 Process ps -ef command data line (UID may be username)
    // Check format: UID PID PPID C STIME TTY TIME CMD (8 fields, 2nd, 3rd, 4th fields are numbers)
    if (
      line.match(/^\s*\S+\s+\d+\s+\d+\s+\d+\s+\S+\s+\S+\s+\d{1,2}:\d{2}:\d{2}\s+.+$/) &&
      !line.includes('USER') &&
      !line.includes('%CPU') &&
      !line.includes('%MEM')
    ) {
      return highlightPsOutputPreserveSpacing(line)
    }

    // 2.5 Process ps command data line (regular expression matching)
    const psMatch = line.match(REGEX_PATTERNS.ps)
    if (psMatch) {
      return highlightPsOutput(psMatch)
    }

    // 3. Process netstat command header
    if (line.match(/^Proto\s+Recv-Q\s+Send-Q\s+Local Address\s+Foreign Address\s+State$/)) {
      return highlightNetstatHeaderPreserveSpacing(line)
    }

    // 3.0 Process netstat command header (more lenient matching)
    if (
      line.includes('Proto') &&
      line.includes('Recv-Q') &&
      line.includes('Send-Q') &&
      line.includes('Local Address') &&
      line.includes('Foreign Address') &&
      line.includes('State')
    ) {
      return highlightNetstatHeaderPreserveSpacing(line)
    }

    // 3.0.1 Process netstat unix domain socket header
    if (
      line.includes('Proto') &&
      line.includes('RefCnt') &&
      line.includes('Flags') &&
      line.includes('Type') &&
      line.includes('State') &&
      line.includes('Path')
    ) {
      return highlightNetstatUnixHeaderPreserveSpacing(line)
    }

    // 3.1 Process ss command and output (preserve original spacing)
    if (line.match(/^Recv-Q\s+Send-Q\s+Local\s+Address:Port\s+Peer\s+Address:Port\s+Process\s*$/)) {
      return highlightSsTableHeader(line)
    }

    if (line.match(/^\d+\s+\d+\s+[^\s]+\:[^\s]+\s+[^\s]+\:[^\s]*\s*$/)) {
      return highlightSsTableData(line)
    }

    if (line.match(/^(tcp|udp|tcp6|udp6)\s+[A-Z_]+\s+\d+\s+\d+\s+[^\s]+\:[^\s]+\s+[^\s]+\:[^\s]*/)) {
      return highlightSsOutputPreserveSpacing(line)
    }

    // 3.2 Process custom TCP connection table format
    if (
      line.match(
        /^(State|LISTEN|ESTAB|SYN-RECV|CLOSE_WAIT|TIME_WAIT|FIN_WAIT|CLOSING|LAST_ACK|CLOSED|UNCONN)\s+\d+\s+\d+\s+[^\s]+\:[^\s]+\s+[^\s]+\:[^\s]*/
      )
    ) {
      return highlightTcpConnectionTable(line)
    }

    // 3.3 Process network connection table format containing Netid field
    if (line.match(/^(Netid|State|Recv-Q|Send-Q|Local\s+Address:Port|Peer\s+Address:Port|Process)/)) {
      return highlightTcpConnectionTable(line)
    }

    // 3.2 Process netstat command output (preserve original spacing)
    if (line.match(/^(tcp|tcp6)\s+\d+\s+\d+\s+[^\s]+\:[^\s]+\s+[^\s]+\:[^\s]+\s+[A-Z_]+/)) {
      return highlightNetstatOutputPreserveSpacing(line)
    }

    if (line.match(/^(udp|udp6)\s+\d+\s+\d+\s+[^\s]+\:[^\s]+\s+[^\s]+\:[^\s]+/)) {
      return highlightNetstatOutputPreserveSpacing(line)
    }

    if (line.match(/^unix\s+\d+\s+\[[^$$]*\]\s+\w+\s+.*$/)) {
      return highlightNetstatUnixOutputPreserveSpacing(line)
    }

    // 4. Process JSON content (prioritize detection, avoid being matched by other conditions)
    if (line.match(/^\s*[{}[\]]/) || line.match(/^\s*"[^"]+"\s*:/) || line.match(/^\s*"[^"]+"\s*,?\s*$/)) {
      return highlightHttpOutput(line)
    }

    // 5. Process git command output
    if (REGEX_PATTERNS.git.test(line)) {
      return highlightGitOutput(line)
    }

    // 6. Process docker command output (preserve original spacing)
    if (
      line.match(/^[a-f0-9]{12}\s+.+\s+".+"\s+.+\s+.+\s+.+\s+.+$/) ||
      line.match(/^CONTAINER ID\s+IMAGE\s+COMMAND\s+CREATED\s+STATUS\s+PORTS\s+NAMES$/)
    ) {
      return highlightDockerOutputPreserveSpacing(line)
    }

    // 6.1 Process docker command output (regular expression matching)
    if (REGEX_PATTERNS.docker.test(line)) {
      return highlightDockerOutput(line)
    }

    // 7. Process npm/yarn command output
    if (REGEX_PATTERNS.npm.test(line)) {
      return highlightNpmOutput(line)
    }

    // 8. Process curl/wget command output
    if (line.match(/^curl\s+/) || line.match(/^wget\s+/) || line.match(/^HTTP\/\d\.\d\s+\d+/)) {
      return highlightHttpOutput(line)
    }

    // 8.1 Process iptables command output
    if (REGEX_PATTERNS.iptables.test(line)) {
      return highlightIptablesOutput(line)
    }

    // 8.2 Process systemctl command output
    if (
      REGEX_PATTERNS.systemctlHeader.test(line) ||
      REGEX_PATTERNS.systemctlService.test(line) ||
      REGEX_PATTERNS.systemctlUnit.test(line) ||
      (line.includes('.service') && line.includes('loaded') && line.includes('active'))
    ) {
      return highlightSystemctlOutput(line)
    }

    // 8.3 Process free command output
    if (line.match(/^Mem:|^Swap:/) || line.match(/^\s*total\s+used\s+free\s+shared\s+buff\/cache\s+available/)) {
      return highlightFreeOutput(line)
    }

    // 8. Process df command (optimize detection logic)
    // First check if it is df header (quick check)
    if (
      line.includes('Filesystem') &&
      line.includes('Size') &&
      line.includes('Used') &&
      line.includes('Avail') &&
      line.includes('Use%') &&
      line.includes('Mounted on')
    ) {
      return highlightDfHeaderPreserveSpacing(line)
    }

    const dfParts = line.split(/\s+/)
    if (dfParts.length >= 6) {
      const hasPercent = dfParts.some((part) => part.includes('%'))
      const hasMountPoint = dfParts[dfParts.length - 1].startsWith('/')

      if (hasPercent && hasMountPoint) {
        return highlightDfOutputPreserveSpacing(line)
      }
    }

    // 2.3.1 Process ps aux command data line
    if (line.match(/^\s*[\w+-]+\s+\d+\s+\d+\.\d+\s+\d+\.\d+\s+\d+\s+\d+\s+\S+\s+\S+\s+\S+\s+\S+\s+.+$/)) {
      return highlightPsAuxOutputPreserveSpacing(line)
    }

    // 9. Process top/htop command system information line
    if (
      line.match(/^top\s+-/) ||
      line.match(/^Tasks:/) ||
      line.match(/^%Cpu$s$:/) ||
      line.match(/^MiB\s+Mem\s*:/) ||
      line.match(/^MiB\s+Swap:/) ||
      line.match(/^KiB\s+Mem\s*:/) ||
      line.match(/^KiB\s+Swap:/) ||
      line.match(/^Mem:/) ||
      line.match(/^Swap:/)
    ) {
      return highlightTopSystemInfo(line)
    }

    // 9.1 Process top/htop command header (exact match)
    if (line.match(/^\s*PID\s+USER\s+PR\s+NI\s+VIRT\s+RES\s+SHR\s+S\s+%CPU\s+%MEM\s+TIME\+\s+COMMAND\s*$/)) {
      return highlightTopHeaderPreserveSpacing(line)
    }

    // 9.1.1 Process top/htop command header (more lenient matching, as backup)
    if (line.includes('PID') && line.includes('USER') && line.includes('%CPU') && line.includes('%MEM') && line.includes('COMMAND')) {
      return highlightTopHeaderPreserveSpacing(line)
    }

    // 9.2 Process top/htop command data line (original format matching)
    if (line.match(/^\s*\d+\s+[\w+-]+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\w\s+\d+\.\d+\s+\d+\.\d+\s+\d+:\d+\.\d+\s+.+$/)) {
      return highlightTopOutputPreserveSpacing(line)
    }

    // 9.3 Process top/htop command data line (more lenient matching)
    if (
      line.match(/^\s*\d+\s+[\w+-]+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\w\s+\d+\.\d+\s+\d+\.\d+\s+\d+:\d+\.\d+\s+/) ||
      line.match(/^\s*\d+\s+[\w+-]+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\w\s+\d+\.\d+\s+\d+\.\d+\s+\d+:\d+\.\d+\s+\w+/)
    ) {
      return highlightTopOutputPreserveSpacing(line)
    }

    // 9.4 Process top/htop command data line (most lenient matching)
    const topParts = line.trim().split(/\s+/)
    if (topParts.length >= 12 && /^\d+$/.test(topParts[0]) && /^[\w+-]+$/.test(topParts[1]) && /^\d+$/.test(topParts[2])) {
      return highlightTopOutputPreserveSpacing(line)
    }

    // 9.4.1 Process top/htop command data line (more lenient matching)
    if (topParts.length >= 10 && /^\d+$/.test(topParts[0]) && /^[\w+-]+$/.test(topParts[1])) {
      return highlightTopOutputPreserveSpacing(line)
    }

    // 9.5 Process already highlighted top data line (contains ANSI color codes)
    if (line.includes('\x1b[') && line.match(/^\s*\x1b$$32m\d+\x1b\[0m/)) {
      return line // Already highlighted, return directly
    }

    // 9.6 Process top command another format (USER PR PID VIRT RES SHR S %CPU %MEM TIME COMMAND)
    if (line.match(/^\s*\w+\s+[\d-]+\s+\d+\s+\d+\s+\d+\s+\d+\s+\w\s+\d+\.\d+\s+\d+\.\d+\s+\d+:\d+\.\d+\s+.+$/)) {
      return highlightTopOutputAlternativeFormat(line)
    }

    // 9.7 Process top command general detection (fallback matching)
    if (
      line.match(/^\s*\w+\s+[\d-]+\s+\d+\s+/) &&
      (line.includes('%CPU') || line.includes('CPU') || line.includes('MEM') || line.includes('TIME')) &&
      !line.includes('PID') &&
      !line.includes('USER') &&
      !line.includes('COMMAND')
    ) {
      return highlightTopOutputAlternativeFormat(line)
    }

    // 10. Process tail/head command output
    if (REGEX_PATTERNS.tail.test(line)) {
      return highlightTailOutput(line)
    }

    // 11. Process error and warning information
    if (REGEX_PATTERNS.error.test(line)) {
      return highlightErrorOutput(line)
    }

    // 12. Process success information
    if (REGEX_PATTERNS.success.test(line)) {
      return highlightSuccessOutput(line)
    }

    // 13. Process MAC address (prioritize network address detection)
    if (REGEX_PATTERNS.macAddress.test(line)) {
      return highlightMacAddress(line)
    }

    if (/(\.(?:[A-Za-z0-9]{1,4})\b|(?:tar\.(?:gz|xz|bz2|zst)|tgz|tbz2|txz)\b)/i.test(line) && !line.includes(':') && !line.includes('=')) {
      if (/\S+\s{2,}\S+/.test(line)) {
        return highlightSimpleLsColumnsPreserveSpacing(line)
      }
      return highlightSimpleLsOutput(line)
    }

    const detection = detectFormat(line)
    if (detection && detection.confidence > 0.4) {
      return applySmartHighlight(line, detection)
    }

    // 13. Process simple ls output (only file name) - final fallback processing
    if (line.trim() && !line.includes('total') && !line.includes('drwx') && !line.includes('-rw') && !line.includes('PID')) {
      if (/\S+\s{2,}\S+/.test(line)) {
        return highlightSimpleLsColumnsPreserveSpacing(line)
      }
      return highlightSimpleLsOutput(line)
    }

    return line
  })

  const result = highlightedLines.join('\n')

  // Cache result
  clearCache()
  highlightCache.set(content, result)

  return result
}

// Enhanced ANSI color code processing
const processAnsiCodes = (str: string): string => {
  if (!str || typeof str !== 'string') {
    return str
  }

  let result = str
    .replace(/\u001b\[[\d;]*[HfABCDEFGJKSTijklmnpqrsu]/g, '')
    .replace(/\u001b\[\?[0-9;]*[hl]/g, '')
    .replace(/\u001b\([AB01]/g, '')
    .replace(/\u001b[=>]/g, '')
    .replace(/\u001b[NO]/g, '')
    .replace(/\u001b$$0;[^\x07]*\x07/g, '')
    .replace(/\u001b\[K/g, '')
    .replace(/\u001b\[J/g, '')
    .replace(/\u001b\[2J/g, '')
    .replace(/\u001b\[H/g, '')
    .replace(/\x00/g, '')
    .replace(/\r/g, '')
    .replace(/\x07/g, '')
    .replace(/\x08/g, '')
    .replace(/\x0B/g, '')
    .replace(/\x0C/g, '')
    .replace(/\u001b\[0m/g, '\x1b[0m') // Reset
    .replace(/\u001b\[1m/g, '\x1b[1m') // Bold
    .replace(/\u001b\[2m/g, '\x1b[2m') // Dim
    .replace(/\u001b\[3m/g, '\x1b[3m') // Italic
    .replace(/\u001b\[4m/g, '\x1b[4m') // Underline
    .replace(/\u001b\[5m/g, '\x1b[5m') // Blink
    .replace(/\u001b\[6m/g, '\x1b[6m') // Rapid blink
    .replace(/\u001b\[7m/g, '\x1b[7m') // Reverse
    .replace(/\u001b\[8m/g, '\x1b[8m') // Conceal
    .replace(/\u001b\[9m/g, '\x1b[9m') // Strikethrough
    .replace(/\u001b\[30m/g, '\x1b[30m') // Black
    .replace(/\u001b\[31m/g, '\x1b[31m') // Red
    .replace(/\u001b\[32m/g, '\x1b[32m') // Green
    .replace(/\u001b\[33m/g, '\x1b[33m') // Yellow
    .replace(/\u001b\[34m/g, '\x1b[34m') // Blue
    .replace(/\u001b\[35m/g, '\x1b[35m') // Magenta
    .replace(/\u001b\[36m/g, '\x1b[36m') // Cyan
    .replace(/\u001b\[37m/g, '\x1b[37m') // White
    .replace(/\u001b\[90m/g, '\x1b[90m') // Bright Black
    .replace(/\u001b\[91m/g, '\x1b[91m') // Bright Red
    .replace(/\u001b\[92m/g, '\x1b[92m') // Bright Green
    .replace(/\u001b\[93m/g, '\x1b[93m') // Bright Yellow
    .replace(/\u001b\[94m/g, '\x1b[94m') // Bright Blue
    .replace(/\u001b\[95m/g, '\x1b[95m') // Bright Magenta
    .replace(/\u001b\[96m/g, '\x1b[96m') // Bright Cyan
    .replace(/\u001b\[97m/g, '\x1b[97m') // Bright White
    .replace(/\u001b\[40m/g, '\x1b[40m') // Black background
    .replace(/\u001b\[41m/g, '\x1b[41m') // Red background
    .replace(/\u001b\[42m/g, '\x1b[42m') // Green background
    .replace(/\u001b\[43m/g, '\x1b[43m') // Yellow background
    .replace(/\u001b\[44m/g, '\x1b[44m') // Blue background
    .replace(/\u001b\[45m/g, '\x1b[45m') // Magenta background
    .replace(/\u001b\[46m/g, '\x1b[46m') // Cyan background
    .replace(/\u001b\[47m/g, '\x1b[47m') // White background
    .replace(/\u001b\[100m/g, '\x1b[100m') // Bright Black background
    .replace(/\u001b\[101m/g, '\x1b[101m') // Bright Red background
    .replace(/\u001b\[102m/g, '\x1b[102m') // Bright Green background
    .replace(/\u001b\[103m/g, '\x1b[103m') // Bright Yellow background
    .replace(/\u001b\[104m/g, '\x1b[104m') // Bright Blue background
    .replace(/\u001b\[105m/g, '\x1b[105m') // Bright Magenta background
    .replace(/\u001b\[106m/g, '\x1b[106m') // Bright Cyan background
    .replace(/\u001b\[107m/g, '\x1b[107m') // Bright White background

  // Process 256 colors and RGB colors
  result = result.replace(/\u001b\[38;5;(\d+)m/g, (_, colorCode) => {
    const code = parseInt(colorCode)
    if (code < 16) {
      // Standard color
      return `\x1b[${code < 8 ? code + 30 : code + 82}m`
    } else if (code < 232) {
      // 216 colors
      return `\x1b[38;5;${code}m`
    } else {
      // Grayscale
      return `\x1b[38;5;${code}m`
    }
  })

  result = result.replace(/\u001b\[48;5;(\d+)m/g, (_, colorCode) => {
    const code = parseInt(colorCode)
    if (code < 16) {
      // Standard background color
      return `\x1b[${code < 8 ? code + 40 : code + 92}m`
    } else if (code < 232) {
      // 216 colors background
      return `\x1b[48;5;${code}m`
    } else {
      // Grayscale background
      return `\x1b[48;5;${code}m`
    }
  })

  // Process RGB colors
  result = result.replace(/\u001b\[38;2;(\d+);(\d+);(\d+)m/g, (_, r, g, b) => {
    return `\x1b[38;2;${r};${g};${b}m`
  })

  result = result.replace(/\u001b\[48;2;(\d+);(\d+);(\d+)m/g, (_, r, g, b) => {
    return `\x1b[48;2;${r};${g};${b}m`
  })

  // Process combined styles
  result = result.replace(/\u001b\[(\d+);(\d+)m/g, (_, p1, p2) => {
    const code1 = parseInt(p1)
    const code2 = parseInt(p2)

    // Process common combinations
    if (code1 === 1 && code2 === 30) return '\x1b[1;30m' // Bold black
    if (code1 === 1 && code2 === 31) return '\x1b[1;31m' // Bold red
    if (code1 === 1 && code2 === 32) return '\x1b[1;32m' // Bold green
    if (code1 === 1 && code2 === 33) return '\x1b[1;33m' // Bold yellow
    if (code1 === 1 && code2 === 34) return '\x1b[1;34m' // Bold blue
    if (code1 === 1 && code2 === 35) return '\x1b[1;35m' // Bold magenta
    if (code1 === 1 && code2 === 36) return '\x1b[1;36m' // Bold cyan
    if (code1 === 1 && code2 === 37) return '\x1b[1;37m' // Bold white

    return `\x1b[${code1};${code2}m`
  })

  return result
}

// ls command output highlighting (preserve original spacing)
const highlightLsOutputPreserveSpacing = (line: string): string => {
  const { reset, key, number, info, warning, header, white } = COLORS

  // Use regular expression to match each field, but preserve original spacing
  let highlighted = line

  // Match permission field (first field)
  highlighted = highlighted.replace(/^([dlrwx-]+)(\s+)/, (_, permissions, afterSpaces) => {
    return `${key}${permissions}${reset}${afterSpaces}`
  })

  // Match link number field (second field)
  highlighted = highlighted.replace(/(\s+)(\d+)(\s+)/, (_, beforeSpaces, links, afterSpaces) => {
    return `${beforeSpaces}${number}${links}${reset}${afterSpaces}`
  })

  // Match user field (third field)
  highlighted = highlighted.replace(/(\s+)(\w+)(\s+)/, (_, beforeSpaces, user, afterSpaces) => {
    return `${beforeSpaces}${info}${user}${reset}${afterSpaces}`
  })

  // Match group field (fourth field)
  highlighted = highlighted.replace(/(\s+)(\w+)(\s+)/, (_, beforeSpaces, group, afterSpaces) => {
    return `${beforeSpaces}${warning}${group}${reset}${afterSpaces}`
  })

  // Match size field (fifth field)
  highlighted = highlighted.replace(/(\s+)(\d+)(\s+)/, (_, beforeSpaces, size, afterSpaces) => {
    return `${beforeSpaces}${number}${size}${reset}${afterSpaces}`
  })

  // Match date field (sixth field)
  highlighted = highlighted.replace(/(\s+)([A-Za-z]+\s+\d+\s+(?:\d{1,2}:\d{2}|\d{4}))(\s+)/, (_, beforeSpaces, date, afterSpaces) => {
    return `${beforeSpaces}${header}${date}${reset}${afterSpaces}`
  })

  // Match file name field (last field)
  highlighted = highlighted.replace(/(\s+)(.+)$/, (_, beforeSpaces, name) => {
    // Set color based on file type and permissions
    let nameColor = white
    if (line.startsWith('d')) {
      nameColor = COLORS.info
    } else if (line.startsWith('l')) {
      nameColor = COLORS.cyan
    } else if (line.includes('x')) {
      nameColor = COLORS.success
    } else if (name.startsWith('.')) {
      nameColor = COLORS.gray
    } else if (name.match(/\.(js|ts|vue|py|java|cpp|c|h)$/)) {
      nameColor = COLORS.info
    } else if (name.match(/\.(jpg|jpeg|png|gif|svg|ico)$/)) {
      nameColor = COLORS.magenta
    } else if (name.match(/\.(?:zip|rar|7z|gz|xz|bz2|zst|deb|rpm|pkg)$/) || name.match(/(?:tar\.(?:gz|xz|bz2|zst)|tgz|tbz2|txz)$/)) {
      nameColor = COLORS.warning
    }
    return `${beforeSpaces}${nameColor}${name}${reset}`
  })

  return highlighted
}

const highlightLsHeaderPreserveSpacing = (line: string): string => {
  const { reset, header } = COLORS
  let highlighted = line
  highlighted = highlighted.replace(/\b(total)\b/g, (match) => {
    return `${header}${match}${reset}`
  })

  return highlighted
}

// ls command output highlighting
const highlightLsOutput = (match: RegExpMatchArray): string => {
  const [, permissions, links, user, group, size, date, name] = match

  // Set color based on file type and permissions
  let nameColor = '\x1b[37m'
  if (permissions.startsWith('d')) {
    nameColor = '\x1b[34m'
  } else if (permissions.includes('x')) {
    nameColor = '\x1b[32m'
  } else if (name.startsWith('.')) {
    nameColor = '\x1b[90m'
  } else if (name.match(/\.(js|ts|vue|py|java|cpp|c|h)$/)) {
    nameColor = '\x1b[96m'
  } else if (name.match(/\.(jpg|jpeg|png|gif|svg|ico)$/)) {
    nameColor = '\x1b[35m'
  } else if (name.match(/\.(?:zip|rar|7z|gz|xz|bz2|zst|deb|rpm|pkg)$/) || name.match(/(?:tar\.(?:gz|xz|bz2|zst)|tgz|tbz2|txz)$/)) {
    nameColor = '\x1b[33m'
  }

  const reset = '\x1b[0m'
  const permColor = '\x1b[33m'
  const linkColor = '\x1b[96m'
  const userColor = '\x1b[31m'
  const groupColor = '\x1b[35m'
  const sizeColor = '\x1b[96m'
  const dateColor = '\x1b[33m'

  return `${permColor}${permissions}${reset} ${linkColor}${links}${reset} ${userColor}${user}${reset} ${groupColor}${group}${reset} ${sizeColor}${size}${reset} ${dateColor}${date}${reset} ${nameColor}${name}${reset}`
}

// ps command output highlighting (preserve original spacing)
const highlightPsOutputPreserveSpacing = (line: string): string => {
  const { reset, key, number, info, warning, header, white, gray, command, error } = COLORS

  // Use split to split fields, avoid complex regular expressions
  const parts = line.trim().split(/\s+/)

  // Check if it is a ps data line format (at least 8 fields)
  if (parts.length >= 8) {
    const [uid, pid, ppid, c, stime, tty, time, ...cmdParts] = parts
    const cmd = cmdParts.join(' ')

    // Define fixed column width (based on the typical output of the ps command)
    const columnWidths = {
      uid: 6,
      pid: 8,
      ppid: 8,
      c: 3,
      stime: 6,
      tty: 10,
      time: 10,
      cmd: 0
    }

    // Define colors
    const uidColor = uid === '0' ? error : key
    const pidColor = number
    const ppidColor = info
    const cColor = warning
    const stimeColor = header
    const ttyColor = white
    const timeColor = gray

    // Determine color based on command type
    let cmdColor = command
    if (cmd.includes('[') && cmd.includes(']')) {
      cmdColor = COLORS.magenta
    } else if (cmd.includes('init') || cmd.includes('systemd')) {
      cmdColor = COLORS.error
    } else if (cmd.includes('bash') || cmd.includes('sh')) {
      cmdColor = COLORS.success
    } else if (cmd.includes('node') || cmd.includes('python') || cmd.includes('java')) {
      cmdColor = COLORS.info
    }

    // Rebuild line, use smart width alignment
    return [
      smartFormatField(uid, columnWidths.uid, uidColor),
      smartFormatField(pid, columnWidths.pid, pidColor),
      smartFormatField(ppid, columnWidths.ppid, ppidColor),
      smartFormatField(c, columnWidths.c, cColor),
      smartFormatField(stime, columnWidths.stime, stimeColor),
      smartFormatField(tty, columnWidths.tty, ttyColor),
      smartFormatField(time, columnWidths.time, timeColor),
      `${cmdColor}${cmd}${reset}`
    ].join('')
  }

  // If the format does not match, revert to the original line
  return line
}

// ps command output highlighting
const highlightPsOutput = (match: RegExpMatchArray): string => {
  const [, uid, pid, ppid, c, stime, tty, time, cmd] = match

  const reset = '\x1b[0m'

  // Set different colors based on UID value
  let uidColor = '\x1b[31m'
  if (uid === '0') {
    uidColor = '\x1b[91m'
  } else {
    uidColor = '\x1b[33m'
  }

  // Set different colors based on process type
  let cmdColor = '\x1b[90m'
  if (cmd.includes('[') && cmd.includes(']')) {
    cmdColor = '\x1b[35m'
  } else if (cmd.includes('init') || cmd.includes('systemd')) {
    cmdColor = '\x1b[91m'
  } else if (cmd.includes('bash') || cmd.includes('sh')) {
    cmdColor = '\x1b[32m'
  } else if (cmd.includes('node') || cmd.includes('python') || cmd.includes('java')) {
    cmdColor = '\x1b[96m'
  }

  const pidColor = '\x1b[92m'
  const ppidColor = '\x1b[93m'
  const cColor = '\x1b[94m'
  const stimeColor = '\x1b[95m'
  const ttyColor = '\x1b[96m'
  const timeColor = '\x1b[97m'

  // Use fixed width formatting, ensure alignment with header
  const formattedUid = uid.padStart(4)
  const formattedPid = pid.padStart(7)
  const formattedPpid = ppid.padStart(7)
  const formattedC = c.padStart(2)
  const formattedStime = stime.padStart(5)
  const formattedTty = tty.padStart(10)
  const formattedTime = time.padStart(8)

  return `${uidColor}${formattedUid}${reset} ${pidColor}${formattedPid}${reset} ${ppidColor}${formattedPpid}${reset} ${cColor}${formattedC}${reset} ${stimeColor}${formattedStime}${reset} ${ttyColor}${formattedTty}${reset} ${timeColor}${formattedTime}${reset} ${cmdColor}${cmd}${reset}`
}

// ps command header highlighting (preserve original spacing)
const highlightPsHeaderPreserveSpacing = (line: string): string => {
  const { reset, header } = COLORS

  // Use split to split fields, avoid complex regular expressions
  const parts = line.trim().split(/\s+/)

  // Check if it is a ps header format (at least 8 fields)
  if (parts.length >= 8) {
    const [uid, pid, ppid, c, stime, tty, time, ...cmdParts] = parts
    const cmd = cmdParts.join(' ')

    // Define fixed column width (consistent with data row)
    const columnWidths = {
      uid: 6,
      pid: 8,
      ppid: 8,
      c: 3,
      stime: 6,
      tty: 10,
      time: 10,
      cmd: 0
    }

    // Rebuild header, use smart width alignment
    return [
      smartFormatField(uid, columnWidths.uid, header),
      smartFormatField(pid, columnWidths.pid, header),
      smartFormatField(ppid, columnWidths.ppid, header),
      smartFormatField(c, columnWidths.c, header),
      smartFormatField(stime, columnWidths.stime, header),
      smartFormatField(tty, columnWidths.tty, header),
      smartFormatField(time, columnWidths.time, header),
      `${header}${cmd}${reset}`
    ].join('')
  }

  // If the format does not match, revert to the original line
  return line
}

// ps command pure header highlighting
const highlightPsHeaderOnlyOutput = (_line: string): string => {
  const reset = '\x1b[0m'

  // Format header line to align with data row
  // Use fixed width to align columns
  const formattedHeader = '    UID     PID    PPID  C STIME TTY          TIME CMD'

  // Highlight each column name
  let highlighted = formattedHeader
    .replace(/\b(UID)\b/g, `\x1b[1;31m$1${reset}`)
    .replace(/\b(PID)\b/g, `\x1b[1;32m$1${reset}`)
    .replace(/\b(PPID)\b/g, `\x1b[1;33m$1${reset}`)
    .replace(/\b(C)\b/g, `\x1b[1;34m$1${reset}`)
    .replace(/\b(STIME)\b/g, `\x1b[1;35m$1${reset}`)
    .replace(/\b(TTY)\b/g, `\x1b[1;36m$1${reset}`)
    .replace(/\b(TIME)\b/g, `\x1b[1;37m$1${reset}`)
    .replace(/\b(CMD)\b/g, `\x1b[1;90m$1${reset}`)

  return highlighted
}

// ps command header highlighting
const highlightPsHeaderOutput = (match: RegExpMatchArray): string => {
  const [, uid, pid, ppid, c, stime, tty, time, cmd] = match

  const reset = '\x1b[0m'
  const uidColor = '\x1b[1;31m'
  const pidColor = '\x1b[1;32m'
  const ppidColor = '\x1b[1;33m'
  const cColor = '\x1b[1;34m'
  const stimeColor = '\x1b[1;35m'
  const ttyColor = '\x1b[1;36m'
  const timeColor = '\x1b[1;37m'
  const cmdColor = '\x1b[1;90m'

  return `${uidColor}${uid}${reset} ${pidColor}${pid}${reset} ${ppidColor}${ppid}${reset} ${cColor}${c}${reset} ${stimeColor}${stime}${reset} ${ttyColor}${tty}${reset} ${timeColor}${time}${reset} ${cmdColor}${cmd}${reset}`
}

// ps aux command header highlighting (preserve original spacing)
function highlightPsAuxHeaderPreserveSpacing(line: string): string {
  const { reset, header } = COLORS

  // Highlight header fields, preserve original spacing
  let highlighted = line

  // Highlight each header field (special handling for fields containing %)
  highlighted = highlighted.replace(/(USER|PID|VSZ|RSS|TTY|STAT|START|TIME|COMMAND)\b/g, (match) => {
    return `${header}${match}${reset}`
  })

  // Special handling for fields containing %
  highlighted = highlighted.replace(/(%CPU|%MEM)/g, (match) => {
    return `${header}${match}${reset}`
  })

  return highlighted
}

// ps aux command output highlighting (preserve original spacing)
function highlightPsAuxOutputPreserveSpacing(line: string): string {
  const { reset, key, number, info, warning, white, gray, command, error } = COLORS

  // Use regular expressions to match each field, but preserve original spacing
  let highlighted = line

  // Match USER (first field, may contain + etc. special characters)
  highlighted = highlighted.replace(/^(\s*)([\w+-]+)(\s+)/, (_, leadingSpaces, user, afterSpaces) => {
    let userColor = key
    if (user === 'root') {
      userColor = error
    }
    return `${leadingSpaces}${userColor}${user}${reset}${afterSpaces}`
  })

  // Match PID (second field)
  highlighted = highlighted.replace(/(\s+)(\d+)(\s+)/, (_, beforeSpaces, pid, afterSpaces) => {
    return `${beforeSpaces}${number}${pid}${reset}${afterSpaces}`
  })

  // Match %CPU (third field)
  highlighted = highlighted.replace(/(\s+)(\d+\.\d+)(\s+)/, (_, beforeSpaces, cpu, afterSpaces) => {
    const cpuPercent = parseFloat(cpu)
    let cpuColor = info
    if (cpuPercent > 80) {
      cpuColor = error
    } else if (cpuPercent > 50) {
      cpuColor = warning
    } else {
      cpuColor = COLORS.success
    }
    return `${beforeSpaces}${cpuColor}${cpu}${reset}${afterSpaces}`
  })

  // Match %MEM (fourth field)
  highlighted = highlighted.replace(/(\s+)(\d+\.\d+)(\s+)/, (_, beforeSpaces, mem, afterSpaces) => {
    const memPercent = parseFloat(mem)
    let memColor = info
    if (memPercent > 80) {
      memColor = error
    } else if (memPercent > 50) {
      memColor = warning
    } else {
      memColor = COLORS.success
    }
    return `${beforeSpaces}${memColor}${mem}${reset}${afterSpaces}`
  })

  // Match VSZ (fifth field)
  highlighted = highlighted.replace(/(\s+)(\d+)(\s+)/, (_, beforeSpaces, vsz, afterSpaces) => {
    return `${beforeSpaces}${gray}${vsz}${reset}${afterSpaces}`
  })

  // Match RSS (sixth field)
  highlighted = highlighted.replace(/(\s+)(\d+)(\s+)/, (_, beforeSpaces, rss, afterSpaces) => {
    return `${beforeSpaces}${gray}${rss}${reset}${afterSpaces}`
  })

  // Match TTY (seventh field)
  highlighted = highlighted.replace(/(\s+)(\S+)(\s+)/, (_, beforeSpaces, tty, afterSpaces) => {
    return `${beforeSpaces}${white}${tty}${reset}${afterSpaces}`
  })

  // Match STAT (eighth field) - use more precise method
  const parts = line.trim().split(/\s+/)
  if (parts.length >= 8) {
    const stat = parts[7]
    let statColor = warning
    if (stat.includes('R')) {
      statColor = COLORS.success
    } else if (stat.includes('S')) {
      statColor = COLORS.info
    } else if (stat.includes('Z')) {
      statColor = error
    } else if (stat.includes('T')) {
      statColor = warning
    } else if (stat.includes('I')) {
      statColor = COLORS.gray
    }

    // Precise replacement of STAT field
    const statPattern = new RegExp(`(\\s+)${stat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s+)`)
    highlighted = highlighted.replace(statPattern, (_, beforeSpaces, afterSpaces) => {
      return `${beforeSpaces}${statColor}${stat}${reset}${afterSpaces}`
    })
  }

  // Match START (ninth field) - use more precise method
  if (parts.length >= 9) {
    const start = parts[8]
    const startColor = COLORS.header

    // Precise replacement of START field
    const startPattern = new RegExp(`(\\s+)${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s+)`)
    highlighted = highlighted.replace(startPattern, (_, beforeSpaces, afterSpaces) => {
      return `${beforeSpaces}${startColor}${start}${reset}${afterSpaces}`
    })
  }

  // Match TIME (tenth field)
  highlighted = highlighted.replace(/(\s+)(\d+:\d+\.\d+)(\s+)/, (_, beforeSpaces, time, afterSpaces) => {
    return `${beforeSpaces}${gray}${time}${reset}${afterSpaces}`
  })

  // Match COMMAND (last field, remaining all content)
  highlighted = highlighted.replace(/(\s+)(.+)$/, (_, beforeSpaces, cmd) => {
    let cmdColor = command
    if (cmd.includes('[') && cmd.includes(']')) {
      cmdColor = COLORS.magenta
    } else if (cmd.includes('init') || cmd.includes('systemd')) {
      cmdColor = COLORS.error
    } else if (cmd.includes('bash') || cmd.includes('sh')) {
      cmdColor = COLORS.success
    } else if (cmd.includes('node') || cmd.includes('python') || cmd.includes('java')) {
      cmdColor = COLORS.info
    }
    return `${beforeSpaces}${cmdColor}${cmd}${reset}`
  })

  return highlighted
}

// ps simple command header highlighting (preserve original spacing)
const highlightPsSimpleHeaderPreserveSpacing = (line: string): string => {
  const { reset, header } = COLORS

  // Use split to split fields, avoid complex regular expressions
  const parts = line.trim().split(/\s+/)

  // Check if it is a simplified ps header format (4 fields)
  if (parts.length >= 4) {
    const [pid, tty, time, cmd] = parts

    // Define fixed column width (based on the typical output of the simplified ps command)
    const columnWidths = {
      pid: 8,
      tty: 8,
      time: 10,
      cmd: 0
    }

    // Rebuild header, use smart width alignment
    return [
      smartFormatField(pid, columnWidths.pid, header),
      smartFormatField(tty, columnWidths.tty, header),
      smartFormatField(time, columnWidths.time, header),
      `${header}${cmd}${reset}`
    ].join('')
  }

  return line
}

// ps simple command output highlighting (preserve original spacing)
const highlightPsSimpleOutputPreserveSpacing = (line: string): string => {
  const { reset, command, error, success, info } = COLORS

  // Use split to split fields, avoid complex regular expressions
  const parts = line.trim().split(/\s+/)

  // Check if it is a simplified ps data row format (at least 4 fields)
  if (parts.length >= 4) {
    const [pid, tty, time, ...cmdParts] = parts
    const cmd = cmdParts.join(' ')

    // Define maximum column width (consistent with header)
    const columnWidths = {
      pid: 8,
      tty: 8,
      time: 10,
      cmd: 0
    }

    // Define colors
    const pidColor = COLORS.green
    const ttyColor = COLORS.white
    const timeColor = COLORS.cyan

    // Determine color based on command type
    let cmdColor = command
    if (cmd.includes('[') && cmd.includes(']')) {
      cmdColor = COLORS.magenta
    } else if (cmd.includes('init') || cmd.includes('systemd')) {
      cmdColor = error
    } else if (cmd.includes('bash') || cmd.includes('sh')) {
      cmdColor = success
    } else if (cmd.includes('node') || cmd.includes('python') || cmd.includes('java')) {
      cmdColor = info
    }

    // Rebuild line, use smart width alignment
    return [
      smartFormatField(pid, columnWidths.pid, pidColor),
      smartFormatField(tty, columnWidths.tty, ttyColor),
      smartFormatField(time, columnWidths.time, timeColor),
      `${cmdColor}${cmd}${reset}`
    ].join('')
  }

  return line
}

// ss table header highlighting (preserve original spacing)
const highlightSsTableHeader = (line: string): string => {
  const { reset, header } = COLORS

  // Highlight table header, preserve original spacing format
  let highlighted = line

  // Highlight each field, preserve original spacing
  highlighted = highlighted.replace(/^(Recv-Q)/, (match) => {
    return `${header}${match}${reset}`
  })

  highlighted = highlighted.replace(/(\s+)(Send-Q)/, (_, spaces, match) => {
    return `${spaces}${header}${match}${reset}`
  })

  highlighted = highlighted.replace(/(\s+)(Local\s+Address:Port)/, (_, spaces, match) => {
    return `${spaces}${header}${match}${reset}`
  })

  highlighted = highlighted.replace(/(\s+)(Peer\s+Address:Port)/, (_, spaces, match) => {
    return `${spaces}${header}${match}${reset}`
  })

  highlighted = highlighted.replace(/(\s+)(Process)/, (_, spaces, match) => {
    return `${spaces}${header}${match}${reset}`
  })

  return highlighted
}

// ss table data row highlighting (preserve original spacing)
const highlightSsTableData = (line: string): string => {
  const { reset, number, url, key, warning, cyan } = COLORS

  let highlighted = line

  // Highlight number fields (Recv-Q, Send-Q), preserve original spacing
  highlighted = highlighted.replace(/^(\d+)(\s+)(\d+)/, (_, recvQ, spaces, sendQ) => {
    const recvColor = recvQ === '0' ? number : warning
    const sendColor = sendQ === '0' ? number : warning
    return `${recvColor}${recvQ}${reset}${spaces}${sendColor}${sendQ}${reset}`
  })

  // Highlight IP address and port, preserve original spacing
  highlighted = highlighted.replace(/(\s+)([^\s]+):([0-9*]+)/g, (_, spaces, addr, port) => {
    // Determine address type and apply corresponding color
    let addrColor = url
    if (addr === '*') {
      addrColor = warning
    } else if (addr.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
      // IPv4 address
      addrColor = url
    } else {
      // IPv6 address
      addrColor = cyan
    }
    return `${spaces}${addrColor}${addr}${reset}:${key}${port}${reset}`
  })

  return highlighted
}

// ss output highlighting (preserve original spacing)
const highlightSsOutputPreserveSpacing = (line: string): string => {
  const { reset, success, number, url, key, warning, header, error, cyan, yellow } = COLORS

  // Use simple method: only highlight critical parts, do not break original format
  let highlighted = line

  // 1. Highlight protocol field
  highlighted = highlighted.replace(/^(tcp|udp|tcp6|udp6)/, (match) => {
    return `${success}${match}${reset}`
  })

  // 2. Highlight status field (LISTEN, ESTABLISHED, etc.)
  highlighted = highlighted.replace(
    /\b(LISTEN|ESTABLISHED|TIME_WAIT|CLOSED|SYN_SENT|SYN_RECV|FIN_WAIT1|FIN_WAIT2|CLOSE_WAIT|LAST_ACK|CLOSING|CONNECTED|UNCONN|DGRAM|STREAM|SEQPACKET)\b/g,
    (match) => {
      let stateColor = COLORS.magenta
      if (match === 'ESTABLISHED' || match === 'CONNECTED') {
        stateColor = success
      } else if (match === 'TIME_WAIT') {
        stateColor = warning
      } else if (match === 'LISTEN') {
        stateColor = header
      } else if (match === 'CLOSED') {
        stateColor = error
      } else if (match === 'UNCONN') {
        stateColor = COLORS.magenta
      } else if (match === 'DGRAM' || match === 'STREAM' || match === 'SEQPACKET') {
        stateColor = cyan
      }
      return `${stateColor}${match}${reset}`
    }
  )

  // Handle IPv6 address (contains interface name)
  highlighted = highlighted.replace(/\[([0-9a-fA-F:]*[0-9a-fA-F:]+[0-9a-fA-F:]*|::)](%[a-zA-Z0-9]+)?:([0-9*]+)/g, (_, ipv6, iface, port) => {
    const interfacePart = iface ? `${yellow}${iface}${reset}` : ''
    return `${cyan}[${ipv6}]${reset}${interfacePart}:${key}${port}${reset}`
  })

  // Handle IPv4 address (contains interface name)
  highlighted = highlighted.replace(/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})(%[a-zA-Z0-9]+)?:([0-9*]+)/g, (_, ipv4, iface, port) => {
    const interfacePart = iface ? `${yellow}${iface}${reset}` : ''
    return `${url}${ipv4}${reset}${interfacePart}:${key}${port}${reset}`
  })

  // Handle wildcard address
  highlighted = highlighted.replace(/\*:([0-9*]+)/g, (_, port) => {
    return `${yellow}*${reset}:${key}${port}${reset}`
  })

  // Highlight independent port numbers (without colon prefix)
  highlighted = highlighted.replace(/(?<![:\w]):([0-9*]+)/g, (_, port) => {
    return `:${key}${port}${reset}`
  })

  // Highlight wildcard
  highlighted = highlighted.replace(/\*/g, (_) => {
    return `${yellow}*${reset}`
  })

  // Finally process number fields (Recv-Q, Send-Q, etc.), but exclude already highlighted IPv6 addresses
  highlighted = highlighted.replace(/(?<!\[[^\]]*)\b(\d+)\b(?![^\]]*\])/g, (match) => {
    return `${number}${match}${reset}`
  })

  return highlighted
}

// netstat command output highlighting (preserve original spacing)
const highlightNetstatOutputPreserveSpacing = (line: string): string => {
  const { reset, success, number, url, key, warning, header, error, cyan, yellow } = COLORS

  // Use simple method: only highlight critical parts, do not break original format
  let highlighted = line

  // 1. Highlight protocol field - ensure complete match tcp6, udp6
  highlighted = highlighted.replace(/^(tcp6|udp6|tcp|udp|unix)/, (match) => {
    return `${success}${match}${reset}`
  })

  // 2. Highlight IP address and port - use generic address matching logic
  // Match all possible address:port formats, then determine address type based on characteristics
  highlighted = highlighted.replace(/([^\s]+):([0-9*]+)/g, (_, addr, port) => {
    // Determine address type and apply corresponding color
    if (addr === '*') {
      // Wildcard address
      return `${yellow}${addr}${reset}:${key}${port}${reset}`
    } else if (addr.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
      // IPv4 address (exact match IPv4 format)
      return `${url}${addr}${reset}:${key}${port}${reset}`
    } else {
      // All other cases are considered IPv6 addresses (including ::1, :::, fe80::, etc.)
      // This is the safest method because non-IPv4 addresses in netstat output are basically IPv6
      return `${cyan}${addr}${reset}:${key}${port}${reset}`
    }
  })

  // 3. Finally highlight number fields (Recv-Q, Send-Q, RefCnt) - only highlight independent numbers
  // Use more precise regular expression, only match numbers not in addresses
  highlighted = highlighted.replace(/(?<![0-9a-fA-F:.])[\s]+(\d+)[\s]+(?![0-9a-fA-F:.])/g, (match, num) => {
    return match.replace(num, `${number}${num}${reset}`)
  })

  // 4. Highlight status field
  highlighted = highlighted.replace(
    /\b(LISTEN|ESTABLISHED|TIME_WAIT|CLOSED|SYN_SENT|SYN_RECV|FIN_WAIT1|FIN_WAIT2|CLOSE_WAIT|LAST_ACK|CLOSING|CONNECTED|DGRAM|STREAM|SEQPACKET)\b/g,
    (match) => {
      let stateColor = COLORS.magenta
      if (match === 'ESTABLISHED' || match === 'CONNECTED') {
        stateColor = success
      } else if (match === 'TIME_WAIT') {
        stateColor = warning
      } else if (match === 'LISTEN') {
        stateColor = header
      } else if (match === 'CLOSED') {
        stateColor = error
      } else if (match === 'DGRAM' || match === 'STREAM' || match === 'SEQPACKET') {
        stateColor = cyan
      }
      return `${stateColor}${match}${reset}`
    }
  )

  // 5. Highlight program field (PID/program name)
  highlighted = highlighted.replace(/(\d+)\/([^\s]+)/g, (_, pid, program) => {
    return `${number}${pid}${reset}/${header}${program}${reset}`
  })

  // 6. Highlight hyphen (indicates no PID/program info)
  highlighted = highlighted.replace(/(\s+)-(\s*)$/, (_, beforeSpaces, afterSpaces) => {
    return `${beforeSpaces}${header}-${reset}${afterSpaces}`
  })

  // 7. Highlight unix domain socket path
  highlighted = highlighted.replace(/(\s+)(\/[^\s]+|@[^\s]+)/g, (_, beforeSpaces, path) => {
    return `${beforeSpaces}${cyan}${path}${reset}`
  })

  // 8. Highlight Flags field (content in square brackets)
  highlighted = highlighted.replace(/(\s+)\[([^\]]+)\]/g, (_, beforeSpaces, flags) => {
    return `${beforeSpaces}[${yellow}${flags}${reset}]`
  })

  return highlighted
}

// netstat command header highlighting (preserve original spacing)
const highlightNetstatHeaderPreserveSpacing = (line: string): string => {
  const { reset, header } = COLORS

  // Highlight table header fields, use unified cyan color scheme
  let highlighted = line

  // Highlight each table header field, use unified cyan color scheme
  highlighted = highlighted.replace(
    /(Proto|Recv-Q|Send-Q|Local Address|Foreign Address|State|PID\/Program name|RefCnt|Flags|Type|I-Node|Path)/g,
    (match) => {
      return `${header}${match}${reset}`
    }
  )

  return highlighted
}

// netstat unix domain socket header highlighting (preserve original spacing)
const highlightNetstatUnixHeaderPreserveSpacing = (line: string): string => {
  const { reset, header } = COLORS

  // Check if it is a unix domain socket header format (4 fields)
  if (
    line.includes('Proto') &&
    line.includes('RefCnt') &&
    line.includes('Flags') &&
    line.includes('Type') &&
    line.includes('State') &&
    line.includes('I-Node') &&
    line.includes('Path')
  ) {
    // Define fixed column width (consistent with data row)
    const columnWidths = {
      proto: 6,
      refcnt: 7,
      flags: 10,
      type: 11,
      state: 12,
      inode: 8,
      path: 0
    }

    // Format each field, use fixed width
    const formatField = (text: string, width: number, color: string) => {
      const padded = text.padEnd(width)
      return `${color}${padded}${reset}`
    }

    // Rebuild header, use fixed width alignment
    return [
      formatField('Proto', columnWidths.proto, header),
      formatField('RefCnt', columnWidths.refcnt, header),
      formatField('Flags', columnWidths.flags, header),
      formatField('Type', columnWidths.type, header),
      formatField('State', columnWidths.state, header),
      formatField('I-Node', columnWidths.inode, header),
      `${header}Path${reset}`
    ].join('')
  }

  // If format does not match, revert to original line
  return line
}

// netstat unix domain socket output highlighting (preserve original spacing)
const highlightNetstatUnixOutputPreserveSpacing = (line: string): string => {
  const { reset, success, number, cyan, yellow, magenta } = COLORS

  // Use more precise parsing method to process unix domain socket
  if (line.startsWith('unix ')) {
    // Match Flags field (content in square brackets)
    const flagsMatch = line.match(/^unix\s+(\d+)\s+(\[[^\]]*\])/)
    if (flagsMatch) {
      const [, refcnt, flags] = flagsMatch
      const remaining = line.substring(flagsMatch[0].length).trim()

      // Split remaining part
      const parts = remaining.split(/\s+/)

      let type = ''
      let state = ''
      let inode = ''
      let path = ''

      if (parts.length >= 1) {
        type = parts[0] || ''
      }
      if (parts.length >= 2) {
        // Check if second field is a number (I-Node) or state
        const secondField = parts[1]
        if (/^\d+$/.test(secondField)) {
          // Second field is a number, means State field is empty
          inode = secondField
          path = parts.slice(2).join(' ')
        } else {
          // Second field is state
          state = secondField
          if (parts.length >= 3) {
            inode = parts[2] || ''
            path = parts.slice(3).join(' ')
          }
        }
      }

      // Define fixed column width (based on real terminal output)
      const columnWidths = {
        proto: 6,
        refcnt: 7,
        flags: 10,
        type: 11,
        state: 12,
        inode: 8,
        path: 0
      }

      const formatField = (text: string, width: number, color: string) => {
        const padded = text.padEnd(width)
        return `${color}${padded}${reset}`
      }

      return [
        formatField('unix', columnWidths.proto, success),
        formatField(refcnt, columnWidths.refcnt, number),
        formatField(flags, columnWidths.flags, yellow),
        formatField(type, columnWidths.type, cyan),
        formatField(state, columnWidths.state, magenta),
        formatField(inode, columnWidths.inode, number),
        `${cyan}${path}${reset}`
      ].join('')
    }
  }

  // If none of the regular expressions match, try using simple field splitting as a fallback
  if (line.startsWith('unix ')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length >= 5) {
      const [proto, refcnt, flags, type, ...rest] = parts

      // Try to parse remaining fields
      let state = ''
      let inode = ''
      let path = ''

      if (rest.length >= 2) {
        state = rest[0] || ''
        inode = rest[1] || ''
        path = rest.slice(2).join(' ') || ''
      } else if (rest.length === 1) {
        inode = rest[0] || ''
      }

      // Define fixed column width (consistent with header)
      const columnWidths = {
        proto: 6,
        refcnt: 7,
        flags: 10,
        type: 11,
        state: 12,
        inode: 8,
        path: 0
      }

      const formatField = (text: string, width: number, color: string) => {
        const padded = text.padEnd(width)
        return `${color}${padded}${reset}`
      }

      return [
        formatField(proto, columnWidths.proto, success),
        formatField(refcnt, columnWidths.refcnt, number),
        formatField(flags, columnWidths.flags, yellow),
        formatField(type, columnWidths.type, cyan),
        formatField(state, columnWidths.state, magenta),
        formatField(inode, columnWidths.inode, number),
        `${cyan}${path}${reset}`
      ].join('')
    }
  }

  return line
}

// git command output highlighting
const highlightGitOutput = (line: string): string => {
  const { reset, header, success, warning, error, info, key, value } = COLORS
  let highlighted = line

  // Highlight git status header line
  if (REGEX_PATTERNS.gitStatus.test(line)) {
    highlighted = highlighted.replace(REGEX_PATTERNS.gitStatus, (match) => {
      return `${header}${match}${reset}`
    })
  }

  // Highlight file change status (modified:, added:, deleted:, etc.)
  if (REGEX_PATTERNS.gitFileChange.test(line)) {
    highlighted = highlighted.replace(/(modified:|added:|deleted:|renamed:|new file:|modified file:|deleted file:|renamed file:)/g, (match) => {
      let color = info
      if (match.includes('added') || match.includes('new file')) {
        color = success
      } else if (match.includes('modified')) {
        color = warning
      } else if (match.includes('deleted')) {
        color = error
      } else if (match.includes('renamed')) {
        color = key
      }
      return `${color}${match}${reset}`
    })
  }

  // Highlight branch name
  highlighted = highlighted.replace(REGEX_PATTERNS.branchName, (match) => {
    return `${success}${match}${reset}`
  })

  // Highlight commit hash
  highlighted = highlighted.replace(REGEX_PATTERNS.commitHash, (match) => {
    return `${key}${match}${reset}`
  })

  // Highlight file status (status words in text)
  highlighted = highlighted.replace(REGEX_PATTERNS.fileStatus, (match) => {
    let color = info
    if (match.includes('added') || match.includes('new')) {
      color = success
    } else if (match.includes('modified')) {
      color = warning
    } else if (match.includes('deleted')) {
      color = error
    } else if (match.includes('renamed')) {
      color = key
    }
    return `${color}${match}${reset}`
  })

  // Highlight git command
  highlighted = highlighted.replace(REGEX_PATTERNS.gitCommand, (match) => {
    return `${info}${match}${reset}`
  })

  // Highlight file name (file name after change status)
  highlighted = highlighted.replace(
    /(modified:|added:|deleted:|renamed:|new file:|modified file:|deleted file:|renamed file:)\s+(.+)$/g,
    (match, _, filename) => {
      return `${match.replace(filename, `${value}${filename}${reset}`)}`
    }
  )

  return highlighted
}

// docker command output highlighting (preserve original spacing)
const highlightDockerOutputPreserveSpacing = (line: string): string => {
  const reset = '\x1b[0m'

  // Check if it is a header line
  if (line.includes('CONTAINER ID') && line.includes('IMAGE') && line.includes('COMMAND')) {
    // Process header line - use unified header color
    const { reset, header } = COLORS
    let highlighted = line

    // Highlight each table header field
    highlighted = highlighted.replace(/\b(CONTAINER ID|IMAGE|COMMAND|CREATED|STATUS|PORTS|NAMES)\b/g, (match) => {
      return `${header}${match}${reset}`
    })
    return highlighted
  }

  // Process data row
  let highlighted = line

  // Match CONTAINER ID field (first field, 12-bit hexadecimal)
  highlighted = highlighted.replace(/^([a-f0-9]{12})(\s+)/, (_, containerId, afterSpaces) => {
    const containerIdColor = '\x1b[33m' // CONTAINER ID - yellow
    return `${containerIdColor}${containerId}${reset}${afterSpaces}`
  })

  // Match IMAGE field (second field)
  highlighted = highlighted.replace(/(\s+)([^\s]+)(\s+)/, (_, beforeSpaces, image, afterSpaces) => {
    const imageColor = '\x1b[32m'
    return `${beforeSpaces}${imageColor}${image}${reset}${afterSpaces}`
  })

  // Match COMMAND field (third field, surrounded by quotes)
  highlighted = highlighted.replace(/(\s+)(".*?")(\s+)/, (_, beforeSpaces, command, afterSpaces) => {
    const commandColor = '\x1b[96m'
    return `${beforeSpaces}${commandColor}${command}${reset}${afterSpaces}`
  })

  // Match CREATED field (fourth field)
  highlighted = highlighted.replace(/(\s+)([^\s]+(?:\s+[^\s]+)*)(\s+)/, (_, beforeSpaces, created, afterSpaces) => {
    const createdColor = '\x1b[35m'
    return `${beforeSpaces}${createdColor}${created}${reset}${afterSpaces}`
  })

  // Match STATUS field (fifth field)
  highlighted = highlighted.replace(/(\s+)([^\s]+(?:\s+[^\s]+)*)(\s+)/, (_, beforeSpaces, status, afterSpaces) => {
    let statusColor = '\x1b[35m'
    if (status.includes('running')) {
      statusColor = '\x1b[32m'
    } else if (status.includes('exited')) {
      statusColor = '\x1b[31m'
    } else if (status.includes('created')) {
      statusColor = '\x1b[33m'
    } else if (status.includes('restarting')) {
      statusColor = '\x1b[96m'
    }
    return `${beforeSpaces}${statusColor}${status}${reset}${afterSpaces}`
  })

  // Match PORTS field (sixth field)
  highlighted = highlighted.replace(/(\s+)([^\s]+(?:\s+[^\s]+)*)(\s+)/, (_, beforeSpaces, ports, afterSpaces) => {
    const portsColor = '\x1b[34m'
    return `${beforeSpaces}${portsColor}${ports}${reset}${afterSpaces}`
  })

  // Match NAMES field (last field)
  highlighted = highlighted.replace(/(\s+)(.+)$/, (_, beforeSpaces, names) => {
    const namesColor = '\x1b[37m'
    return `${beforeSpaces}${namesColor}${names}${reset}`
  })

  return highlighted
}

// docker command output highlighting
const highlightDockerOutput = (line: string): string => {
  const reset = '\x1b[0m'
  let highlighted = line

  // Highlight container ID
  highlighted = highlighted.replace(REGEX_PATTERNS.containerId, `\x1b[33m$1${reset}`)

  // Highlight image name
  highlighted = highlighted.replace(REGEX_PATTERNS.imageName, `\x1b[32m$1${reset}`)

  // Highlight status
  highlighted = highlighted.replace(REGEX_PATTERNS.containerStatus, `\x1b[35m$1${reset}`)

  // Highlight docker command
  highlighted = highlighted.replace(REGEX_PATTERNS.dockerCommand, `\x1b[96m$1${reset}`)

  return highlighted
}

// Highlight error information
const highlightErrorOutput = (line: string): string => {
  const reset = '\x1b[0m'
  return `\x1b[91m${line}${reset}`
}

// Highlight success information
const highlightSuccessOutput = (line: string): string => {
  const reset = '\x1b[0m'
  return `\x1b[92m${line}${reset}`
}

// npm/yarn command output highlighting
const highlightNpmOutput = (line: string): string => {
  const reset = '\x1b[0m'
  let highlighted = line

  // Highlight package name
  highlighted = highlighted.replace(REGEX_PATTERNS.packageName, `\x1b[32m$1${reset}`)

  // Highlight version number
  highlighted = highlighted.replace(REGEX_PATTERNS.version, `\x1b[33m$1${reset}`)

  // Highlight status
  highlighted = highlighted.replace(REGEX_PATTERNS.npmStatus, `\x1b[35m$1${reset}`)

  // Highlight command
  highlighted = highlighted.replace(REGEX_PATTERNS.npmCommand, `\x1b[96m$1${reset}`)

  // Highlight warning and error
  highlighted = highlighted.replace(REGEX_PATTERNS.npmWarn, `\x1b[91m$1${reset}`)

  return highlighted
}

// curl/wget command output highlighting
const highlightHttpOutput = (line: string): string => {
  const { reset, white, header, value, key, number, boolean, structure, command, method, url } = COLORS
  let highlighted = line

  // First clean up possible ANSI escape sequences
  highlighted = highlighted.replace(/\x1b\[[0-9;]*m/g, '')

  // Highlight HTTP status code (including full status line)
  if (highlighted.match(/^HTTP\/\d\.\d\s+\d+/)) {
    highlighted = highlighted.replace(/HTTP\/\d\.\d\s+(\d+)\s+([^\r\n]+)/, (_, statusCode, statusText) => {
      const code = parseInt(statusCode)
      let statusColor = COLORS.success

      if (code >= 200 && code < 300) {
        statusColor = COLORS.success
      } else if (code >= 300 && code < 400) {
        statusColor = COLORS.warning
      } else if (code >= 400 && code < 500) {
        statusColor = COLORS.error
      } else if (code >= 500) {
        statusColor = COLORS.magenta
      }

      return `${white}HTTP/1.1${reset} ${statusColor}${statusCode}${reset} ${white}${statusText}${reset}`
    })
  }

  // Highlight HTTP header
  if (highlighted.match(/^[A-Za-z-]+:\s*.+$/)) {
    highlighted = highlighted.replace(/^([A-Za-z-]+):\s*(.+)$/, (_, headerName, headerValue) => {
      return `${header}${headerName}${reset}: ${white}${headerValue}${reset}`
    })
  }

  // Highlight JSON content
  if (highlighted.match(/^\s*[{}[\]]/) || highlighted.match(/^\s*"[^"]+"\s*:/) || highlighted.match(/^\s*"[^"]+"\s*,?\s*$/)) {
    // Highlight JSON curly braces and square brackets
    highlighted = highlighted.replace(/[{}[\]]/g, `${structure}$&${reset}`)

    // Highlight JSON key
    highlighted = highlighted.replace(/"([^"]+)":/g, `"${key}$1${reset}":`)

    // Highlight JSON string value
    highlighted = highlighted.replace(/:\s*"([^"]*)"/g, `: "${value}$1${reset}"`)

    // Highlight JSON number value
    highlighted = highlighted.replace(/:\s*(\d+)/g, `: ${number}$1${reset}`)

    // Highlight JSON boolean value
    highlighted = highlighted.replace(/:\s*(true|false)/g, `: ${boolean}$1${reset}`)
  }

  // Highlight curl command
  if (highlighted.match(/^curl\s+/)) {
    // Highlight command name
    highlighted = highlighted.replace(/\b(curl|wget|http)\b/g, `${command}$1${reset}`)

    // Highlight HTTP method
    highlighted = highlighted.replace(/\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/g, `${method}$1${reset}`)

    // Highlight URL
    highlighted = highlighted.replace(/(https?:\/\/[^\s]+)/g, `${url}$1${reset}`)
  }

  return highlighted
}

// iptables command output highlighting - keep alignment version
const highlightIptablesOutput = (line: string): string => {
  const { reset, header, success, error, info, number, cyan, white } = COLORS
  let highlighted = line

  // First clean up possible ANSI escape sequences
  highlighted = highlighted.replace(/\x1b\[[0-9;]*m/g, '')

  // 1. Highlight Chain name - use simpler matching
  if (highlighted.match(/^Chain\s+([\w-]+)/)) {
    highlighted = highlighted.replace(/^Chain\s+([\w-]+)/, (_, chainName) => {
      return `Chain ${cyan}${chainName}${reset}`
    })
  }

  // 2. Highlight policy information
  if (highlighted.match(/\(policy\s+(\w+)/)) {
    highlighted = highlighted.replace(/\(policy\s+(\w+)/, (_, policy) => {
      let policyColor = white
      if (policy === 'ACCEPT') {
        policyColor = success
      } else if (policy === 'DROP') {
        policyColor = error
      }
      return `(policy ${policyColor}${policy}${reset}`
    })
  }

  // 3. Highlight reference count
  if (highlighted.match(/\((\d+)\s+references?\)/)) {
    highlighted = highlighted.replace(/\((\d+)\s+references?\)/, (_, refCount) => {
      return `(${number}${refCount}${reset} references)`
    })
  }

  // 4. Highlight table header row
  if (highlighted.match(/^pkts\s+bytes\s+target\s+prot\s+opt\s+in\s+out\s+source\s+destination/)) {
    highlighted = highlighted.replace(/(pkts|bytes|target|prot|opt|in|out|source|destination)/g, (match) => {
      return `${header}${match}${reset}`
    })
  }

  // 5. Highlight rule row - preserve original space alignment, only replace specific fields
  if (highlighted.match(/^\s*\d+\s+\d+[KM]?\s+\w+/)) {
    // Packet count - green if has traffic, blue if no traffic (fix first packet count)
    highlighted = highlighted.replace(/^(\s*)(\d+)(\s+)/, (_, spaces, pkts, afterSpaces) => {
      const pktsColor = parseInt(pkts) > 0 ? success : number
      return `${spaces}${pktsColor}${pkts}${reset}${afterSpaces}`
    })

    // Byte count - green if has traffic, blue if no traffic
    highlighted = highlighted.replace(/(\s+)(\d+[KM]?)(\s+)/, (_, spaces, bytes, afterSpaces) => {
      const bytesColor = parseInt(bytes.replace(/[KM]/, '')) > 0 ? success : number
      return `${spaces}${bytesColor}${bytes}${reset}${afterSpaces}`
    })

    // Target - preserve space alignment, include more target types
    highlighted = highlighted.replace(
      /(\s+)(ACCEPT|DROP|REJECT|RETURN|DOCKER-USER|DOCKER-ISOLATION|DOCKER|YJ-FIREWALL-INPUT)(\s+)/g,
      (_, spaces, target, afterSpaces) => {
        let targetColor = white
        if (target === 'ACCEPT') {
          targetColor = success
        } else if (target === 'DROP' || target === 'REJECT') {
          targetColor = error
        } else if (target.includes('DOCKER') || target.includes('FIREWALL')) {
          targetColor = cyan
        } else if (target === 'RETURN') {
          targetColor = info
        }
        return `${spaces}${targetColor}${target}${reset}${afterSpaces}`
      }
    )

    // Protocol - preserve space alignment
    highlighted = highlighted.replace(/(\s+)(all|tcp|udp|icmp)(\s+)/g, (_, spaces, prot, afterSpaces) => {
      return `${spaces}${info}${prot}${reset}${afterSpaces}`
    })

    // Interface - preserve space alignment
    highlighted = highlighted.replace(/(\s+)(\*|docker0|br-\w+|eth\d+|lo|wlan\d+)(\s+)/g, (_, spaces, iface, afterSpaces) => {
      return `${spaces}${cyan}${iface}${reset}${afterSpaces}`
    })

    // Negated interface - preserve space alignment
    highlighted = highlighted.replace(/(\s+)(!)(\w+)(\s+)/g, (_, spaces, neg, iface, afterSpaces) => {
      return `${spaces}${error}${neg}${reset}${cyan}${iface}${reset}${afterSpaces}`
    })

    // IP address - preserve space alignment
    highlighted = highlighted.replace(/(\s+)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\/\d+)?)(\s+)/g, (_, spaces, ip, afterSpaces) => {
      return `${spaces}${white}${ip}${reset}${afterSpaces}`
    })
  }

  return highlighted
}

// free command output highlight
const highlightFreeOutput = (line: string): string => {
  const { reset, header, success, warning, info, number, white } = COLORS
  let highlighted = line

  // First clean up possible ANSI escape sequences
  highlighted = highlighted.replace(/\x1b\[[0-9;]*m/g, '')

  // 1. Highlight table header row, use fixed width alignment
  if (highlighted.match(/^\s*total\s+used\s+free\s+shared\s+buff\/cache\s+available/)) {
    // Define table header fields
    const headers = ['total', 'used', 'free', 'shared', 'buff/cache', 'available']

    // Define fixed column widths (aligned with data row label column)
    const columnWidths = {
      label: 6, // Width of Mem: or Swap:
      total: 8, // total
      used: 8, // used
      free: 8, // free
      shared: 8, // shared
      buffCache: 10, // buff/cache
      available: 10 // available
    }

    // Format table header: first reserve space for label column, then format each column
    const labelSpace = simpleFormatField('', columnWidths.label, header)
    const formattedHeaders = headers.map((headerText, index) => {
      if (index === 0) {
        return simpleFormatField(headerText, columnWidths.total, header)
      } else if (index === 1) {
        return simpleFormatField(headerText, columnWidths.used, header)
      } else if (index === 2) {
        return simpleFormatField(headerText, columnWidths.free, header)
      } else if (index === 3) {
        return simpleFormatField(headerText, columnWidths.shared, header)
      } else if (index === 4) {
        return simpleFormatField(headerText, columnWidths.buffCache, header)
      } else if (index === 5) {
        return simpleFormatField(headerText, columnWidths.available, header)
      }
      return `${header}${headerText}${reset}`
    })

    return `${labelSpace}${formattedHeaders.join('')}`
  }

  // 2. Highlight Mem: and Swap: rows, use fixed width alignment
  if (highlighted.match(/^(Mem|Swap):/)) {
    // Parse values and highlight
    const parts = highlighted.trim().split(/\s+/)
    if (parts.length >= 4) {
      const label = parts[0] // Mem: or Swap:
      const values = parts.slice(1) // All values

      // Define fixed column widths (consistent with table header)
      const columnWidths = {
        label: 6, // Mem: or Swap:
        total: 8, // total
        used: 8, // used
        free: 8, // free
        shared: 8, // shared
        buffCache: 10, // buff/cache
        available: 10 // available
      }

      // Highlight label
      const coloredLabel = simpleFormatField(label, columnWidths.label, header)

      // Assign color and format for each value, use corresponding column width
      const coloredValues = values.map((value, index) => {
        let color = number // Default blue
        let width = columnWidths.total // Default width

        // Determine column width based on position
        if (index === 0) width = columnWidths.total
        else if (index === 1) width = columnWidths.used
        else if (index === 2) width = columnWidths.free
        else if (index === 3) width = columnWidths.shared
        else if (index === 4) width = columnWidths.buffCache
        else if (index === 5) width = columnWidths.available

        // Assign color based on value size
        const numericValue = parseFloat(value.replace(/[^\d.]/g, ''))
        const unit = value.replace(/[\d.]/g, '')

        if (unit.includes('Gi') && numericValue > 0) {
          color = success // Green - has memory
        } else if (unit.includes('Mi') && numericValue > 100) {
          color = warning // Yellow - medium usage
        } else if (unit.includes('Mi') && numericValue > 0) {
          color = info // Blue - low usage
        } else if (numericValue === 0) {
          color = white // White - zero value
        } else {
          color = number // Default blue
        }

        return simpleFormatField(value, width, color)
      })

      // Recombine row
      return `${coloredLabel}${coloredValues.join('')}`
    }
  }

  return highlighted
}

// systemctl command output highlight
const highlightSystemctlOutput = (line: string): string => {
  // 1. header：UNIT LOAD ACTIVE SUB DESCRIPTION
  if (REGEX_PATTERNS.systemctlHeader.test(line) || (line.includes('UNIT') && line.includes('LOAD') && line.includes('ACTIVE'))) {
    return highlightSystemctlTableHeader(line)
  }

  // 2. data
  if (
    REGEX_PATTERNS.systemctlService.test(line) ||
    REGEX_PATTERNS.systemctlUnit.test(line) ||
    (line.includes('.service') && line.includes('loaded') && line.includes('active'))
  ) {
    return highlightSystemctlTableData(line)
  }

  return line
}

// systemctl header
const highlightSystemctlTableHeader = (line: string): string => {
  const { reset, header } = COLORS

  return `${header}${line}${reset}`
}

// systemctl
const highlightSystemctlTableData = (line: string): string => {
  const { reset, success, error, warning, info, cyan } = COLORS

  let highlighted = line

  // .service
  highlighted = highlighted.replace(/([\w\-@.]+\.service)/g, `${cyan}$1${reset}`)

  // LOAD
  highlighted = highlighted.replace(/\bloaded\b/g, `${info}loaded${reset}`)
  highlighted = highlighted.replace(/\berror\b/g, `${error}error${reset}`)
  highlighted = highlighted.replace(/\bnot-found\b/g, `${error}not-found${reset}`)

  // ACTIVE
  highlighted = highlighted.replace(/\bactive\b/g, `${success}active${reset}`)
  highlighted = highlighted.replace(/\binactive\b/g, `${warning}inactive${reset}`)
  highlighted = highlighted.replace(/\bfailed\b/g, `${error}failed${reset}`)

  // SUB
  highlighted = highlighted.replace(/\brunning\b/g, `${success}running${reset}`)
  highlighted = highlighted.replace(/\bdead\b/g, `${warning}dead${reset}`)
  highlighted = highlighted.replace(/\bexited\b/g, `${warning}exited${reset}`)

  return highlighted
}

// df command color constants - extract to outside function to avoid repeated creation
const DF_COLORS = {
  reset: '\x1b[0m',
  filesystem: '\x1b[34m', // Filesystem - blue
  size: '\x1b[33m', // Size - yellow
  used: '\x1b[31m', // Used - red
  avail: '\x1b[32m', // Available - green
  percent: '\x1b[35m', // Percentage - magenta
  mounted: '\x1b[96m', // Mount point - cyan (use unified cyan)
  header: '\x1b[96m' // Table header - cyan (use unified cyan)
}

// df command output highlight (fixed width column alignment)
const highlightDfOutputPreserveSpacing = (line: string): string => {
  // Use split instead of complex regex for better performance
  const parts = line.split(/\s+/)

  // Check if it's df format (at least 6 fields)
  if (parts.length >= 6) {
    const [filesystem, size, used, avail, usePercent, ...mountedParts] = parts
    const mounted = mountedParts.join(' ') // Handle mount point that may contain spaces

    // Define fixed column widths (based on typical df -h output)
    const columnWidths = {
      filesystem: 12, // Filesystem column
      size: 8, // Size column
      used: 8, // Used column
      avail: 8, // Available column
      percent: 6, // Usage percentage column
      mounted: 0 // Mount point column (no width limit)
    }

    // Build fixed width row, use simple formatting
    return [
      simpleFormatField(filesystem, columnWidths.filesystem, DF_COLORS.filesystem),
      simpleFormatField(size, columnWidths.size, DF_COLORS.size),
      simpleFormatField(used, columnWidths.used, DF_COLORS.used),
      simpleFormatField(avail, columnWidths.avail, DF_COLORS.avail),
      simpleFormatField(usePercent, columnWidths.percent, DF_COLORS.percent),
      `${DF_COLORS.mounted}${mounted}${DF_COLORS.reset}`
    ].join('')
  }

  // If format doesn't match, fall back to original line
  return line
}

// df command table header highlight (fixed width column alignment)
const highlightDfHeaderPreserveSpacing = (line: string): string => {
  // Use split instead of complex regex for better performance
  const parts = line.split(/\s+/)

  // Check if it's df table header format (at least 6 fields)
  if (parts.length >= 6) {
    const [filesystem, size, used, avail, usePercent, ...mountedParts] = parts
    const mounted = mountedParts.join(' ') // Handle mount point that may contain spaces

    // Define fixed column widths (consistent with data row)
    const columnWidths = {
      filesystem: 12, // Filesystem column
      size: 8, // Size column
      used: 8, // Used column
      avail: 8, // Available column
      percent: 6, // Usage percentage column
      mounted: 0 // Mount point column (no width limit)
    }

    // Build fixed width table header, use simple formatting
    return [
      simpleFormatField(filesystem, columnWidths.filesystem, DF_COLORS.header),
      simpleFormatField(size, columnWidths.size, DF_COLORS.header),
      simpleFormatField(used, columnWidths.used, DF_COLORS.header),
      simpleFormatField(avail, columnWidths.avail, DF_COLORS.header),
      simpleFormatField(usePercent, columnWidths.percent, DF_COLORS.header),
      `${DF_COLORS.header}${mounted}${DF_COLORS.reset}`
    ].join('')
  }

  // If format doesn't match, fall back to original line
  return line
}

// top/htop command system info highlight
const highlightTopSystemInfo = (line: string): string => {
  const { reset, header, success, warning, error, info } = COLORS
  let highlighted = line

  // Highlight numbers (load, memory, CPU, etc.)
  highlighted = highlighted.replace(/(\d+\.\d+)/g, (match) => {
    const num = parseFloat(match)
    let color = info // Default blue
    if (num > 80) {
      color = error // Red - high load
    } else if (num > 50) {
      color = warning // Yellow - medium load
    } else if (num > 0) {
      color = success // Green - low load
    }
    return `${color}${match}${reset}`
  })

  // Highlight percentage
  highlighted = highlighted.replace(/(\d+\.\d+%)/g, (match) => {
    const num = parseFloat(match)
    let color = info // Default blue
    if (num > 80) {
      color = error // Red - high usage
    } else if (num > 50) {
      color = warning // Yellow - medium usage
    } else {
      color = success // Green - low usage
    }
    return `${color}${match}${reset}`
  })

  // Highlight keywords
  highlighted = highlighted.replace(/(Tasks:|%Cpu\(s\):|MiB\s+Mem\s*:|MiB\s+Swap:|total|free|used|buff\/cache|avail)/g, (match) => {
    return `${header}${match}${reset}`
  })

  // Highlight status words
  highlighted = highlighted.replace(/\b(running|sleeping|stopped|zombie|us|sy|ni|id|wa|hi|si|st)\b/g, (match) => {
    let color = info
    if (match === 'running') {
      color = success
    } else if (match === 'zombie') {
      color = error
    } else if (match === 'stopped') {
      color = warning
    }
    return `${color}${match}${reset}`
  })

  // Highlight time info (place at end to ensure not overridden by other highlights)
  // Use more precise matching to avoid duplicate highlighting

  // 1. First match complete time format: 13:19:49
  highlighted = highlighted.replace(/(\d{1,2}:\d{2}:\d{2})/g, (match) => {
    return `${COLORS.cyan}${match}${reset}`
  })

  return highlighted
}

// top/htop command table header highlight (preserve original format, add color to each field)
const highlightTopHeaderPreserveSpacing = (line: string): string => {
  const reset = '\x1b[0m'
  const headerColor = '\x1b[1;36m' // Bright cyan, dedicated header color

  // Use simpler method: directly replace each field name
  let highlighted = line

  // Replace each field in order, preserve original spacing
  highlighted = highlighted.replace(/\bPID\b/g, `${headerColor}PID${reset}`)
  highlighted = highlighted.replace(/\bUSER\b/g, `${headerColor}USER${reset}`)
  highlighted = highlighted.replace(/\bPR\b/g, `${headerColor}PR${reset}`)
  highlighted = highlighted.replace(/\bNI\b/g, `${headerColor}NI${reset}`)
  highlighted = highlighted.replace(/\bVIRT\b/g, `${headerColor}VIRT${reset}`)
  highlighted = highlighted.replace(/\bRES\b/g, `${headerColor}RES${reset}`)
  highlighted = highlighted.replace(/\bSHR\b/g, `${headerColor}SHR${reset}`)
  highlighted = highlighted.replace(/\bS\b/g, `${headerColor}S${reset}`)
  highlighted = highlighted.replace(/%CPU/g, `${headerColor}%CPU${reset}`)
  highlighted = highlighted.replace(/%MEM/g, `${headerColor}%MEM${reset}`)
  highlighted = highlighted.replace(/TIME\+/g, `${headerColor}TIME+${reset}`)
  highlighted = highlighted.replace(/\bCOMMAND\b/g, `${headerColor}COMMAND${reset}`)

  return highlighted
}

// top/htop command output highlight (alternative format: USER PR PID VIRT RES SHR S %CPU %MEM TIME COMMAND)
const highlightTopOutputAlternativeFormat = (line: string): string => {
  const reset = '\x1b[0m'

  // Use split to separate fields, avoid complex regex matching
  const parts = line.trim().split(/\s+/)

  // Check if it's top data row format (at least 11 fields)
  if (parts.length >= 11) {
    const [user, pr, pid, virt, res, shr, s, cpu, mem, time, ...commandParts] = parts
    const command = commandParts.join(' ')

    // Define fixed column widths (consistent with main function to ensure alignment)
    const columnWidths = {
      user: 10, // USER column - consistent with main function
      pr: 6, // PR column - consistent with main function
      pid: 8, // PID column - consistent with main function
      virt: 10, // VIRT column - consistent with main function
      res: 8, // RES column - consistent with main function
      shr: 8, // SHR column - consistent with main function
      s: 4, // S column - consistent with main function
      cpu: 7, // %CPU column - consistent with main function
      mem: 7, // %MEM column - consistent with main function
      time: 9, // TIME column - consistent with main function
      command: 0 // COMMAND column (no width limit)
    }

    // Define colors
    const userColor = '\x1b[31m' // USER - red
    const prColor = '\x1b[33m' // PR - yellow
    const pidColor = '\x1b[32m' // PID - green
    const memoryColor = '\x1b[96m' // Memory related - cyan
    const statusColor = '\x1b[33m' // Status - yellow
    const timeColor = '\x1b[96m' // Time - cyan
    const commandColor = '\x1b[34m' // Command - blue

    // Determine CPU and memory colors based on values
    const cpuPercent = parseFloat(cpu)
    let cpuColor = '\x1b[32m' // Default green
    if (cpuPercent > 80) {
      cpuColor = '\x1b[91m' // High usage - bright red
    } else if (cpuPercent > 50) {
      cpuColor = '\x1b[33m' // Medium usage - yellow
    }

    const memPercent = parseFloat(mem)
    let memColor = '\x1b[32m' // Default green
    if (memPercent > 80) {
      memColor = '\x1b[91m' // High usage - bright red
    } else if (memPercent > 50) {
      memColor = '\x1b[33m' // Medium usage - yellow
    }

    // Format each field, use fixed width
    const formatField = (text: string, width: number, color: string) => {
      const padded = text.padEnd(width)
      return `${color}${padded}${reset}`
    }

    // Rebuild row, use fixed width alignment
    return [
      formatField(user, columnWidths.user, userColor),
      formatField(pr, columnWidths.pr, prColor),
      formatField(pid, columnWidths.pid, pidColor),
      formatField(virt, columnWidths.virt, memoryColor),
      formatField(res, columnWidths.res, memoryColor),
      formatField(shr, columnWidths.shr, memoryColor),
      formatField(s, columnWidths.s, statusColor),
      formatField(cpu, columnWidths.cpu, cpuColor),
      formatField(mem, columnWidths.mem, memColor),
      formatField(time, columnWidths.time, timeColor),
      `${commandColor}${command}${reset}`
    ].join('')
  }

  // If format doesn't match, fall back to original line
  return line
}

// top/htop command output highlight (preserve original spaces)
const highlightTopOutputPreserveSpacing = (line: string): string => {
  const reset = '\x1b[0m'

  // Use regex to match each field, preserve original format and spacing
  let highlighted = line

  // Define colors
  const pidColor = '\x1b[32m' // PID - green
  const userColor = '\x1b[31m' // USER - red
  const memoryColor = '\x1b[96m' // Memory related - cyan
  const statusColor = '\x1b[33m' // Status - yellow
  const timeColor = '\x1b[96m' // Time - magenta
  const commandColor = '\x1b[34m' // Command - blue

  // Use regex to match and highlight each field, preserve original spacing
  // PID (starts with number, followed by space)
  highlighted = highlighted.replace(/^(\s*)(\d+)(\s+)/, `$1${pidColor}$2${reset}$3`)

  // USER (alphanumeric underscore, followed by space)
  highlighted = highlighted.replace(/^(\s*\d+\s+)([\w+-]+)(\s+)/, `$1${userColor}$2${reset}$3`)

  // PR (number, may have negative sign)
  highlighted = highlighted.replace(/^(\s*\d+\s+[\w+-]+\s+)([\d-]+)(\s+)/, `$1$2$3`)

  // NI (number, may have negative sign)
  highlighted = highlighted.replace(/^(\s*\d+\s+[\w+-]+\s+[\d-]+\s+)([\d-]+)(\s+)/, `$1$2$3`)

  // VIRT (number)
  highlighted = highlighted.replace(/^(\s*\d+\s+[\w+-]+\s+[\d-]+\s+[\d-]+\s+)(\d+)(\s+)/, `$1${memoryColor}$2${reset}$3`)

  // RES (number)
  highlighted = highlighted.replace(/^(\s*\d+\s+[\w+-]+\s+[\d-]+\s+[\d-]+\s+\d+\s+)(\d+)(\s+)/, `$1${memoryColor}$2${reset}$3`)

  // SHR (number)
  highlighted = highlighted.replace(/^(\s*\d+\s+[\w+-]+\s+[\d-]+\s+[\d-]+\s+\d+\s+\d+\s+)(\d+)(\s+)/, `$1${memoryColor}$2${reset}$3`)

  // S (status character)
  highlighted = highlighted.replace(/^(\s*\d+\s+[\w+-]+\s+[\d-]+\s+[\d-]+\s+\d+\s+\d+\s+\d+\s+)(\w)(\s+)/, `$1${statusColor}$2${reset}$3`)

  // %CPU (floating point number)
  highlighted = highlighted.replace(/^(\s*\d+\s+[\w+-]+\s+[\d-]+\s+[\d-]+\s+\d+\s+\d+\s+\d+\s+\w\s+)(\d+\.\d+)(\s+)/, (_, prefix, cpu, suffix) => {
    const cpuPercent = parseFloat(cpu)
    let cpuColor = '\x1b[32m' // Default green
    if (cpuPercent > 80) {
      cpuColor = '\x1b[91m' // High usage - bright red
    } else if (cpuPercent > 50) {
      cpuColor = '\x1b[33m' // Medium usage - yellow
    }
    return `${prefix}${cpuColor}${cpu}${reset}${suffix}`
  })

  // %MEM (floating point number)
  highlighted = highlighted.replace(
    /^(\s*\d+\s+[\w+-]+\s+[\d-]+\s+[\d-]+\s+\d+\s+\d+\s+\d+\s+\w\s+\d+\.\d+\s+)(\d+\.\d+)(\s+)/,
    (_, prefix, mem, suffix) => {
      const memPercent = parseFloat(mem)
      let memColor = '\x1b[32m' // Default green
      if (memPercent > 80) {
        memColor = '\x1b[91m' // High usage - bright red
      } else if (memPercent > 50) {
        memColor = '\x1b[33m' // Medium usage - yellow
      }
      return `${prefix}${memColor}${mem}${reset}${suffix}`
    }
  )

  // TIME+ (time format) - use simpler method to match time format
  // Match format: number:number.number (e.g., 0:59.03, 0:00.38, 0:00.00)
  highlighted = highlighted.replace(/(\d+:\d+\.\d+)/g, (match) => {
    // Check if in correct position (TIME+ column, 11th field)
    const parts = highlighted.split(/\s+/)
    const timeIndex = parts.findIndex((part) => part === match)
    if (timeIndex >= 10) {
      // TIME+ is the 11th field (index 10)
      return `${timeColor}${match}${reset}`
    }
    return match
  })

  // COMMAND (remaining part)
  highlighted = highlighted.replace(
    /^(\s*\d+\s+[\w+-]+\s+[\d-]+\s+[\d-]+\s+\d+\s+\d+\s+\d+\s+\w\s+\d+\.\d+\s+\d+\.\d+\s+\d+:\d+\.\d+\s+)(.+)$/,
    `$1${commandColor}$2${reset}`
  )

  return highlighted
}

// top/htop command output highlight

// tail/head command output highlight
const highlightTailOutput = (line: string): string => {
  const reset = '\x1b[0m'
  let highlighted = line

  // Highlight file name
  highlighted = highlighted.replace(REGEX_PATTERNS.tailFile, `==> \x1b[34m$1${reset} <==`)

  // Highlight line number
  highlighted = highlighted.replace(REGEX_PATTERNS.tailLine, `\x1b[33m$1${reset} `)

  return highlighted
}

// Simple ls output highlight
const highlightSimpleLsOutput = (line: string): string => {
  const parts = line.trim().split(/\s+/)
  const highlightedParts = parts.map((part) => {
    if (part.endsWith('/')) {
      return `\x1b[34m${part}\x1b[0m` // Directory - blue
    } else if (part.includes('.')) {
      // Set different colors based on file extension
      if (REGEX_PATTERNS.codeFiles.test(part)) {
        return `\x1b[96m${part}\x1b[0m` // Code file - cyan
      } else if (REGEX_PATTERNS.imageFiles.test(part)) {
        return `\x1b[35m${part}\x1b[0m` // Image file - magenta
      } else if (REGEX_PATTERNS.archiveFiles.test(part)) {
        return `\x1b[33m${part}\x1b[0m` // Archive file - yellow
      } else {
        return `\x1b[32m${part}\x1b[0m` // Other file - green
      }
    } else {
      return `\x1b[37m${part}\x1b[0m` // Other - white
    }
  })
  return highlightedParts.join(' ')
}

// Extract terminal output content
const extractTerminalOutput = (content: string): string => {
  if (!content || typeof content !== 'string') {
    return content
  }

  const patterns = [
    /Terminal output:\n```\n([\s\S]*?)\n```/,
    /```\n([\s\S]*?)\n```/,
    /```([\s\S]*?)```/,
    /# Executing result on .*?:Command executed.\nOutput:\n([\s\S]*?)(?:\n\[Exit Code:|$)/,
    /Active Internet connections[^\n]*\n([\s\S]*?)(?:\n\[Exit Code:|$)/,
    /^(.+)$/s
  ]

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i]
    const match = content.match(pattern)
    if (match && match[1]) {
      const extracted = match[1]
      const uniqueContent = extracted
      const highlighted = addTerminalSyntaxHighlighting(uniqueContent)
      return highlighted
    }
  }

  return addTerminalSyntaxHighlighting(content)
}

// Write content to terminal
const writeToTerminal = (content: string) => {
  if (!terminal) {
    return
  }

  const terminalContent = extractTerminalOutput(content)

  if (lastContent === terminalContent) {
    return
  }

  terminal.clear()
  terminal.reset()

  const cleanContent = terminalContent.replace(/\n+$/, '')

  // First calculate content line count and size
  const contentLines = cleanContent.split('\n').length
  const minRows = 1
  const actualRows = Math.max(minRows, contentLines)
  const rowsToShow = !isExpanded.value && isCollapsible.value ? 10 : actualRows
  const lines = cleanContent.split('\n')
  // Calculate actual display length after removing ANSI color codes (considering full-width characters like Chinese)
  const maxLineLength = Math.max(...lines.map((line) => getStringDisplayWidth(line.replace(/\x1b\[[0-9;]*m/g, ''))))
  const cols = maxLineLength

  // First adjust terminal size
  if (terminal) {
    terminal.resize(cols, rowsToShow)
  }

  terminal.write(cleanContent)
  // Hide cursor to avoid generating extra empty lines
  terminal.write('\x1b[?25l')

  // Immediately adjust height to ensure all content can be displayed
  nextTick(() => {
    // Force adjust height
    adjustTerminalHeight()

    // Delay adjustment again to ensure content is fully rendered
    setTimeout(() => {
      adjustTerminalHeight()
      // Force refresh terminal display
      if (terminal) {
        terminal.refresh(0, terminal.rows - 1)
      }
    }, 50)
  })

  lastContent = terminalContent
  // Correctly calculate line count: filter out empty lines
  const nonEmptyLines = lines.filter((line) => line.trim() !== '')
  outputLines.value = nonEmptyLines.length

  // Collapse by default if more than 10 lines, otherwise expand
  if (isCollapsible.value) {
    isExpanded.value = false
  } else {
    isExpanded.value = true
  }

  // Immediately adjust height after state change
  nextTick(() => {
    adjustTerminalHeight()
  })

  const adjustHeight = () => {
    const contentLines = cleanContent.split('\n').length
    const minRows = 1
    // Ensure enough rows to display all content
    const actualRows = Math.max(minRows, contentLines)
    const rowsToShow = !isExpanded.value && isCollapsible.value ? 10 : actualRows

    if (terminal) {
      const lines = cleanContent.split('\n')
      // Calculate actual display length after removing ANSI color codes (considering full-width characters like Chinese)
      const maxLineLength = Math.max(...lines.map((line) => getStringDisplayWidth(line.replace(/\x1b\[[0-9;]*m/g, ''))))
      const cols = maxLineLength

      terminal.resize(cols, rowsToShow)
    }

    if (terminalContainer.value) {
      // Wait one frame to ensure DOM update
      requestAnimationFrame(() => {
        const rowEl = terminalContainer.value?.querySelector('.xterm-rows > div') as HTMLElement | null
        if (!rowEl || !terminalContainer.value) return

        let rowHeight = rowEl.getBoundingClientRect().height
        rowHeight = Math.ceil(rowHeight)

        const styles = window.getComputedStyle(terminalContainer.value)
        const paddingTop = parseFloat(styles.paddingTop) || 0
        const paddingBottom = parseFloat(styles.paddingBottom) || 0

        // Directly calculate height based on line count to ensure all content can be displayed
        const newHeight = rowsToShow * rowHeight + paddingTop + paddingBottom + 20
        terminalContainer.value.style.height = `${newHeight}px`
      })
    }
  }

  // Call twice to ensure correct height calculation
  nextTick(() => {
    adjustHeight()
    adjustTerminalHeight()
    // Call again to handle possible delayed rendering
    setTimeout(() => {
      adjustHeight()
      adjustTerminalHeight()
    }, 100)
  })
}

// Copy output content
const copyOutput = () => {
  if (!terminal) return

  const selection = terminal.getSelection()
  const content =
    selection || Array.from({ length: terminal?.rows || 0 }, (_, i) => terminal?.buffer.active.getLine(i)?.translateToString() || '').join('\n')

  navigator.clipboard.writeText(content).then(() => {
    message.success(t('ai.copyToClipboard'))
  })
}

// Toggle expand/collapse
const toggleOutput = () => {
  if (!isCollapsible.value) {
    isExpanded.value = true
    return
  }
  isExpanded.value = !isExpanded.value
  nextTick(() => {
    adjustTerminalHeight()
  })
}

// Watch content changes
watch(
  () => props.content,
  (newContent) => {
    if (newContent && terminal) {
      writeToTerminal(newContent)
    }
  },
  { immediate: false }
)

// Watch window size changes
const handleResize = () => {
  if (isExpanded.value) {
    adjustTerminalHeight()
  }
}

onMounted(async () => {
  await initTerminal()
  if (props.content && terminal) {
    writeToTerminal(props.content)
    // Ensure correct height adjustment after initial render
    nextTick(() => {
      adjustTerminalHeight()
      // Delay adjustment again to ensure content is fully rendered
      setTimeout(() => {
        adjustTerminalHeight()
      }, 100)
    })
  }
  window.addEventListener('resize', handleResize)

  // Watch theme changes
  const themeObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        if (terminal) {
          terminal.options.theme = getThemeColors()
        }
      }
    })
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  })

  // Clean up observer when component unmounts
  onBeforeUnmount(() => {
    themeObserver.disconnect()
  })
})

onBeforeUnmount(() => {
  if (terminal) {
    terminal.dispose()
  }
  window.removeEventListener('resize', handleResize)
})

// Simple ls list (column aligned) highlight, preserve spaces
const highlightSimpleLsColumnsPreserveSpacing = (line: string): string => {
  const reset = '\x1b[0m'

  const colorToken = (token: string): string => {
    // Directory guess: no dot and is a normal word
    if (!token.includes('.')) {
      if (/^[A-Za-z0-9_-]+$/.test(token)) {
        return `\x1b[34m${token}${reset}` // Blue
      }
      return `\x1b[37m${token}${reset}`
    }

    // Specific types
    if (REGEX_PATTERNS.codeFiles.test(token)) return `\x1b[96m${token}${reset}`
    if (REGEX_PATTERNS.imageFiles.test(token)) return `\x1b[35m${token}${reset}`
    if (REGEX_PATTERNS.archiveFiles.test(token)) return `\x1b[33m${token}${reset}`
    return `\x1b[32m${token}${reset}` // Other file
  }

  // Color each non-whitespace segment, preserve whitespace as-is
  return line.replace(/([^\s]+)|(\s+)/g, (_, word, spaces) => {
    if (spaces) return spaces
    return colorToken(word)
  })
}
</script>

<style scoped>
/* Keep original styles */
.terminal-output-container {
  margin: 10px 0;
  border-radius: 6px;
  overflow-x: auto;
  overflow-y: visible;
  background-color: var(--command-output-bg);
  min-height: 40px;
  height: auto;
  width: 100%;
  max-width: 100%;
}

.terminal-output-header {
  position: relative;
  height: 18px;
  background: var(--bg-color-secondary);
  border-bottom: 1px solid var(--bg-color-quaternary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  font-size: 10px;
  color: #7e8ba3;
}

.output-title-section {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  flex: 1;
}

.output-title {
  font-weight: 500;
  color: #7e8ba3;
}

.output-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.output-lines {
  font-size: 10px;
  color: #7e8ba3;
}

.copy-button-header {
  color: var(--text-color);
  opacity: 0.6;
  transition: opacity 0.3s;
  padding: 0;
  height: 16px;
  width: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.copy-button-header:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
}

.tnoggle-butto {
  color: var(--text-color);
  opacity: 0.6;
  transition: opacity 0.3s;
  padding: 0;
  height: 16px;
  width: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
}

.terminal-output {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  background-color: var(--command-output-bg) !important;
  color: var(--text-color) !important;
  border-radius: 0 0 8px 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  border-top: none;
  overflow-x: hidden;
  overflow-y: visible;
  position: relative;
  width: 100%;
  max-width: 100%;
  height: auto;
  padding: 12px 0px 0px 12px;
  box-sizing: border-box;
  scrollbar-gutter: stable;
}

:deep(.xterm) {
  height: 100%;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  white-space: pre !important;
}

:deep(.xterm-viewport) {
  overflow: hidden !important;
  overflow-y: hidden !important;
  scrollbar-gutter: stable !important;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
  background-color: var(--bg-color-secondary) !important;
}

/* Hide vertical scrollbar */
:deep(.xterm-viewport::-webkit-scrollbar) {
  width: 0 !important;
  height: 0 !important;
}

:deep(.xterm-screen) {
  overflow-x: hidden !important;
  overflow-y: hidden !important;
  background-color: var(--bg-color-secondary) !important;
}

:deep(.xterm .xterm-cursor) {
  display: none !important;
}

:deep(.xterm .xterm-cursor-layer),
:deep(.xterm .xterm-cursor-blink),
:deep(.xterm .xterm-cursor-block),
:deep(.xterm .xterm-cursor-underline),
:deep(.xterm .xterm-cursor-bar) {
  display: none !important;
}

.copy-icon {
  width: 11px;
  height: 11px;
  vertical-align: middle;
  filter: invert(0.25);
}

::deep(.xterm-rows) {
  padding-bottom: 12px !important;
  overflow-x: auto !important;
  overflow-y: visible !important;
}
</style>
