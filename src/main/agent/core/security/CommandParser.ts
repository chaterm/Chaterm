/**
 * Command parser
 * Used to parse command structure, avoid misjudgment
 */

export interface ParsedCommand {
  executable: string
  args: string[]
  isCompound: boolean
  compounds?: ParsedCommand[]
}

export class CommandParser {
  /**
   * Parse command string into structured object
   */
  parse(commandStr: string): ParsedCommand {
    // Remove leading and trailing spaces
    const trimmedCommand = commandStr.trim()

    // Check if it's a compound command
    if (this.isCompoundCommand(trimmedCommand)) {
      return this.parseCompoundCommand(trimmedCommand)
    }

    // Parse basic command
    return this.parseBasicCommand(trimmedCommand)
  }

  /**
   * Parse basic command
   */
  private parseBasicCommand(commandStr: string): ParsedCommand {
    // Split command into tokens, preserve quoted content as whole
    const tokens = this.tokenizeCommand(commandStr)

    if (tokens.length === 0) {
      return {
        executable: '',
        args: [],
        isCompound: false
      }
    }

    // First token is executable/command name
    const executable = tokens[0]

    // Remaining tokens are arguments
    const args = tokens.slice(1)

    return {
      executable,
      args,
      isCompound: false
    }
  }

  /**
   * Parse compound command
   */
  private parseCompoundCommand(commandStr: string): ParsedCommand {
    // Find separator positions (&&, ||, ;)
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

      // Only check separator when not inside quotes
      if (!inQuotes) {
        if (
          (char === '&' && i + 1 < commandStr.length && commandStr[i + 1] === '&') ||
          (char === '|' && i + 1 < commandStr.length && commandStr[i + 1] === '|') ||
          char === ';'
        ) {
          // Found separator, parse preceding command
          const subCommand = commandStr.substring(currentPos, i).trim()
          if (subCommand) {
            compounds.push(this.parse(subCommand))
          }

          // Update current position
          currentPos = char === ';' ? i + 1 : i + 2

          // Skip second character (if && or ||)
          if (char !== ';') {
            i++
          }
        }
      }
    }

    // Handle last sub-command
    const lastSubCommand = commandStr.substring(currentPos).trim()
    if (lastSubCommand) {
      compounds.push(this.parse(lastSubCommand))
    }

    // Create compound command object
    return {
      executable: compounds.length > 0 ? compounds[0].executable : '',
      args: [],
      isCompound: true,
      compounds
    }
  }

  /**
   * Split command into tokens, preserve quoted content as whole
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
          // Don't add quote to token
        } else if (char === quoteChar) {
          inQuotes = false
          // Don't add quote to token
          continue
        } else {
          currentToken += char
        }
      }
      // Handle spaces
      else if (char === ' ' && !inQuotes) {
        if (currentToken) {
          tokens.push(currentToken)
          currentToken = ''
        }
      }
      // Other characters
      else {
        currentToken += char
      }
    }

    // Add last token
    if (currentToken) {
      tokens.push(currentToken)
    }

    return tokens
  }

  /**
   * Check if it's a compound command
   */
  private isCompoundCommand(commandStr: string): boolean {
    // Check if contains && or || or ;
    for (let i = 0; i < commandStr.length; i++) {
      const char = commandStr[i]

      if (
        (char === '&' && i + 1 < commandStr.length && commandStr[i + 1] === '&') ||
        (char === '|' && i + 1 < commandStr.length && commandStr[i + 1] === '|') ||
        char === ';'
      ) {
        // Ensure not inside quotes
        if (!this.isInsideQuotes(commandStr, i)) {
          return true
        }
      }
    }

    return false
  }

  /**
   * Check if character is inside quotes
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
