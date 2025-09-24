<template>
  <div class="terminal-output-container">
    <div class="terminal-output-header">
      <span class="output-title">OUTPUT (xterm.js)</span>
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
        <a-button
          class="toggle-button"
          type="text"
          size="small"
          @click="toggleOutput"
        >
          <CaretDownOutlined v-if="isExpanded" />
          <CaretRightOutlined v-else />
        </a-button>
      </div>
    </div>
    <div
      v-show="isExpanded"
      ref="terminalContainer"
      class="terminal-output"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons-vue'
import copySvg from '@/assets/icons/copy.svg'
import { message } from 'ant-design-vue'
import i18n from '@/locales'
import 'xterm/css/xterm.css'

const { t } = i18n.global

const props = defineProps<{
  content: string
}>()

const terminalContainer = ref<HTMLElement | null>(null)
const isExpanded = ref(true)
const outputLines = ref(0)

let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let lastContent: string = ''

// 性能优化：预编译正则表达式
// 统一配色方案
const COLORS = {
  // 基础颜色
  reset: '\x1b[0m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // 主要颜色（亮色系，提高可读性）
  red: '\x1b[91m', // 错误、危险状态
  green: '\x1b[92m', // 成功、正常状态
  yellow: '\x1b[93m', // 警告、键名
  blue: '\x1b[94m', // 信息、数字
  magenta: '\x1b[95m', // 命令、特殊标识
  cyan: '\x1b[96m', // 头部、方法

  // 状态颜色
  success: '\x1b[92m', // 成功状态
  warning: '\x1b[93m', // 警告状态
  error: '\x1b[91m', // 错误状态
  info: '\x1b[94m', // 信息状态

  // 语义颜色
  command: '\x1b[95m', // 命令名称
  header: '\x1b[96m', // 表头、头部名称
  key: '\x1b[93m', // JSON键、配置项
  value: '\x1b[92m', // 字符串值
  number: '\x1b[94m', // 数字值
  boolean: '\x1b[95m', // 布尔值
  url: '\x1b[94m', // URL链接
  method: '\x1b[96m', // HTTP方法
  status: '\x1b[92m', // 状态信息
  structure: '\x1b[90m' // 结构符号
}

const REGEX_PATTERNS = {
  ls: /^([drwx-]+)\s+(\d+)\s+(\w+)\s+(\w+)\s+(\d+)\s+([A-Za-z]+\s+\d+\s+(?:\d{2}:\d{2}|\d{4}))\s+(.+)$/,
  ps: /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)/,
  psFlexible: /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)/,
  psStrict: /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)$/,
  psFixed: /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)/,
  psSimple: /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)/,
  psUltraSimple: /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)/,
  psHeader: /^\s*(UID|PID|PPID|C|STIME|TTY|TIME|CMD)\s+(\d+)\s+(\d+)\s+(\d+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)$/,
  psHeaderOnly: /^\s*(UID|PID|PPID|C|STIME|TTY|TIME|CMD)\s*$/,
  // 添加简化ps命令格式支持
  psSimpleHeader: /^\s*(PID|TTY|TIME|CMD)\s+(PID|TTY|TIME|CMD)\s+(PID|TTY|TIME|CMD)\s+(PID|TTY|TIME|CMD)\s*$/,
  psSimpleData: /^\s*(\d+)\s+([^\s]+)\s+(\d{2}:\d{2}:\d{2})\s+(.+)$/,
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
  codeFiles: /\.(js|ts|vue|py|java|cpp|c|h)$/,
  imageFiles: /\.(jpg|jpeg|png|gif|svg|ico)$/,
  archiveFiles: /\.(zip|tar|gz|rar|7z)$/,
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
  tailLine: /^\s*(\d+)\s+/gm
}

// 缓存高亮结果
const highlightCache = new Map<string, string>()
const CACHE_SIZE_LIMIT = 1000

// 清理缓存
const clearCache = () => {
  if (highlightCache.size > CACHE_SIZE_LIMIT) {
    const entries = Array.from(highlightCache.entries())
    const toDelete = entries.slice(0, Math.floor(CACHE_SIZE_LIMIT / 2))
    toDelete.forEach(([key]) => highlightCache.delete(key))
  }
}

// 根据内容动态调整终端高度（纵向自适应，无纵向滚动；横向不足时出现滚动条）
const adjustTerminalHeight = () => {
  if (!terminal) return

  // 获取实际有内容的行数与最长行长度
  let actualContentLines = 0
  let maxLineLength = 0
  for (let i = 0; i < terminal.buffer.active.length; i++) {
    const line = terminal.buffer.active.getLine(i)
    if (line) {
      const text = line.translateToString()
      if (text.trim()) actualContentLines = i + 1
      if (text.length > maxLineLength) maxLineLength = text.length
    }
  }

  const minRows = 2
  // 不限制最大行数，全部展示
  const actualRows = Math.max(minRows, actualContentLines)

  // 设置列数，确保不自动换行
  if (fitAddon) {
    // 先拟合一次，保证字符尺寸计算正确
    fitAddon.fit()
    // 使用一个很大的列数来避免自动换行，让内容保持在一行内
    const cols = Math.max(maxLineLength + 50, 120) // 给一些额外的空间
    terminal.resize(cols, actualRows)
  } else {
    // 使用一个很大的列数来避免自动换行
    const cols = Math.max(maxLineLength + 50, 120)
    terminal.resize(cols, actualRows)
  }

  // 调整容器高度，完全容纳所有行
  if (terminalContainer.value) {
    const rowEl = terminalContainer.value.querySelector('.xterm-rows > div') as HTMLElement | null
    let rowHeight = rowEl ? rowEl.getBoundingClientRect().height : 18
    rowHeight = Math.ceil(rowHeight)
    const styles = window.getComputedStyle(terminalContainer.value)
    const paddingTop = parseFloat(styles.paddingTop) || 0
    const paddingBottom = parseFloat(styles.paddingBottom) || 0
    const newHeight = actualRows * rowHeight + paddingTop + paddingBottom + 1
    terminalContainer.value.style.height = `${newHeight}px`
  }
}

// 初始化终端
const initTerminal = async () => {
  if (!terminalContainer.value) return

  // 创建终端实例
  terminal = new Terminal({
    cursorBlink: false,
    cursorStyle: 'block',
    scrollback: 1000,
    fontSize: 11, // 稍微减小字体大小
    fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: 'transparent', // 隐藏光标
      cursorAccent: 'transparent',
      black: '#000000',
      red: '#e06c75',
      green: '#98c379',
      yellow: '#e5c07b',
      blue: '#61afef',
      magenta: '#c678dd',
      cyan: '#56b6c2',
      white: '#abb2bf',
      brightBlack: '#5c6370',
      brightRed: '#ff7b86',
      brightGreen: '#b5e890',
      brightYellow: '#ffd68a',
      brightBlue: '#79c0ff',
      brightMagenta: '#d8a6ff',
      brightCyan: '#7ce8ff',
      brightWhite: '#ffffff'
    },
    allowTransparency: false,
    allowProposedApi: true,
    convertEol: true,
    disableStdin: true,
    rows: 30 // 设置最大高度为30行
    // 移除固定的cols设置，让xterm根据容器宽度自动调整
  })

  // 添加 fit addon
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  // 挂载终端
  terminal.open(terminalContainer.value)

  // 隐藏光标
  terminal.options.cursorBlink = false
  terminal.options.cursorStyle = 'block'

  // 调整大小
  nextTick(() => {
    fitAddon?.fit()
    // 根据内容动态调整终端高度
    adjustTerminalHeight()
  })
}

// 增强的终端输出语法高亮（带缓存优化）
const addTerminalSyntaxHighlighting = (content: string): string => {
  if (!content || typeof content !== 'string') {
    return content
  }

  // 检查缓存
  if (highlightCache.has(content)) {
    return highlightCache.get(content)!
  }

  // 首先处理已有的 ANSI 颜色代码
  let processedContent = processAnsiCodes(content)

  const lines = processedContent.split('\n')
  const highlightedLines = lines.map((line) => {
    // 跳过空行（但保留只包含空格的行的原始格式）
    if (line === '') return line

    // 0. 优先处理简化ps命令格式（PID TTY TIME CMD）
    if (line.trim() === 'PID TTY TIME CMD') {
      return highlightPsSimpleHeaderPreserveSpacing(line)
    }

    // 0.1 检测简化ps数据行（4个字段：数字 终端 时间 命令）
    const simpleParts = line.trim().split(/\s+/)
    if (
      simpleParts.length === 4 &&
      /^\d+$/.test(simpleParts[0]) &&
      /^\d{2}:\d{2}:\d{2}$/.test(simpleParts[2]) &&
      !line.includes('UID') &&
      !line.includes('PPID') &&
      !line.includes('USER')
    ) {
      return highlightPsSimpleOutputPreserveSpacing(line)
    }

    // 1. 处理 ls -la 命令表头
    if (line.match(/^total\s+\d+$/)) {
      return highlightLsHeaderPreserveSpacing(line)
    }

    // 1.1 处理 ls -la 格式的输出（保留原始空格）
    if (line.match(/^[drwx-]+\s+\d+\s+\w+\s+\w+\s+\d+\s+[A-Za-z]+\s+\d+\s+(?:\d{2}:\d{2}|\d{4})\s+.+$/)) {
      return highlightLsOutputPreserveSpacing(line)
    }

    // 1.1 处理 ls -la 格式的输出（正则匹配）
    const lsMatch = line.match(REGEX_PATTERNS.ls)
    if (lsMatch) {
      return highlightLsOutput(lsMatch)
    }

    // 2.1 处理 ps 命令表头（纯表头行）
    const psHeaderOnlyMatch = line.match(REGEX_PATTERNS.psHeaderOnly)
    if (psHeaderOnlyMatch) {
      return highlightPsHeaderOnlyOutput(line)
    }

    // 2.1.1 处理 ps 命令表头（手动检测）
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

    // 2.1.2 处理 ps aux 命令表头（手动检测）
    if (line.includes('USER') && line.includes('PID') && line.includes('%CPU') && line.includes('%MEM') && line.includes('COMMAND')) {
      console.log('Matched ps aux header:', line)
      return highlightPsAuxHeaderPreserveSpacing(line)
    }

    // 2.1.3 处理简化ps命令表头（PID TTY TIME CMD）
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

    // 2.2 处理 ps 命令表头（带数据的表头行）
    const psHeaderMatch = line.match(REGEX_PATTERNS.psHeader)
    if (psHeaderMatch) {
      return highlightPsHeaderOutput(psHeaderMatch)
    }

    // 2.3 处理简化ps命令数据行（PID TTY TIME CMD）- 优先检测简化格式
    // 检测格式：数字 终端 时间 命令（4个字段，时间格式为 HH:MM:SS）
    if (
      line.match(/^\s*\d+\s+\S+\s+\d{2}:\d{2}:\d{2}\s+.+$/) &&
      !line.match(/^\s*\d+\s+\d+\s+\d+\s+\d+\s+/) &&
      !line.includes('UID') &&
      !line.includes('PPID') &&
      !line.includes('USER')
    ) {
      return highlightPsSimpleOutputPreserveSpacing(line)
    }

    // 2.4 处理 ps 命令数据行 - 保留原始空格信息
    // 检查是否看起来像 ps 行（包含时间格式和数字开头）
    if (line.match(/^\s*\d+\s+\d+\s+\d+\s+\d+\s+/) && line.match(/\d{2}:\d{2}/)) {
      // 直接对原始行进行高亮处理，保留空格信息
      return highlightPsOutputPreserveSpacing(line)
    }

    // 2.4.1 处理 ps -ef 命令数据行（UID可能是用户名）
    // 检查格式：UID PID PPID C STIME TTY TIME CMD（8个字段，第2、3、4个字段是数字）
    if (
      line.match(/^\s*\S+\s+\d+\s+\d+\s+\d+\s+\S+\s+\S+\s+\d{2}:\d{2}:\d{2}\s+.+$/) &&
      !line.includes('USER') &&
      !line.includes('%CPU') &&
      !line.includes('%MEM')
    ) {
      return highlightPsOutputPreserveSpacing(line)
    }

    // 2.5 处理 ps 命令数据行（正则表达式匹配）
    const psMatch = line.match(REGEX_PATTERNS.ps)
    if (psMatch) {
      return highlightPsOutput(psMatch)
    }

    // 3. 处理 netstat 命令表头
    if (line.match(/^Proto\s+Recv-Q\s+Send-Q\s+Local Address\s+Foreign Address\s+State$/)) {
      return highlightNetstatHeaderPreserveSpacing(line)
    }

    // 3.0 处理 netstat 命令表头（更宽松的匹配）
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

    // 3.0.1 处理 netstat unix域套接字表头
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

    // 3.1 处理 netstat 命令输出（保留原始空格）
    // 匹配TCP连接（有状态字段）
    if (line.match(/^(tcp|tcp6)\s+\d+\s+\d+\s+[^\s]+\:[^\s]+\s+[^\s]+\:[^\s]+\s+[A-Z_]+/)) {
      return highlightNetstatOutputPreserveSpacing(line)
    }

    // 匹配UDP连接（无状态字段）
    if (line.match(/^(udp|udp6)\s+\d+\s+\d+\s+[^\s]+\:[^\s]+\s+[^\s]+\:[^\s]+/)) {
      return highlightNetstatOutputPreserveSpacing(line)
    }

    // 匹配unix域套接字（允许State字段为空）
    if (line.match(/^unix\s+\d+\s+\[[^\]]*\]\s+\w+\s+.*$/)) {
      return highlightNetstatUnixOutputPreserveSpacing(line)
    }

    // 4. 处理 JSON 内容（优先检测，避免被其他条件误匹配）
    if (line.match(/^\s*[{}[\]]/) || line.match(/^\s*"[^"]+"\s*:/) || line.match(/^\s*"[^"]+"\s*,?\s*$/)) {
      return highlightHttpOutput(line)
    }

    // 5. 处理 git 命令输出
    if (REGEX_PATTERNS.git.test(line)) {
      return highlightGitOutput(line)
    }

    // 6. 处理 docker 命令输出（保留原始空格）
    if (
      line.match(/^[a-f0-9]{12}\s+.+\s+".+"\s+.+\s+.+\s+.+\s+.+$/) ||
      line.match(/^CONTAINER ID\s+IMAGE\s+COMMAND\s+CREATED\s+STATUS\s+PORTS\s+NAMES$/)
    ) {
      return highlightDockerOutputPreserveSpacing(line)
    }

    // 6.1 处理 docker 命令输出（正则匹配）
    if (REGEX_PATTERNS.docker.test(line)) {
      return highlightDockerOutput(line)
    }

    // 7. 处理 npm/yarn 命令输出
    if (REGEX_PATTERNS.npm.test(line)) {
      return highlightNpmOutput(line)
    }

    // 8. 处理 curl/wget 命令输出
    if (line.match(/^curl\s+/) || line.match(/^wget\s+/) || line.match(/^HTTP\/\d\.\d\s+\d+/)) {
      return highlightHttpOutput(line)
    }

    // 8. 处理 df 命令（优化检测逻辑）
    // 先检查是否是df表头（快速检查）
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

    // 再检查是否是df数据行（使用简单的字段数量检查）
    const dfParts = line.split(/\s+/)
    if (dfParts.length >= 6) {
      // 检查是否包含df特征：百分比符号和挂载点路径
      const hasPercent = dfParts.some((part) => part.includes('%'))
      const hasMountPoint = dfParts[dfParts.length - 1].startsWith('/')

      if (hasPercent && hasMountPoint) {
        return highlightDfOutputPreserveSpacing(line)
      }
    }

    // 2.3.1 处理 ps aux 命令数据行 - 检查格式：USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
    // 更宽松的匹配：以用户名开头（可能包含+等特殊字符），包含PID、CPU和内存百分比
    if (line.match(/^\s*[\w+-]+\s+\d+\s+\d+\.\d+\s+\d+\.\d+\s+\d+\s+\d+\s+\S+\s+\S+\s+\S+\s+\S+\s+.+$/)) {
      console.log('Matched ps aux data line:', line)
      return highlightPsAuxOutputPreserveSpacing(line)
    }

    // 9. 处理 top/htop 命令系统信息行
    if (
      line.match(/^top\s+-/) ||
      line.match(/^Tasks:/) ||
      line.match(/^%Cpu\(s\):/) ||
      line.match(/^MiB\s+Mem\s*:/) ||
      line.match(/^MiB\s+Swap:/) ||
      line.match(/^KiB\s+Mem\s*:/) ||
      line.match(/^KiB\s+Swap:/) ||
      line.match(/^Mem:/) ||
      line.match(/^Swap:/)
    ) {
      return highlightTopSystemInfo(line)
    }

    // 9.1 处理 top/htop 命令表头（更宽松的匹配）
    if (line.includes('PID') && line.includes('USER') && line.includes('%CPU') && line.includes('%MEM') && line.includes('COMMAND')) {
      return highlightTopHeaderPreserveSpacing(line)
    }

    // 9.2 处理 top/htop 命令数据行（原始格式匹配）
    // 匹配格式：PID USER PR NI VIRT RES SHR S %CPU %MEM TIME+ COMMAND
    if (line.match(/^\s*\d+\s+[\w+-]+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\w\s+\d+\.\d+\s+\d+\.\d+\s+\d+:\d+\.\d+\s+.+$/)) {
      return highlightTopOutputPreserveSpacing(line)
    }

    // 9.3 处理 top/htop 命令数据行（更宽松的匹配）
    // 检查是否以数字开头，包含多个数字字段，并且有COMMAND字段
    if (
      line.match(/^\s*\d+\s+[\w+-]+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\w\s+\d+\.\d+\s+\d+\.\d+\s+\d+:\d+\.\d+\s+/) ||
      line.match(/^\s*\d+\s+[\w+-]+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\w\s+\d+\.\d+\s+\d+\.\d+\s+\d+:\d+\.\d+\s+\w+/)
    ) {
      return highlightTopOutputPreserveSpacing(line)
    }

    // 9.4 处理 top/htop 命令数据行（最宽松的匹配）
    // 检查是否以数字开头，包含足够的字段数量
    const topParts = line.trim().split(/\s+/)
    if (topParts.length >= 12 && /^\d+$/.test(topParts[0]) && /^[\w+-]+$/.test(topParts[1]) && /^\d+$/.test(topParts[2])) {
      return highlightTopOutputPreserveSpacing(line)
    }

    // 9.4.1 处理 top/htop 命令数据行（更宽松的匹配）
    // 检查是否以数字开头，包含足够的字段数量（至少10个字段）
    if (topParts.length >= 10 && /^\d+$/.test(topParts[0]) && /^[\w+-]+$/.test(topParts[1])) {
      return highlightTopOutputPreserveSpacing(line)
    }

    // 9.5 处理已经高亮过的top数据行（包含ANSI颜色代码）
    // 检查是否包含ANSI颜色代码且以PID开头
    if (line.includes('\x1b[') && line.match(/^\s*\x1b\[32m\d+\x1b\[0m/)) {
      return line // 已经高亮过，直接返回
    }

    // 9.6 处理top命令的另一种格式（USER PR PID VIRT RES SHR S %CPU %MEM TIME COMMAND）
    // 匹配格式：USER PR PID VIRT RES SHR S %CPU %MEM TIME COMMAND
    if (line.match(/^\s*\w+\s+[\d-]+\s+\d+\s+\d+\s+\d+\s+\d+\s+\w\s+\d+\.\d+\s+\d+\.\d+\s+\d+:\d+\.\d+\s+.+$/)) {
      return highlightTopOutputAlternativeFormat(line)
    }

    // 9.7 处理top命令的通用检测（兜底匹配）
    // 检查是否包含top命令的特征：以USER开头，包含数字字段，有CPU和MEM字段
    if (line.match(/^\s*\w+\s+[\d-]+\s+\d+\s+/) && (line.includes('%CPU') || line.includes('CPU') || line.includes('MEM') || line.includes('TIME'))) {
      return highlightTopOutputAlternativeFormat(line)
    }

    // 10. 处理 tail/head 命令输出
    if (REGEX_PATTERNS.tail.test(line)) {
      return highlightTailOutput(line)
    }

    // 11. 处理错误和警告信息
    if (REGEX_PATTERNS.error.test(line)) {
      return highlightErrorOutput(line)
    }

    // 12. 处理成功信息
    if (REGEX_PATTERNS.success.test(line)) {
      return highlightSuccessOutput(line)
    }

    // 13. 处理简单的 ls 输出（只有文件名）
    if (line.trim() && !line.includes('total') && !line.includes('drwx') && !line.includes('-rw') && !line.includes('PID')) {
      return highlightSimpleLsOutput(line)
    }

    return line
  })

  const result = highlightedLines.join('\n')

  // 缓存结果
  clearCache()
  highlightCache.set(content, result)

  return result
}

// 增强的 ANSI 颜色代码处理
const processAnsiCodes = (str: string): string => {
  if (!str || typeof str !== 'string') {
    return str
  }

  let result = str
    // 移除控制序列
    .replace(/\u001b\[[\d;]*[HfABCDEFGJKSTijklmnpqrsu]/g, '')
    .replace(/\u001b\[\?[0-9;]*[hl]/g, '')
    .replace(/\u001b\([AB01]/g, '')
    .replace(/\u001b[=>]/g, '')
    .replace(/\u001b[NO]/g, '')
    .replace(/\u001b\]0;[^\x07]*\x07/g, '')
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

    // 处理重置和样式
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

    // 处理标准颜色
    .replace(/\u001b\[30m/g, '\x1b[30m') // Black
    .replace(/\u001b\[31m/g, '\x1b[31m') // Red
    .replace(/\u001b\[32m/g, '\x1b[32m') // Green
    .replace(/\u001b\[33m/g, '\x1b[33m') // Yellow
    .replace(/\u001b\[34m/g, '\x1b[34m') // Blue
    .replace(/\u001b\[35m/g, '\x1b[35m') // Magenta
    .replace(/\u001b\[36m/g, '\x1b[36m') // Cyan
    .replace(/\u001b\[37m/g, '\x1b[37m') // White

    // 处理亮色
    .replace(/\u001b\[90m/g, '\x1b[90m') // Bright Black
    .replace(/\u001b\[91m/g, '\x1b[91m') // Bright Red
    .replace(/\u001b\[92m/g, '\x1b[92m') // Bright Green
    .replace(/\u001b\[93m/g, '\x1b[93m') // Bright Yellow
    .replace(/\u001b\[94m/g, '\x1b[94m') // Bright Blue
    .replace(/\u001b\[95m/g, '\x1b[95m') // Bright Magenta
    .replace(/\u001b\[96m/g, '\x1b[96m') // Bright Cyan
    .replace(/\u001b\[97m/g, '\x1b[97m') // Bright White

    // 处理背景色
    .replace(/\u001b\[40m/g, '\x1b[40m') // Black background
    .replace(/\u001b\[41m/g, '\x1b[41m') // Red background
    .replace(/\u001b\[42m/g, '\x1b[42m') // Green background
    .replace(/\u001b\[43m/g, '\x1b[43m') // Yellow background
    .replace(/\u001b\[44m/g, '\x1b[44m') // Blue background
    .replace(/\u001b\[45m/g, '\x1b[45m') // Magenta background
    .replace(/\u001b\[46m/g, '\x1b[46m') // Cyan background
    .replace(/\u001b\[47m/g, '\x1b[47m') // White background

    // 处理亮背景色
    .replace(/\u001b\[100m/g, '\x1b[100m') // Bright Black background
    .replace(/\u001b\[101m/g, '\x1b[101m') // Bright Red background
    .replace(/\u001b\[102m/g, '\x1b[102m') // Bright Green background
    .replace(/\u001b\[103m/g, '\x1b[103m') // Bright Yellow background
    .replace(/\u001b\[104m/g, '\x1b[104m') // Bright Blue background
    .replace(/\u001b\[105m/g, '\x1b[105m') // Bright Magenta background
    .replace(/\u001b\[106m/g, '\x1b[106m') // Bright Cyan background
    .replace(/\u001b\[107m/g, '\x1b[107m') // Bright White background

  // 处理 256 色和 RGB 色
  result = result.replace(/\u001b\[38;5;(\d+)m/g, (_, colorCode) => {
    const code = parseInt(colorCode)
    if (code < 16) {
      // 标准颜色
      return `\x1b[${code < 8 ? code + 30 : code + 82}m`
    } else if (code < 232) {
      // 216 色
      return `\x1b[38;5;${code}m`
    } else {
      // 灰度
      return `\x1b[38;5;${code}m`
    }
  })

  result = result.replace(/\u001b\[48;5;(\d+)m/g, (_, colorCode) => {
    const code = parseInt(colorCode)
    if (code < 16) {
      // 标准背景色
      return `\x1b[${code < 8 ? code + 40 : code + 92}m`
    } else if (code < 232) {
      // 216 色背景
      return `\x1b[48;5;${code}m`
    } else {
      // 灰度背景
      return `\x1b[48;5;${code}m`
    }
  })

  // 处理 RGB 颜色
  result = result.replace(/\u001b\[38;2;(\d+);(\d+);(\d+)m/g, (_, r, g, b) => {
    return `\x1b[38;2;${r};${g};${b}m`
  })

  result = result.replace(/\u001b\[48;2;(\d+);(\d+);(\d+)m/g, (_, r, g, b) => {
    return `\x1b[48;2;${r};${g};${b}m`
  })

  // 处理组合样式
  result = result.replace(/\u001b\[(\d+);(\d+)m/g, (_, p1, p2) => {
    const code1 = parseInt(p1)
    const code2 = parseInt(p2)

    // 处理常见的组合
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

// ls 命令输出高亮（保留原始空格）
const highlightLsOutputPreserveSpacing = (line: string): string => {
  const { reset, key, number, info, warning, header, white } = COLORS

  // 使用正则表达式匹配各个字段，但保留原始空格
  let highlighted = line

  // 匹配权限字段（第一个字段）
  highlighted = highlighted.replace(/^([drwx-]+)(\s+)/, (_, permissions, afterSpaces) => {
    return `${key}${permissions}${reset}${afterSpaces}`
  })

  // 匹配链接数字段（第二个字段）
  highlighted = highlighted.replace(/(\s+)(\d+)(\s+)/, (_, beforeSpaces, links, afterSpaces) => {
    return `${beforeSpaces}${number}${links}${reset}${afterSpaces}`
  })

  // 匹配用户字段（第三个字段）
  highlighted = highlighted.replace(/(\s+)(\w+)(\s+)/, (_, beforeSpaces, user, afterSpaces) => {
    return `${beforeSpaces}${info}${user}${reset}${afterSpaces}`
  })

  // 匹配组字段（第四个字段）
  highlighted = highlighted.replace(/(\s+)(\w+)(\s+)/, (_, beforeSpaces, group, afterSpaces) => {
    return `${beforeSpaces}${warning}${group}${reset}${afterSpaces}`
  })

  // 匹配大小字段（第五个字段）
  highlighted = highlighted.replace(/(\s+)(\d+)(\s+)/, (_, beforeSpaces, size, afterSpaces) => {
    return `${beforeSpaces}${number}${size}${reset}${afterSpaces}`
  })

  // 匹配日期字段（第六个字段）
  highlighted = highlighted.replace(/(\s+)([A-Za-z]+\s+\d+\s+(?:\d{2}:\d{2}|\d{4}))(\s+)/, (_, beforeSpaces, date, afterSpaces) => {
    return `${beforeSpaces}${header}${date}${reset}${afterSpaces}`
  })

  // 匹配文件名字段（最后一个字段）
  highlighted = highlighted.replace(/(\s+)(.+)$/, (_, beforeSpaces, name) => {
    // 根据文件类型和权限设置颜色
    let nameColor = white // 默认白色
    if (line.startsWith('d')) {
      nameColor = COLORS.info // 目录 - 蓝色
    } else if (line.includes('x')) {
      nameColor = COLORS.success // 可执行文件 - 绿色
    } else if (name.startsWith('.')) {
      nameColor = COLORS.gray // 隐藏文件 - 灰色
    } else if (name.match(/\.(js|ts|vue|py|java|cpp|c|h)$/)) {
      nameColor = COLORS.info // 代码文件 - 蓝色
    } else if (name.match(/\.(jpg|jpeg|png|gif|svg|ico)$/)) {
      nameColor = COLORS.magenta // 图片文件 - 洋红色
    } else if (name.match(/\.(zip|tar|gz|rar|7z)$/)) {
      nameColor = COLORS.warning // 压缩文件 - 黄色
    }
    return `${beforeSpaces}${nameColor}${name}${reset}`
  })

  return highlighted
}

// ls 命令表头高亮（保留原始空格）
const highlightLsHeaderPreserveSpacing = (line: string): string => {
  const { reset, header } = COLORS

  // 高亮表头字段，保留原始空格
  let highlighted = line

  // 高亮 total 字段
  highlighted = highlighted.replace(/\b(total)\b/g, (match) => {
    return `${header}${match}${reset}`
  })

  return highlighted
}

// ls 命令输出高亮
const highlightLsOutput = (match: RegExpMatchArray): string => {
  const [, permissions, links, user, group, size, date, name] = match

  // 根据文件类型和权限设置颜色
  let nameColor = '\x1b[37m' // 默认白色
  if (permissions.startsWith('d')) {
    nameColor = '\x1b[34m' // 目录 - 蓝色
  } else if (permissions.includes('x')) {
    nameColor = '\x1b[32m' // 可执行文件 - 绿色
  } else if (name.startsWith('.')) {
    nameColor = '\x1b[90m' // 隐藏文件 - 灰色
  } else if (name.match(/\.(js|ts|vue|py|java|cpp|c|h)$/)) {
    nameColor = '\x1b[36m' // 代码文件 - 青色
  } else if (name.match(/\.(jpg|jpeg|png|gif|svg|ico)$/)) {
    nameColor = '\x1b[35m' // 图片文件 - 紫色
  } else if (name.match(/\.(zip|tar|gz|rar|7z)$/)) {
    nameColor = '\x1b[33m' // 压缩文件 - 黄色
  }

  // 构建带颜色的行
  const reset = '\x1b[0m'
  const permColor = '\x1b[33m' // 权限 - 黄色
  const linkColor = '\x1b[36m' // 链接数 - 青色
  const userColor = '\x1b[31m' // 用户 - 红色
  const groupColor = '\x1b[35m' // 组 - 紫色
  const sizeColor = '\x1b[36m' // 大小 - 青色
  const dateColor = '\x1b[33m' // 日期 - 黄色

  return `${permColor}${permissions}${reset} ${linkColor}${links}${reset} ${userColor}${user}${reset} ${groupColor}${group}${reset} ${sizeColor}${size}${reset} ${dateColor}${date}${reset} ${nameColor}${name}${reset}`
}

// ps 命令输出高亮（保留原始空格）
const highlightPsOutputPreserveSpacing = (line: string): string => {
  const { reset, key, number, info, warning, header, white, gray, command, error } = COLORS

  // 使用split分割字段，避免复杂正则匹配
  const parts = line.trim().split(/\s+/)

  // 检查是否是ps数据行格式（至少8个字段）
  if (parts.length >= 8) {
    const [uid, pid, ppid, c, stime, tty, time, ...cmdParts] = parts
    const cmd = cmdParts.join(' ')

    // 定义固定列宽度（基于ps命令的典型输出）
    const columnWidths = {
      uid: 6, // UID列 - 增加宽度
      pid: 8, // PID列 - 增加宽度
      ppid: 8, // PPID列 - 增加宽度
      c: 3, // C列 - 增加宽度
      stime: 6, // STIME列 - 增加宽度
      tty: 10, // TTY列
      time: 10, // TIME列 - 增加宽度
      cmd: 0 // CMD列（不限制宽度）
    }

    // 定义颜色
    const uidColor = uid === '0' ? error : key // root用户红色，其他黄色
    const pidColor = number // PID - 绿色
    const ppidColor = info // PPID - 蓝色
    const cColor = warning // C - 黄色
    const stimeColor = header // STIME - 青色
    const ttyColor = white // TTY - 白色
    const timeColor = gray // TIME - 灰色

    // 根据命令类型确定颜色
    let cmdColor = command // 默认命令色
    if (cmd.includes('[') && cmd.includes(']')) {
      cmdColor = COLORS.magenta // 内核进程 - 洋红色
    } else if (cmd.includes('init') || cmd.includes('systemd')) {
      cmdColor = COLORS.error // 系统进程 - 红色
    } else if (cmd.includes('bash') || cmd.includes('sh')) {
      cmdColor = COLORS.success // Shell - 绿色
    } else if (cmd.includes('node') || cmd.includes('python') || cmd.includes('java')) {
      cmdColor = COLORS.info // 应用进程 - 蓝色
    }

    // 格式化每个字段，使用固定宽度
    const formatField = (text: string, width: number, color: string) => {
      const padded = text.padEnd(width)
      return `${color}${padded}${reset}`
    }

    // 重新构建行，使用固定宽度对齐
    return [
      formatField(uid, columnWidths.uid, uidColor),
      formatField(pid, columnWidths.pid, pidColor),
      formatField(ppid, columnWidths.ppid, ppidColor),
      formatField(c, columnWidths.c, cColor),
      formatField(stime, columnWidths.stime, stimeColor),
      formatField(tty, columnWidths.tty, ttyColor),
      formatField(time, columnWidths.time, timeColor),
      `${cmdColor}${cmd}${reset}`
    ].join('')
  }

  // 如果格式不匹配，回退到原始行
  return line
}

// ps 命令输出高亮
const highlightPsOutput = (match: RegExpMatchArray): string => {
  const [, uid, pid, ppid, c, stime, tty, time, cmd] = match

  const reset = '\x1b[0m'

  // 根据 UID 值设置不同颜色
  let uidColor = '\x1b[31m' // 默认红色
  if (uid === '0') {
    uidColor = '\x1b[91m' // root 用户 - 亮红色
  } else {
    uidColor = '\x1b[33m' // 普通用户 - 黄色
  }

  // 根据进程类型设置不同颜色
  let cmdColor = '\x1b[90m' // 默认灰色
  if (cmd.includes('[') && cmd.includes(']')) {
    cmdColor = '\x1b[35m' // 内核进程 - 紫色
  } else if (cmd.includes('init') || cmd.includes('systemd')) {
    cmdColor = '\x1b[91m' // 系统进程 - 亮红色
  } else if (cmd.includes('bash') || cmd.includes('sh')) {
    cmdColor = '\x1b[32m' // Shell - 绿色
  } else if (cmd.includes('node') || cmd.includes('python') || cmd.includes('java')) {
    cmdColor = '\x1b[36m' // 应用进程 - 青色
  }

  const pidColor = '\x1b[92m' // PID - 亮绿色
  const ppidColor = '\x1b[93m' // PPID - 亮黄色
  const cColor = '\x1b[94m' // C - 亮蓝色
  const stimeColor = '\x1b[95m' // STIME - 亮紫色
  const ttyColor = '\x1b[96m' // TTY - 亮青色
  const timeColor = '\x1b[97m' // TIME - 亮白色

  // 使用固定宽度格式化，确保与表头对齐
  const formattedUid = uid.padStart(4)
  const formattedPid = pid.padStart(7)
  const formattedPpid = ppid.padStart(7)
  const formattedC = c.padStart(2)
  const formattedStime = stime.padStart(5)
  const formattedTty = tty.padStart(10)
  const formattedTime = time.padStart(8)

  return `${uidColor}${formattedUid}${reset} ${pidColor}${formattedPid}${reset} ${ppidColor}${formattedPpid}${reset} ${cColor}${formattedC}${reset} ${stimeColor}${formattedStime}${reset} ${ttyColor}${formattedTty}${reset} ${timeColor}${formattedTime}${reset} ${cmdColor}${cmd}${reset}`
}

// ps 命令表头高亮（保留原始空格）
const highlightPsHeaderPreserveSpacing = (line: string): string => {
  const { reset, header } = COLORS

  // 使用split分割字段，避免复杂正则匹配
  const parts = line.trim().split(/\s+/)

  // 检查是否是ps表头格式（至少8个字段）
  if (parts.length >= 8) {
    const [uid, pid, ppid, c, stime, tty, time, ...cmdParts] = parts
    const cmd = cmdParts.join(' ')

    // 定义固定列宽度（与数据行保持一致）
    const columnWidths = {
      uid: 6, // UID列 - 与数据行一致
      pid: 8, // PID列 - 与数据行一致
      ppid: 8, // PPID列 - 与数据行一致
      c: 3, // C列 - 与数据行一致
      stime: 6, // STIME列 - 与数据行一致
      tty: 10, // TTY列 - 与数据行一致
      time: 10, // TIME列 - 与数据行一致
      cmd: 0 // CMD列（不限制宽度）
    }

    // 格式化每个字段，使用固定宽度
    const formatField = (text: string, width: number, color: string) => {
      const padded = text.padEnd(width)
      return `${color}${padded}${reset}`
    }

    // 重新构建表头，使用固定宽度对齐
    return [
      formatField(uid, columnWidths.uid, header),
      formatField(pid, columnWidths.pid, header),
      formatField(ppid, columnWidths.ppid, header),
      formatField(c, columnWidths.c, header),
      formatField(stime, columnWidths.stime, header),
      formatField(tty, columnWidths.tty, header),
      formatField(time, columnWidths.time, header),
      `${header}${cmd}${reset}`
    ].join('')
  }

  // 如果格式不匹配，回退到原始行
  return line
}

// ps 命令纯表头高亮
const highlightPsHeaderOnlyOutput = (_line: string): string => {
  const reset = '\x1b[0m'

  // 将表头行格式化为与数据行对齐的格式
  // 使用固定宽度来对齐列
  const formattedHeader = '    UID     PID    PPID  C STIME TTY          TIME CMD'

  // 高亮各个列名
  let highlighted = formattedHeader
    .replace(/\b(UID)\b/g, `\x1b[1;31m$1${reset}`) // UID - 粗体红色
    .replace(/\b(PID)\b/g, `\x1b[1;32m$1${reset}`) // PID - 粗体绿色
    .replace(/\b(PPID)\b/g, `\x1b[1;33m$1${reset}`) // PPID - 粗体黄色
    .replace(/\b(C)\b/g, `\x1b[1;34m$1${reset}`) // C - 粗体蓝色
    .replace(/\b(STIME)\b/g, `\x1b[1;35m$1${reset}`) // STIME - 粗体紫色
    .replace(/\b(TTY)\b/g, `\x1b[1;36m$1${reset}`) // TTY - 粗体青色
    .replace(/\b(TIME)\b/g, `\x1b[1;37m$1${reset}`) // TIME - 粗体白色
    .replace(/\b(CMD)\b/g, `\x1b[1;90m$1${reset}`) // CMD - 粗体灰色

  return highlighted
}

// ps 命令表头高亮
const highlightPsHeaderOutput = (match: RegExpMatchArray): string => {
  const [, uid, pid, ppid, c, stime, tty, time, cmd] = match

  const reset = '\x1b[0m'
  const uidColor = '\x1b[1;31m' // UID - 粗体红色
  const pidColor = '\x1b[1;32m' // PID - 粗体绿色
  const ppidColor = '\x1b[1;33m' // PPID - 粗体黄色
  const cColor = '\x1b[1;34m' // C - 粗体蓝色
  const stimeColor = '\x1b[1;35m' // STIME - 粗体紫色
  const ttyColor = '\x1b[1;36m' // TTY - 粗体青色
  const timeColor = '\x1b[1;37m' // TIME - 粗体白色
  const cmdColor = '\x1b[1;90m' // CMD - 粗体灰色

  return `${uidColor}${uid}${reset} ${pidColor}${pid}${reset} ${ppidColor}${ppid}${reset} ${cColor}${c}${reset} ${stimeColor}${stime}${reset} ${ttyColor}${tty}${reset} ${timeColor}${time}${reset} ${cmdColor}${cmd}${reset}`
}

// ps aux 命令表头高亮（保留原始空格）
function highlightPsAuxHeaderPreserveSpacing(line: string): string {
  const { reset, header } = COLORS

  // 高亮表头字段，保留原始空格
  let highlighted = line

  // 高亮各个表头字段（特殊处理包含%的字段）
  highlighted = highlighted.replace(/(USER|PID|VSZ|RSS|TTY|STAT|START|TIME|COMMAND)\b/g, (match) => {
    return `${header}${match}${reset}`
  })

  // 单独处理包含%的字段
  highlighted = highlighted.replace(/(%CPU|%MEM)/g, (match) => {
    return `${header}${match}${reset}`
  })

  return highlighted
}

// ps aux 命令输出高亮（保留原始空格）
function highlightPsAuxOutputPreserveSpacing(line: string): string {
  const { reset, key, number, info, warning, header, white, gray, command, error } = COLORS

  // 使用正则表达式匹配各个字段，但保留原始空格
  let highlighted = line

  // 匹配 USER（第一个字段，可能包含+等特殊字符）
  highlighted = highlighted.replace(/^(\s*)([\w+-]+)(\s+)/, (_, leadingSpaces, user, afterSpaces) => {
    let userColor = key // 默认键色
    if (user === 'root') {
      userColor = error // root 用户 - 红色
    }
    return `${leadingSpaces}${userColor}${user}${reset}${afterSpaces}`
  })

  // 匹配 PID（第二个字段）
  highlighted = highlighted.replace(/(\s+)(\d+)(\s+)/, (_, beforeSpaces, pid, afterSpaces) => {
    return `${beforeSpaces}${number}${pid}${reset}${afterSpaces}`
  })

  // 匹配 %CPU（第三个字段）
  highlighted = highlighted.replace(/(\s+)(\d+\.\d+)(\s+)/, (_, beforeSpaces, cpu, afterSpaces) => {
    const cpuPercent = parseFloat(cpu)
    let cpuColor = info // 默认蓝色
    if (cpuPercent > 80) {
      cpuColor = error // 高CPU使用率 - 红色
    } else if (cpuPercent > 50) {
      cpuColor = warning // 中等CPU使用率 - 黄色
    } else {
      cpuColor = COLORS.success // 低CPU使用率 - 绿色
    }
    return `${beforeSpaces}${cpuColor}${cpu}${reset}${afterSpaces}`
  })

  // 匹配 %MEM（第四个字段）
  highlighted = highlighted.replace(/(\s+)(\d+\.\d+)(\s+)/, (_, beforeSpaces, mem, afterSpaces) => {
    const memPercent = parseFloat(mem)
    let memColor = info // 默认蓝色
    if (memPercent > 80) {
      memColor = error // 高内存使用率 - 红色
    } else if (memPercent > 50) {
      memColor = warning // 中等内存使用率 - 黄色
    } else {
      memColor = COLORS.success // 低内存使用率 - 绿色
    }
    return `${beforeSpaces}${memColor}${mem}${reset}${afterSpaces}`
  })

  // 匹配 VSZ（第五个字段）
  highlighted = highlighted.replace(/(\s+)(\d+)(\s+)/, (_, beforeSpaces, vsz, afterSpaces) => {
    return `${beforeSpaces}${gray}${vsz}${reset}${afterSpaces}`
  })

  // 匹配 RSS（第六个字段）
  highlighted = highlighted.replace(/(\s+)(\d+)(\s+)/, (_, beforeSpaces, rss, afterSpaces) => {
    return `${beforeSpaces}${gray}${rss}${reset}${afterSpaces}`
  })

  // 匹配 TTY（第七个字段）
  highlighted = highlighted.replace(/(\s+)(\S+)(\s+)/, (_, beforeSpaces, tty, afterSpaces) => {
    return `${beforeSpaces}${white}${tty}${reset}${afterSpaces}`
  })

  // 匹配 STAT（第八个字段）
  highlighted = highlighted.replace(/(\s+)(\w+)(\s+)/, (_, beforeSpaces, stat, afterSpaces) => {
    let statColor = warning // 默认黄色
    if (stat.includes('R')) {
      statColor = COLORS.success // 运行状态 - 绿色
    } else if (stat.includes('S')) {
      statColor = info // 睡眠状态 - 蓝色
    } else if (stat.includes('Z')) {
      statColor = error // 僵尸状态 - 红色
    } else if (stat.includes('T')) {
      statColor = warning // 停止状态 - 黄色
    }
    return `${beforeSpaces}${statColor}${stat}${reset}${afterSpaces}`
  })

  // 匹配 START（第九个字段）
  highlighted = highlighted.replace(/(\s+)(\S+)(\s+)/, (_, beforeSpaces, start, afterSpaces) => {
    return `${beforeSpaces}${header}${start}${reset}${afterSpaces}`
  })

  // 匹配 TIME（第十个字段）
  highlighted = highlighted.replace(/(\s+)(\d+:\d+\.\d+)(\s+)/, (_, beforeSpaces, time, afterSpaces) => {
    return `${beforeSpaces}${gray}${time}${reset}${afterSpaces}`
  })

  // 匹配 COMMAND（最后一个字段，剩余所有内容）
  highlighted = highlighted.replace(/(\s+)(.+)$/, (_, beforeSpaces, cmd) => {
    let cmdColor = command // 默认命令色
    if (cmd.includes('[') && cmd.includes(']')) {
      cmdColor = COLORS.magenta // 内核进程 - 洋红色
    } else if (cmd.includes('init') || cmd.includes('systemd')) {
      cmdColor = COLORS.error // 系统进程 - 红色
    } else if (cmd.includes('bash') || cmd.includes('sh')) {
      cmdColor = COLORS.success // Shell - 绿色
    } else if (cmd.includes('node') || cmd.includes('python') || cmd.includes('java')) {
      cmdColor = COLORS.info // 应用进程 - 蓝色
    }
    return `${beforeSpaces}${cmdColor}${cmd}${reset}`
  })

  return highlighted
}

// ps简化命令表头高亮（保留原始空格）
const highlightPsSimpleHeaderPreserveSpacing = (line: string): string => {
  const { reset, header } = COLORS

  // 使用split分割字段，避免复杂正则匹配
  const parts = line.trim().split(/\s+/)

  // 检查是否是简化ps表头格式（4个字段）
  if (parts.length >= 4) {
    const [pid, tty, time, cmd] = parts

    // 定义固定列宽度（基于简化ps命令的典型输出）
    const columnWidths = {
      pid: 8, // PID列
      tty: 8, // TTY列
      time: 10, // TIME列
      cmd: 0 // CMD列（不限制宽度）
    }

    // 格式化每个字段，使用固定宽度
    const formatField = (text: string, width: number, color: string) => {
      const padded = text.padEnd(width)
      return `${color}${padded}${reset}`
    }

    // 重新构建表头，使用固定宽度对齐
    return [
      formatField(pid, columnWidths.pid, header),
      formatField(tty, columnWidths.tty, header),
      formatField(time, columnWidths.time, header),
      `${header}${cmd}${reset}`
    ].join('')
  }

  // 如果格式不匹配，回退到原始行
  return line
}

// ps简化命令输出高亮（保留原始空格）
const highlightPsSimpleOutputPreserveSpacing = (line: string): string => {
  const { reset, command, error, success, info } = COLORS

  // 使用split分割字段，避免复杂正则匹配
  const parts = line.trim().split(/\s+/)

  // 检查是否是简化ps数据行格式（至少4个字段）
  if (parts.length >= 4) {
    const [pid, tty, time, ...cmdParts] = parts
    const cmd = cmdParts.join(' ')

    // 定义固定列宽度（与表头保持一致）
    const columnWidths = {
      pid: 8, // PID列
      tty: 8, // TTY列
      time: 10, // TIME列
      cmd: 0 // CMD列（不限制宽度）
    }

    // 定义颜色
    const pidColor = COLORS.green // PID - 绿色
    const ttyColor = COLORS.white // TTY - 白色
    const timeColor = COLORS.cyan // TIME - 青色

    // 根据命令类型确定颜色
    let cmdColor = command // 默认命令色
    if (cmd.includes('[') && cmd.includes(']')) {
      cmdColor = COLORS.magenta // 内核进程 - 洋红色
    } else if (cmd.includes('init') || cmd.includes('systemd')) {
      cmdColor = error // 系统进程 - 红色
    } else if (cmd.includes('bash') || cmd.includes('sh')) {
      cmdColor = success // Shell - 绿色
    } else if (cmd.includes('node') || cmd.includes('python') || cmd.includes('java')) {
      cmdColor = info // 应用进程 - 蓝色
    }

    // 格式化每个字段，使用固定宽度
    const formatField = (text: string, width: number, color: string) => {
      const padded = text.padEnd(width)
      return `${color}${padded}${reset}`
    }

    // 重新构建行，使用固定宽度对齐
    return [
      formatField(pid, columnWidths.pid, pidColor),
      formatField(tty, columnWidths.tty, ttyColor),
      formatField(time, columnWidths.time, timeColor),
      `${cmdColor}${cmd}${reset}`
    ].join('')
  }

  // 如果格式不匹配，回退到原始行
  return line
}

// netstat 命令输出高亮（保留原始空格）
const highlightNetstatOutputPreserveSpacing = (line: string): string => {
  const { reset, success, number, url, key, warning, header, error, cyan, yellow } = COLORS

  // 使用简单的方法：只高亮关键部分，不破坏原始格式
  let highlighted = line

  // 1. 高亮协议字段
  highlighted = highlighted.replace(/^(tcp|udp|tcp6|udp6|unix)/, (match) => {
    return `${success}${match}${reset}`
  })

  // 2. 高亮数字字段（Recv-Q, Send-Q, RefCnt）
  highlighted = highlighted.replace(/\b(\d+)\b/g, (match) => {
    return `${number}${match}${reset}`
  })

  // 3. 高亮IP地址和端口
  highlighted = highlighted.replace(/([0-9a-fA-F:.]+):([0-9*]+)/g, (_, addr, port) => {
    // 检查是否是IPv6地址
    const isIPv6 = addr.includes(':')
    const addrColor = isIPv6 ? cyan : url // IPv6用青色，IPv4用蓝色
    return `${addrColor}${addr}${reset}:${key}${port}${reset}`
  })

  // 4. 高亮状态字段
  highlighted = highlighted.replace(
    /\b(LISTEN|ESTABLISHED|TIME_WAIT|CLOSED|SYN_SENT|SYN_RECV|FIN_WAIT1|FIN_WAIT2|CLOSE_WAIT|LAST_ACK|CLOSING|CONNECTED|DGRAM|STREAM|SEQPACKET)\b/g,
    (match) => {
      let stateColor = COLORS.magenta // 默认洋红色
      if (match === 'ESTABLISHED' || match === 'CONNECTED') {
        stateColor = success // 已建立/已连接 - 绿色
      } else if (match === 'TIME_WAIT') {
        stateColor = warning // 等待 - 黄色
      } else if (match === 'LISTEN') {
        stateColor = header // 监听 - 青色
      } else if (match === 'CLOSED') {
        stateColor = error // 关闭 - 红色
      } else if (match === 'DGRAM' || match === 'STREAM' || match === 'SEQPACKET') {
        stateColor = cyan // 套接字类型 - 青色
      }
      return `${stateColor}${match}${reset}`
    }
  )

  // 5. 高亮程序字段（PID/程序名）
  highlighted = highlighted.replace(/(\d+)\/([^\s]+)/g, (_, pid, program) => {
    return `${number}${pid}${reset}/${header}${program}${reset}`
  })

  // 6. 高亮连字符（表示没有PID/程序信息）
  highlighted = highlighted.replace(/(\s+)-(\s*)$/, (_, beforeSpaces, afterSpaces) => {
    return `${beforeSpaces}${header}-${reset}${afterSpaces}`
  })

  // 7. 高亮unix域套接字路径
  highlighted = highlighted.replace(/(\s+)(\/[^\s]+|@[^\s]+)/g, (_, beforeSpaces, path) => {
    return `${beforeSpaces}${cyan}${path}${reset}`
  })

  // 8. 高亮Flags字段（方括号内容）
  highlighted = highlighted.replace(/(\s+)\[([^\]]+)\]/g, (_, beforeSpaces, flags) => {
    return `${beforeSpaces}[${yellow}${flags}${reset}]`
  })

  return highlighted
}

// netstat 命令表头高亮（保留原始空格）
const highlightNetstatHeaderPreserveSpacing = (line: string): string => {
  const { reset, header } = COLORS

  // 高亮表头字段，使用统一的青色配色
  let highlighted = line

  // 高亮各个表头字段，统一使用青色
  highlighted = highlighted.replace(
    /(Proto|Recv-Q|Send-Q|Local Address|Foreign Address|State|PID\/Program name|RefCnt|Flags|Type|I-Node|Path)/g,
    (match) => {
      return `${header}${match}${reset}` // 所有表头字段 - 青色
    }
  )

  return highlighted
}

// netstat unix域套接字表头高亮（保留原始空格）
const highlightNetstatUnixHeaderPreserveSpacing = (line: string): string => {
  const { reset, header } = COLORS

  // 检查是否是unix域套接字表头格式
  if (
    line.includes('Proto') &&
    line.includes('RefCnt') &&
    line.includes('Flags') &&
    line.includes('Type') &&
    line.includes('State') &&
    line.includes('I-Node') &&
    line.includes('Path')
  ) {
    // 定义固定列宽度（与数据行保持一致）
    const columnWidths = {
      proto: 6, // Proto列
      refcnt: 7, // RefCnt列
      flags: 10, // Flags列
      type: 11, // Type列
      state: 12, // State列
      inode: 8, // I-Node列
      path: 0 // Path列（不限制宽度）
    }

    // 格式化每个字段，使用固定宽度
    const formatField = (text: string, width: number, color: string) => {
      const padded = text.padEnd(width)
      return `${color}${padded}${reset}`
    }

    // 重新构建表头，使用固定宽度对齐
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

  // 如果格式不匹配，回退到原始行
  return line
}

// netstat unix域套接字输出高亮（保留原始空格）
const highlightNetstatUnixOutputPreserveSpacing = (line: string): string => {
  const { reset, success, number, cyan, yellow, magenta } = COLORS

  // 使用更精确的解析方法处理unix域套接字
  if (line.startsWith('unix ')) {
    // 先匹配Flags列（方括号内容）
    const flagsMatch = line.match(/^unix\s+(\d+)\s+(\[[^\]]*\])/)
    if (flagsMatch) {
      const [, refcnt, flags] = flagsMatch
      const remaining = line.substring(flagsMatch[0].length).trim()

      // 分割剩余部分
      const parts = remaining.split(/\s+/)

      let type = ''
      let state = ''
      let inode = ''
      let path = ''

      if (parts.length >= 1) {
        type = parts[0] || ''
      }
      if (parts.length >= 2) {
        // 检查第二个字段是否是数字（I-Node）还是状态
        const secondField = parts[1]
        if (/^\d+$/.test(secondField)) {
          // 第二个字段是数字，说明State字段为空
          inode = secondField
          path = parts.slice(2).join(' ')
        } else {
          // 第二个字段是状态
          state = secondField
          if (parts.length >= 3) {
            inode = parts[2] || ''
            path = parts.slice(3).join(' ')
          }
        }
      }

      // 定义固定列宽度（根据真实终端输出调整）
      const columnWidths = {
        proto: 6, // Proto列
        refcnt: 7, // RefCnt列
        flags: 10, // Flags列
        type: 11, // Type列
        state: 12, // State列
        inode: 8, // I-Node列
        path: 0 // Path列（不限制宽度）
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

  // 如果正则表达式都不匹配，尝试使用简单的字段分割作为兜底
  if (line.startsWith('unix ')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length >= 5) {
      const [proto, refcnt, flags, type, ...rest] = parts

      // 尝试解析剩余字段
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

      // 定义固定列宽度（与表头保持一致）
      const columnWidths = {
        proto: 6, // Proto列
        refcnt: 7, // RefCnt列
        flags: 10, // Flags列
        type: 11, // Type列
        state: 12, // State列
        inode: 8, // I-Node列
        path: 0 // Path列（不限制宽度）
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

  // 如果格式不匹配，回退到原始行
  return line
}

// git 命令输出高亮
const highlightGitOutput = (line: string): string => {
  const { reset, header, success, warning, error, info, key, value } = COLORS
  let highlighted = line

  // 高亮 git status 标题行
  if (REGEX_PATTERNS.gitStatus.test(line)) {
    highlighted = highlighted.replace(REGEX_PATTERNS.gitStatus, (match) => {
      return `${header}${match}${reset}`
    })
  }

  // 高亮文件变更状态（modified:, added:, deleted: 等）
  if (REGEX_PATTERNS.gitFileChange.test(line)) {
    highlighted = highlighted.replace(/(modified:|added:|deleted:|renamed:|new file:|modified file:|deleted file:|renamed file:)/g, (match) => {
      let color = info // 默认蓝色
      if (match.includes('added') || match.includes('new file')) {
        color = success // 绿色 - 新增
      } else if (match.includes('modified')) {
        color = warning // 黄色 - 修改
      } else if (match.includes('deleted')) {
        color = error // 红色 - 删除
      } else if (match.includes('renamed')) {
        color = key // 黄色 - 重命名
      }
      return `${color}${match}${reset}`
    })
  }

  // 高亮分支名
  highlighted = highlighted.replace(REGEX_PATTERNS.branchName, (match) => {
    return `${success}${match}${reset}`
  })

  // 高亮 commit hash
  highlighted = highlighted.replace(REGEX_PATTERNS.commitHash, (match) => {
    return `${key}${match}${reset}`
  })

  // 高亮文件状态（在文本中的状态词）
  highlighted = highlighted.replace(REGEX_PATTERNS.fileStatus, (match) => {
    let color = info // 默认蓝色
    if (match.includes('added') || match.includes('new')) {
      color = success // 绿色
    } else if (match.includes('modified')) {
      color = warning // 黄色
    } else if (match.includes('deleted')) {
      color = error // 红色
    } else if (match.includes('renamed')) {
      color = key // 黄色
    }
    return `${color}${match}${reset}`
  })

  // 高亮 git 命令
  highlighted = highlighted.replace(REGEX_PATTERNS.gitCommand, (match) => {
    return `${info}${match}${reset}`
  })

  // 高亮文件名（在变更状态后的文件名）
  highlighted = highlighted.replace(
    /(modified:|added:|deleted:|renamed:|new file:|modified file:|deleted file:|renamed file:)\s+(.+)$/g,
    (match, _, filename) => {
      return `${match.replace(filename, `${value}${filename}${reset}`)}`
    }
  )

  return highlighted
}

// docker 命令输出高亮（保留原始空格）
const highlightDockerOutputPreserveSpacing = (line: string): string => {
  const reset = '\x1b[0m'

  // 检查是否是表头行
  if (line.includes('CONTAINER ID') && line.includes('IMAGE') && line.includes('COMMAND')) {
    // 处理表头行 - 使用统一的表头颜色
    const { reset, header } = COLORS
    let highlighted = line

    // 高亮各个表头字段
    highlighted = highlighted.replace(/\b(CONTAINER ID|IMAGE|COMMAND|CREATED|STATUS|PORTS|NAMES)\b/g, (match) => {
      return `${header}${match}${reset}`
    })
    return highlighted
  }

  // 处理数据行
  let highlighted = line

  // 匹配 CONTAINER ID 字段（第一个字段，12位十六进制）
  highlighted = highlighted.replace(/^([a-f0-9]{12})(\s+)/, (_, containerId, afterSpaces) => {
    const containerIdColor = '\x1b[33m' // CONTAINER ID - 黄色
    return `${containerIdColor}${containerId}${reset}${afterSpaces}`
  })

  // 匹配 IMAGE 字段（第二个字段）
  highlighted = highlighted.replace(/(\s+)([^\s]+)(\s+)/, (_, beforeSpaces, image, afterSpaces) => {
    const imageColor = '\x1b[32m' // IMAGE - 绿色
    return `${beforeSpaces}${imageColor}${image}${reset}${afterSpaces}`
  })

  // 匹配 COMMAND 字段（第三个字段，用引号包围）
  highlighted = highlighted.replace(/(\s+)(".*?")(\s+)/, (_, beforeSpaces, command, afterSpaces) => {
    const commandColor = '\x1b[36m' // COMMAND - 青色
    return `${beforeSpaces}${commandColor}${command}${reset}${afterSpaces}`
  })

  // 匹配 CREATED 字段（第四个字段）
  highlighted = highlighted.replace(/(\s+)([^\s]+(?:\s+[^\s]+)*)(\s+)/, (_, beforeSpaces, created, afterSpaces) => {
    const createdColor = '\x1b[35m' // CREATED - 紫色
    return `${beforeSpaces}${createdColor}${created}${reset}${afterSpaces}`
  })

  // 匹配 STATUS 字段（第五个字段）
  highlighted = highlighted.replace(/(\s+)([^\s]+(?:\s+[^\s]+)*)(\s+)/, (_, beforeSpaces, status, afterSpaces) => {
    let statusColor = '\x1b[35m' // 默认紫色
    if (status.includes('running')) {
      statusColor = '\x1b[32m' // running - 绿色
    } else if (status.includes('exited')) {
      statusColor = '\x1b[31m' // exited - 红色
    } else if (status.includes('created')) {
      statusColor = '\x1b[33m' // created - 黄色
    } else if (status.includes('restarting')) {
      statusColor = '\x1b[36m' // restarting - 青色
    }
    return `${beforeSpaces}${statusColor}${status}${reset}${afterSpaces}`
  })

  // 匹配 PORTS 字段（第六个字段）
  highlighted = highlighted.replace(/(\s+)([^\s]+(?:\s+[^\s]+)*)(\s+)/, (_, beforeSpaces, ports, afterSpaces) => {
    const portsColor = '\x1b[34m' // PORTS - 蓝色
    return `${beforeSpaces}${portsColor}${ports}${reset}${afterSpaces}`
  })

  // 匹配 NAMES 字段（最后一个字段）
  highlighted = highlighted.replace(/(\s+)(.+)$/, (_, beforeSpaces, names) => {
    const namesColor = '\x1b[37m' // NAMES - 白色
    return `${beforeSpaces}${namesColor}${names}${reset}`
  })

  return highlighted
}

// docker 命令输出高亮
const highlightDockerOutput = (line: string): string => {
  const reset = '\x1b[0m'
  let highlighted = line

  // 高亮容器 ID
  highlighted = highlighted.replace(REGEX_PATTERNS.containerId, `\x1b[33m$1${reset}`)

  // 高亮镜像名
  highlighted = highlighted.replace(REGEX_PATTERNS.imageName, `\x1b[32m$1${reset}`)

  // 高亮状态
  highlighted = highlighted.replace(REGEX_PATTERNS.containerStatus, `\x1b[35m$1${reset}`)

  // 高亮 docker 命令
  highlighted = highlighted.replace(REGEX_PATTERNS.dockerCommand, `\x1b[36m$1${reset}`)

  return highlighted
}

// 错误信息高亮
const highlightErrorOutput = (line: string): string => {
  const reset = '\x1b[0m'
  return `\x1b[91m${line}${reset}` // 亮红色
}

// 成功信息高亮
const highlightSuccessOutput = (line: string): string => {
  const reset = '\x1b[0m'
  return `\x1b[92m${line}${reset}` // 亮绿色
}

// npm/yarn 命令输出高亮
const highlightNpmOutput = (line: string): string => {
  const reset = '\x1b[0m'
  let highlighted = line

  // 高亮包名
  highlighted = highlighted.replace(REGEX_PATTERNS.packageName, `\x1b[32m$1${reset}`)

  // 高亮版本号
  highlighted = highlighted.replace(REGEX_PATTERNS.version, `\x1b[33m$1${reset}`)

  // 高亮状态
  highlighted = highlighted.replace(REGEX_PATTERNS.npmStatus, `\x1b[35m$1${reset}`)

  // 高亮命令
  highlighted = highlighted.replace(REGEX_PATTERNS.npmCommand, `\x1b[36m$1${reset}`)

  // 高亮警告和错误
  highlighted = highlighted.replace(REGEX_PATTERNS.npmWarn, `\x1b[91m$1${reset}`)

  return highlighted
}

// curl/wget 命令输出高亮
const highlightHttpOutput = (line: string): string => {
  const { reset, white, header, value, key, number, boolean, structure, command, method, url } = COLORS
  let highlighted = line

  // 首先清理可能存在的 ANSI 转义序列
  highlighted = highlighted.replace(/\x1b\[[0-9;]*m/g, '')

  // 高亮 HTTP 状态码（包括完整的状态行）
  if (highlighted.match(/^HTTP\/\d\.\d\s+\d+/)) {
    highlighted = highlighted.replace(/HTTP\/\d\.\d\s+(\d+)\s+([^\r\n]+)/, (_, statusCode, statusText) => {
      const code = parseInt(statusCode)
      let statusColor = COLORS.success // 默认成功色

      if (code >= 200 && code < 300) {
        statusColor = COLORS.success // 成功 - 绿色
      } else if (code >= 300 && code < 400) {
        statusColor = COLORS.warning // 重定向 - 黄色
      } else if (code >= 400 && code < 500) {
        statusColor = COLORS.error // 客户端错误 - 红色
      } else if (code >= 500) {
        statusColor = COLORS.magenta // 服务器错误 - 洋红色
      }

      return `${white}HTTP/1.1${reset} ${statusColor}${statusCode}${reset} ${white}${statusText}${reset}`
    })
  }

  // 高亮 HTTP 头部
  if (highlighted.match(/^[A-Za-z-]+:\s*.+$/)) {
    highlighted = highlighted.replace(/^([A-Za-z-]+):\s*(.+)$/, (_, headerName, headerValue) => {
      return `${header}${headerName}${reset}: ${white}${headerValue}${reset}`
    })
  }

  // 高亮 JSON 内容
  if (highlighted.match(/^\s*[{}[\]]/) || highlighted.match(/^\s*"[^"]+"\s*:/) || highlighted.match(/^\s*"[^"]+"\s*,?\s*$/)) {
    // 先高亮 JSON 大括号和方括号
    highlighted = highlighted.replace(/[{}[\]]/g, `${structure}$&${reset}`)

    // 高亮 JSON 键
    highlighted = highlighted.replace(/"([^"]+)":/g, `"${key}$1${reset}":`)

    // 高亮 JSON 字符串值
    highlighted = highlighted.replace(/:\s*"([^"]*)"/g, `: "${value}$1${reset}"`)

    // 高亮 JSON 数字值
    highlighted = highlighted.replace(/:\s*(\d+)/g, `: ${number}$1${reset}`)

    // 高亮 JSON 布尔值
    highlighted = highlighted.replace(/:\s*(true|false)/g, `: ${boolean}$1${reset}`)
  }

  // 高亮 curl 命令
  if (highlighted.match(/^curl\s+/)) {
    // 高亮命令名称
    highlighted = highlighted.replace(/\b(curl|wget|http)\b/g, `${command}$1${reset}`)

    // 高亮 HTTP 方法
    highlighted = highlighted.replace(/\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/g, `${method}$1${reset}`)

    // 高亮 URL
    highlighted = highlighted.replace(/(https?:\/\/[^\s]+)/g, `${url}$1${reset}`)
  }

  return highlighted
}

// df 命令颜色常量 - 提取到函数外部，避免重复创建
const DF_COLORS = {
  reset: '\x1b[0m',
  filesystem: '\x1b[34m', // 文件系统 - 蓝色
  size: '\x1b[33m', // 大小 - 黄色
  used: '\x1b[31m', // 已用 - 红色
  avail: '\x1b[32m', // 可用 - 绿色
  percent: '\x1b[35m', // 百分比 - 紫色
  mounted: '\x1b[36m', // 挂载点 - 青色
  header: '\x1b[36m' // 表头 - 青色
}

// df 命令输出高亮（固定宽度列对齐）
const highlightDfOutputPreserveSpacing = (line: string): string => {
  // 使用split代替复杂正则，性能更好
  const parts = line.split(/\s+/)

  // 检查是否是df格式（至少6个字段）
  if (parts.length >= 6) {
    const [filesystem, size, used, avail, usePercent, ...mountedParts] = parts
    const mounted = mountedParts.join(' ') // 处理挂载点中可能包含空格的情况

    // 定义固定列宽度（基于df -h的典型输出）
    const columnWidths = {
      filesystem: 12, // 文件系统列
      size: 8, // 大小列
      used: 8, // 已用列
      avail: 8, // 可用列
      percent: 6, // 使用率列
      mounted: 0 // 挂载点列（不限制宽度）
    }

    // 格式化每个字段，使用固定宽度
    const formatField = (text: string, width: number, color: string) => {
      const padded = text.padEnd(width)
      return `${color}${padded}${DF_COLORS.reset}`
    }

    // 构建固定宽度的行
    return [
      formatField(filesystem, columnWidths.filesystem, DF_COLORS.filesystem),
      formatField(size, columnWidths.size, DF_COLORS.size),
      formatField(used, columnWidths.used, DF_COLORS.used),
      formatField(avail, columnWidths.avail, DF_COLORS.avail),
      formatField(usePercent, columnWidths.percent, DF_COLORS.percent),
      `${DF_COLORS.mounted}${mounted}${DF_COLORS.reset}`
    ].join('')
  }

  // 如果格式不匹配，回退到原始行
  return line
}

// df 命令表头高亮（固定宽度列对齐）
const highlightDfHeaderPreserveSpacing = (line: string): string => {
  // 使用split代替复杂正则，性能更好
  const parts = line.split(/\s+/)

  // 检查是否是df表头格式（至少6个字段）
  if (parts.length >= 6) {
    const [filesystem, size, used, avail, usePercent, ...mountedParts] = parts
    const mounted = mountedParts.join(' ') // 处理挂载点中可能包含空格的情况

    // 定义固定列宽度（与数据行保持一致）
    const columnWidths = {
      filesystem: 12, // 文件系统列
      size: 8, // 大小列
      used: 8, // 已用列
      avail: 8, // 可用列
      percent: 6, // 使用率列
      mounted: 0 // 挂载点列（不限制宽度）
    }

    // 格式化每个字段，使用固定宽度
    const formatField = (text: string, width: number, color: string) => {
      const padded = text.padEnd(width)
      return `${color}${padded}${DF_COLORS.reset}`
    }

    // 构建固定宽度的表头
    return [
      formatField(filesystem, columnWidths.filesystem, DF_COLORS.header),
      formatField(size, columnWidths.size, DF_COLORS.header),
      formatField(used, columnWidths.used, DF_COLORS.header),
      formatField(avail, columnWidths.avail, DF_COLORS.header),
      formatField(usePercent, columnWidths.percent, DF_COLORS.header),
      `${DF_COLORS.header}${mounted}${DF_COLORS.reset}`
    ].join('')
  }

  // 如果格式不匹配，回退到原始行
  return line
}

// top/htop 命令系统信息高亮
const highlightTopSystemInfo = (line: string): string => {
  const { reset, header, success, warning, error, info, key } = COLORS
  let highlighted = line

  // 高亮时间信息
  highlighted = highlighted.replace(/(\d{2}:\d{2}:\d{2})/g, (match) => {
    return `${key}${match}${reset}`
  })

  // 高亮数字（负载、内存、CPU等）
  highlighted = highlighted.replace(/(\d+\.\d+)/g, (match) => {
    const num = parseFloat(match)
    let color = info // 默认蓝色
    if (num > 80) {
      color = error // 红色 - 高负载
    } else if (num > 50) {
      color = warning // 黄色 - 中等负载
    } else if (num > 0) {
      color = success // 绿色 - 低负载
    }
    return `${color}${match}${reset}`
  })

  // 高亮百分比
  highlighted = highlighted.replace(/(\d+\.\d+%)/g, (match) => {
    const num = parseFloat(match)
    let color = info // 默认蓝色
    if (num > 80) {
      color = error // 红色 - 高使用率
    } else if (num > 50) {
      color = warning // 黄色 - 中等使用率
    } else {
      color = success // 绿色 - 低使用率
    }
    return `${color}${match}${reset}`
  })

  // 高亮关键词
  highlighted = highlighted.replace(/(Tasks:|%Cpu\(s\):|MiB\s+Mem\s*:|MiB\s+Swap:|total|free|used|buff\/cache|avail)/g, (match) => {
    return `${header}${match}${reset}`
  })

  // 高亮状态词
  highlighted = highlighted.replace(/(running|sleeping|stopped|zombie|us|sy|ni|id|wa|hi|si|st)/g, (match) => {
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

  return highlighted
}

// top/htop 命令表头高亮（固定宽度列对齐）
const highlightTopHeaderPreserveSpacing = (line: string): string => {
  const reset = '\x1b[0m'
  const headerColor = '\x1b[36m' // 表头 - 青色

  // 使用split分割字段
  const parts = line.trim().split(/\s+/)

  // 检查是否是top表头格式
  if (parts.length >= 12) {
    const [pid, user, pr, ni, virt, res, shr, s, cpu, mem, time, ...commandParts] = parts
    const command = commandParts.join(' ')

    // 定义固定列宽度（与数据行保持一致）
    const columnWidths = {
      pid: 10, // PID列 - 增加宽度
      user: 8, // USER列
      pr: 5, // PR列 - 增加宽度
      ni: 5, // NI列 - 增加宽度
      virt: 10, // VIRT列 - 增加宽度
      res: 8, // RES列 - 增加宽度
      shr: 8, // SHR列 - 增加宽度
      s: 3, // S列 - 增加宽度
      cpu: 6, // %CPU列
      mem: 6, // %MEM列
      time: 8, // TIME+列
      command: 0 // COMMAND列（不限制宽度）
    }

    // 格式化每个字段，使用固定宽度
    const formatField = (text: string, width: number, color: string) => {
      const padded = text.padEnd(width)
      return `${color}${padded}${reset}`
    }

    // 重新构建表头，使用固定宽度对齐
    return [
      formatField(pid, columnWidths.pid, headerColor),
      formatField(user, columnWidths.user, headerColor),
      formatField(pr, columnWidths.pr, headerColor),
      formatField(ni, columnWidths.ni, headerColor),
      formatField(virt, columnWidths.virt, headerColor),
      formatField(res, columnWidths.res, headerColor),
      formatField(shr, columnWidths.shr, headerColor),
      formatField(s, columnWidths.s, headerColor),
      formatField(cpu, columnWidths.cpu, headerColor),
      formatField(mem, columnWidths.mem, headerColor),
      formatField(time, columnWidths.time, headerColor),
      `${headerColor}${command}${reset}`
    ].join('')
  }

  // 如果格式不匹配，回退到原始行
  return line
}

// top/htop 命令输出高亮（另一种格式：USER PR PID VIRT RES SHR S %CPU %MEM TIME COMMAND）
const highlightTopOutputAlternativeFormat = (line: string): string => {
  const reset = '\x1b[0m'

  // 使用split分割字段，避免复杂正则匹配
  const parts = line.trim().split(/\s+/)

  // 检查是否是top数据行格式（至少11个字段）
  if (parts.length >= 11) {
    const [user, pr, pid, virt, res, shr, s, cpu, mem, time, ...commandParts] = parts
    const command = commandParts.join(' ')

    // 定义固定列宽度（与主函数保持一致）
    const columnWidths = {
      user: 8, // USER列
      pr: 5, // PR列 - 与主函数保持一致
      pid: 10, // PID列 - 与主函数保持一致
      virt: 10, // VIRT列 - 与主函数保持一致
      res: 8, // RES列 - 与主函数保持一致
      shr: 8, // SHR列 - 与主函数保持一致
      s: 3, // S列 - 与主函数保持一致
      cpu: 6, // %CPU列
      mem: 6, // %MEM列
      time: 8, // TIME列
      command: 0 // COMMAND列（不限制宽度）
    }

    // 定义颜色
    const userColor = '\x1b[31m' // USER - 红色
    const prColor = '\x1b[33m' // PR - 黄色
    const pidColor = '\x1b[32m' // PID - 绿色
    const memoryColor = '\x1b[36m' // 内存相关 - 青色
    const statusColor = '\x1b[33m' // 状态 - 黄色
    const timeColor = '\x1b[35m' // 时间 - 紫色
    const commandColor = '\x1b[34m' // 命令 - 蓝色

    // 根据数值确定CPU和内存颜色
    const cpuPercent = parseFloat(cpu)
    let cpuColor = '\x1b[32m' // 默认绿色
    if (cpuPercent > 80) {
      cpuColor = '\x1b[91m' // 高使用率 - 亮红色
    } else if (cpuPercent > 50) {
      cpuColor = '\x1b[33m' // 中等使用率 - 黄色
    }

    const memPercent = parseFloat(mem)
    let memColor = '\x1b[32m' // 默认绿色
    if (memPercent > 80) {
      memColor = '\x1b[91m' // 高使用率 - 亮红色
    } else if (memPercent > 50) {
      memColor = '\x1b[33m' // 中等使用率 - 黄色
    }

    // 格式化每个字段，使用固定宽度
    const formatField = (text: string, width: number, color: string) => {
      const padded = text.padEnd(width)
      return `${color}${padded}${reset}`
    }

    // 重新构建行，使用固定宽度对齐
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

  // 如果格式不匹配，回退到原始行
  return line
}

// top/htop 命令输出高亮（保留原始空格）
const highlightTopOutputPreserveSpacing = (line: string): string => {
  const reset = '\x1b[0m'

  // 使用split分割字段，避免复杂正则匹配
  const parts = line.trim().split(/\s+/)

  // 检查是否是top数据行格式（至少12个字段）
  if (parts.length >= 12) {
    const [pid, user, pr, ni, virt, res, shr, s, cpu, mem, time, ...commandParts] = parts
    const command = commandParts.join(' ')

    // 定义固定列宽度（基于top命令的典型输出）
    const columnWidths = {
      pid: 10, // PID列 - 增加宽度
      user: 8, // USER列
      pr: 5, // PR列 - 增加宽度
      ni: 5, // NI列 - 增加宽度
      virt: 10, // VIRT列 - 增加宽度
      res: 8, // RES列 - 增加宽度
      shr: 8, // SHR列 - 增加宽度
      s: 3, // S列 - 增加宽度
      cpu: 6, // %CPU列
      mem: 6, // %MEM列
      time: 8, // TIME+列
      command: 0 // COMMAND列（不限制宽度）
    }

    // 定义颜色
    const pidColor = '\x1b[32m' // PID - 绿色
    const userColor = '\x1b[31m' // USER - 红色
    const memoryColor = '\x1b[36m' // 内存相关 - 青色
    const statusColor = '\x1b[33m' // 状态 - 黄色
    const timeColor = '\x1b[35m' // 时间 - 紫色
    const commandColor = '\x1b[34m' // 命令 - 蓝色

    // 根据数值确定CPU和内存颜色
    const cpuPercent = parseFloat(cpu)
    let cpuColor = '\x1b[32m' // 默认绿色
    if (cpuPercent > 80) {
      cpuColor = '\x1b[91m' // 高使用率 - 亮红色
    } else if (cpuPercent > 50) {
      cpuColor = '\x1b[33m' // 中等使用率 - 黄色
    }

    const memPercent = parseFloat(mem)
    let memColor = '\x1b[32m' // 默认绿色
    if (memPercent > 80) {
      memColor = '\x1b[91m' // 高使用率 - 亮红色
    } else if (memPercent > 50) {
      memColor = '\x1b[33m' // 中等使用率 - 黄色
    }

    // 格式化每个字段，使用固定宽度
    const formatField = (text: string, width: number, color: string) => {
      const padded = text.padEnd(width)
      return `${color}${padded}${reset}`
    }

    // 重新构建行，使用固定宽度对齐
    return [
      formatField(pid, columnWidths.pid, pidColor),
      formatField(user, columnWidths.user, userColor),
      formatField(pr, columnWidths.pr, reset),
      formatField(ni, columnWidths.ni, reset),
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

  // 如果格式不匹配，回退到原始行
  return line
}

// top/htop 命令输出高亮

// tail/head 命令输出高亮
const highlightTailOutput = (line: string): string => {
  const reset = '\x1b[0m'
  let highlighted = line

  // 高亮文件名
  highlighted = highlighted.replace(REGEX_PATTERNS.tailFile, `==> \x1b[34m$1${reset} <==`)

  // 高亮行号
  highlighted = highlighted.replace(REGEX_PATTERNS.tailLine, `\x1b[33m$1${reset} `)

  return highlighted
}

// 简单 ls 输出高亮
const highlightSimpleLsOutput = (line: string): string => {
  const parts = line.trim().split(/\s+/)
  const highlightedParts = parts.map((part) => {
    if (part.endsWith('/')) {
      return `\x1b[34m${part}\x1b[0m` // 目录 - 蓝色
    } else if (part.includes('.')) {
      // 根据文件扩展名设置不同颜色
      if (REGEX_PATTERNS.codeFiles.test(part)) {
        return `\x1b[36m${part}\x1b[0m` // 代码文件 - 青色
      } else if (REGEX_PATTERNS.imageFiles.test(part)) {
        return `\x1b[35m${part}\x1b[0m` // 图片文件 - 紫色
      } else if (REGEX_PATTERNS.archiveFiles.test(part)) {
        return `\x1b[33m${part}\x1b[0m` // 压缩文件 - 黄色
      } else {
        return `\x1b[32m${part}\x1b[0m` // 其他文件 - 绿色
      }
    } else {
      return `\x1b[37m${part}\x1b[0m` // 其他 - 白色
    }
  })
  return highlightedParts.join(' ')
}

// 提取终端输出内容（保留ANSI转义序列）
const extractTerminalOutput = (content: string): string => {
  if (!content || typeof content !== 'string') {
    return content
  }

  // 尝试匹配各种可能的终端输出格式
  const patterns = [
    /Terminal output:\n```\n([\s\S]*?)\n```/,
    /```\n([\s\S]*?)\n```/,
    /```([\s\S]*?)```/,
    // 匹配 agent 模式的格式
    /# Executing result on .*?:命令已执行。\nOutput:\n([\s\S]*?)(?:\n\[Exit Code:|$)/,
    // 匹配 netstat 命令输出
    /Active Internet connections[^\n]*\n([\s\S]*?)(?:\n\[Exit Code:|$)/,
    // 匹配 command 模式的格式（直接是终端输出）
    /^[^\n]*\n(.*)$/s
  ]

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i]
    const match = content.match(pattern)
    if (match && match[1]) {
      const extracted = match[1] // 不进行 trim()，保留原始空格

      // 保留所有内容，不进行去重处理（网络连接可能有重复）
      const uniqueContent = extracted

      // 添加语法高亮
      const highlighted = addTerminalSyntaxHighlighting(uniqueContent)
      return highlighted
    }
  }

  // 如果没有匹配到代码块，直接返回原内容并添加高亮
  return addTerminalSyntaxHighlighting(content)
}

// 写入内容到终端
const writeToTerminal = (content: string) => {
  if (!terminal) {
    return
  }

  // 提取终端输出（保留ANSI转义序列）
  const terminalContent = extractTerminalOutput(content)

  // 防止重复写入相同内容
  if (lastContent === terminalContent) {
    return
  }

  // 清空终端并重置光标位置
  terminal.clear()
  terminal.reset()

  // 只去除末尾的完全空行，保留包含空格的行的原始格式
  const cleanContent = terminalContent.replace(/\n+$/, '')

  // 写入内容（保留ANSI转义序列）
  terminal.write(cleanContent)

  // 调整终端大小以适应容器
  nextTick(() => {
    if (fitAddon) {
      fitAddon.fit()
    }
  })

  // 更新最后写入的内容
  lastContent = terminalContent

  // 计算行数
  outputLines.value = cleanContent.split('\n').length

  // 根据内容调整终端高度
  nextTick(() => {
    // 直接使用内容行数来调整高度
    const contentLines = cleanContent.split('\n').length
    const minRows = 2
    const maxRows = 30
    const actualRows = Math.max(minRows, Math.min(maxRows, contentLines))

    if (terminal) {
      // 计算最长行长度，设置足够的列数避免自动换行
      const lines = cleanContent.split('\n')
      const maxLineLength = Math.max(...lines.map((line) => line.length))
      const cols = Math.max(maxLineLength + 50, 120) // 给一些额外的空间

      if (fitAddon) {
        fitAddon.fit()
        terminal.resize(cols, actualRows)
      } else {
        terminal.resize(cols, actualRows)
      }
    }

    if (terminalContainer.value) {
      // 动态测量单行高度，避免末尾出现多余空白，并包含容器上下内边距
      const rowEl = terminalContainer.value.querySelector('.xterm-rows > div') as HTMLElement | null
      let rowHeight = rowEl ? rowEl.getBoundingClientRect().height : 18
      // 一些缩放/渲染环境下会出现小数像素，向上取整避免裁切
      rowHeight = Math.ceil(rowHeight)
      // 读取容器的上下 padding，以保证首/尾行与容器有间距
      const styles = window.getComputedStyle(terminalContainer.value)
      const paddingTop = parseFloat(styles.paddingTop) || 0
      const paddingBottom = parseFloat(styles.paddingBottom) || 0
      // 加一个 1px 缓冲，避免尾行被遮挡
      const newHeight = actualRows * rowHeight + paddingTop + paddingBottom + 1
      terminalContainer.value.style.height = `${newHeight}px`
    }
  })
}

// 复制输出内容
const copyOutput = () => {
  if (!terminal) return

  const selection = terminal.getSelection()
  const content =
    selection || Array.from({ length: terminal?.rows || 0 }, (_, i) => terminal?.buffer.active.getLine(i)?.translateToString() || '').join('\n')

  navigator.clipboard.writeText(content).then(() => {
    message.success(t('ai.copyToClipboard'))
  })
}

// 切换展开/收起
const toggleOutput = () => {
  isExpanded.value = !isExpanded.value
  if (isExpanded.value) {
    nextTick(() => {
      // 展开后根据内容重新计算行高与列宽，避免纵向滚动
      adjustTerminalHeight()
    })
  }
}

// 监听内容变化
watch(
  () => props.content,
  (newContent) => {
    if (newContent && terminal) {
      writeToTerminal(newContent)
    }
  },
  { immediate: false }
)

// 监听窗口大小变化
const handleResize = () => {
  if (isExpanded.value) {
    // 窗口变化时根据内容重算高度与列数，保持纵向无滚动
    adjustTerminalHeight()
  }
}

onMounted(async () => {
  await initTerminal()
  // 终端初始化完成后，如果有内容就写入
  if (props.content && terminal) {
    writeToTerminal(props.content)
  }
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  if (terminal) {
    terminal.dispose()
  }
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.terminal-output-container {
  margin: 10px 0; /* 上下间距 10px */
  border-radius: 6px;
  overflow: hidden;
  background-color: var(--command-output-bg);
  min-height: 40px; /* 设置最小高度以适应2行内容 */
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

.toggle-button {
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

.toggle-button:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
}

.terminal-output {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  background-color: #1e1e1e !important;
  color: #d4d4d4 !important;
  border-radius: 0 0 8px 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  border-top: none;
  /* 仅横向滚动，纵向不滚动 */
  overflow-x: auto;
  overflow-y: hidden;
  position: relative;
  width: 100%;
  max-width: 100%;
  height: auto;
  /* 去掉最大高度限制，全部纵向展示 */
  padding: 8px 8px; /* 增加上下内边距，让首/尾行与容器有一点间距（略宽松） */
}

/* 移除 xterm 默认内边距，避免视觉上"多一行" */
:deep(.xterm-viewport) {
  padding: 0 !important;
  /* 仅横向滚动 */
  overflow-x: auto !important;
  overflow-y: hidden !important;
}

:deep(.xterm-screen) {
  padding: 0 !important;
}

/* 确保 xterm 正常显示 */
:deep(.xterm) {
  /* 仅横向滚动，不允许纵向滚动 */
  overflow-x: auto !important;
  overflow-y: hidden !important;
  white-space: pre !important; /* 保持等宽与原始空格，不强制换行 */
}

/* xterm-rows 保持默认行为，让 xterm.js 正常处理空格 */

.terminal-container {
  background-color: #1e1e1e;
  padding: 4px 8px; /* 减少上下内边距 */
  border-radius: 0 0 8px 8px;
  font-size: 11px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  border-top: none;
  overflow: visible; /* 由子元素控制滚动 */
  position: relative;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  height: auto;
  min-height: 40px; /* 设置最小高度为2行 */
}

.terminal-container .xterm {
  width: 100% !important;
  height: auto !important;
  min-height: 40px !important; /* 2行最小高度 */
  max-height: 600px !important; /* 设置最大高度，超出部分显示滚动条 */
}

.terminal-container .xterm .xterm-viewport {
  /* 仅横向滚动 */
  overflow-x: auto;
  overflow-y: hidden;
  min-height: 40px; /* 2行最小高度 */
}

:deep(.xterm .xterm-cursor) {
  display: none !important; /* 隐藏光标（DOM 渲染器）*/
}

/* 隐藏所有可能的光标相关元素（Canvas/WebGL 渲染器）*/
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

/* 确保终端样式正确 */
:deep(.xterm) {
  height: 100%;
}

:deep(.xterm-viewport) {
  background-color: var(--bg-color-secondary) !important;
}

:deep(.xterm-screen) {
  background-color: var(--bg-color-secondary) !important;
}
</style>
