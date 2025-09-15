/**
 * 命令解析器
 * 用于解析命令结构，避免误判
 */

export interface ParsedCommand {
  executable: string
  args: string[]
  isCompound: boolean
  compounds?: ParsedCommand[]
}

export class CommandParser {
  /**
   * 解析命令字符串为结构化对象
   */
  parse(commandStr: string): ParsedCommand {
    // 去除前后空格
    const trimmedCommand = commandStr.trim()

    // 检查是否为复合命令
    if (this.isCompoundCommand(trimmedCommand)) {
      return this.parseCompoundCommand(trimmedCommand)
    }

    // 解析基本命令
    return this.parseBasicCommand(trimmedCommand)
  }

  /**
   * 解析基本命令
   */
  private parseBasicCommand(commandStr: string): ParsedCommand {
    // 将命令拆分为词组，保留引号内的整体
    const tokens = this.tokenizeCommand(commandStr)

    if (tokens.length === 0) {
      return {
        executable: '',
        args: [],
        isCompound: false
      }
    }

    // 第一个词组是可执行文件/命令名
    const executable = tokens[0]

    // 剩余的词组是参数
    const args = tokens.slice(1)

    return {
      executable,
      args,
      isCompound: false
    }
  }

  /**
   * 解析复合命令
   */
  private parseCompoundCommand(commandStr: string): ParsedCommand {
    // 查找分隔符位置（&&, ||, ;）
    const compounds: ParsedCommand[] = []
    let currentPos = 0
    let inQuotes = false
    let quoteChar = ''

    for (let i = 0; i < commandStr.length; i++) {
      const char = commandStr[i]

      // 处理引号
      if ((char === '"' || char === "'") && (i === 0 || commandStr[i - 1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true
          quoteChar = char
        } else if (char === quoteChar) {
          inQuotes = false
        }
      }

      // 只在不在引号内的情况下检查分隔符
      if (!inQuotes) {
        if (
          (char === '&' && i + 1 < commandStr.length && commandStr[i + 1] === '&') ||
          (char === '|' && i + 1 < commandStr.length && commandStr[i + 1] === '|') ||
          char === ';'
        ) {
          // 找到分隔符，解析前面的命令
          const subCommand = commandStr.substring(currentPos, i).trim()
          if (subCommand) {
            compounds.push(this.parse(subCommand))
          }

          // 更新当前位置
          currentPos = char === ';' ? i + 1 : i + 2

          // 跳过第二个字符（如果是 && 或 ||）
          if (char !== ';') {
            i++
          }
        }
      }
    }

    // 处理最后一个子命令
    const lastSubCommand = commandStr.substring(currentPos).trim()
    if (lastSubCommand) {
      compounds.push(this.parse(lastSubCommand))
    }

    // 创建复合命令对象
    return {
      executable: compounds.length > 0 ? compounds[0].executable : '',
      args: [],
      isCompound: true,
      compounds
    }
  }

  /**
   * 将命令拆分为词组，保留引号内的整体
   */
  private tokenizeCommand(commandStr: string): string[] {
    const tokens: string[] = []
    let currentToken = ''
    let inQuotes = false
    let quoteChar = ''

    for (let i = 0; i < commandStr.length; i++) {
      const char = commandStr[i]

      // 处理引号
      if ((char === '"' || char === "'") && (i === 0 || commandStr[i - 1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true
          quoteChar = char
          // 不将引号添加到词组中
        } else if (char === quoteChar) {
          inQuotes = false
          // 不将引号添加到词组中
          continue
        } else {
          currentToken += char
        }
      }
      // 处理空格
      else if (char === ' ' && !inQuotes) {
        if (currentToken) {
          tokens.push(currentToken)
          currentToken = ''
        }
      }
      // 其他字符
      else {
        currentToken += char
      }
    }

    // 添加最后一个词组
    if (currentToken) {
      tokens.push(currentToken)
    }

    return tokens
  }

  /**
   * 检查是否为复合命令
   */
  private isCompoundCommand(commandStr: string): boolean {
    // 检查是否包含 && 或 || 或 ;
    for (let i = 0; i < commandStr.length; i++) {
      const char = commandStr[i]

      if (
        (char === '&' && i + 1 < commandStr.length && commandStr[i + 1] === '&') ||
        (char === '|' && i + 1 < commandStr.length && commandStr[i + 1] === '|') ||
        char === ';'
      ) {
        // 确保不在引号内
        if (!this.isInsideQuotes(commandStr, i)) {
          return true
        }
      }
    }

    return false
  }

  /**
   * 检查字符是否在引号内
   */
  private isInsideQuotes(str: string, pos: number): boolean {
    let inQuotes = false
    let quoteChar = ''

    for (let i = 0; i < pos; i++) {
      const char = str[i]

      if ((char === '"' || char === "'") && (i === 0 || str[i - 1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true
          quoteChar = char
        } else if (char === quoteChar) {
          inQuotes = false
        }
      }
    }

    return inQuotes
  }
}
