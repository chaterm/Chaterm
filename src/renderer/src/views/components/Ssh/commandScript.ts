export type ParsedCommand =
  | { type: 'COMMAND'; payload: string }
  | { type: 'SLEEP'; payload: number }
  | { type: 'KEY'; payload: 'esc' | 'tab' | 'return' | 'backspace' }

const keyMap = {
  esc: '\x1b',
  tab: '\t',
  return: '\r',
  backspace: '\b'
}

/**
 * Parses a multi-line script into a sequence of commands.
 * @param text The script text to parse.
 */
function parseSshScript(text: string): ParsedCommand[] {
  const lines = text.split(/\r\n|\n|\r/)
  const commands: ParsedCommand[] = []

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (trimmedLine === '') {
      continue // Skip empty lines
    }

    const sleepMatch = trimmedLine.match(/^sleep==(\d+)$/i)
    if (sleepMatch) {
      commands.push({ type: 'SLEEP', payload: parseInt(sleepMatch[1], 10) })
      continue
    }

    const lowerLine = trimmedLine.toLowerCase()
    if (lowerLine === 'esc' || lowerLine === 'tab' || lowerLine === 'return' || lowerLine === 'backspace') {
      commands.push({ type: 'KEY', payload: lowerLine as 'esc' | 'tab' | 'return' | 'backspace' })
      continue
    }

    commands.push({ type: 'COMMAND', payload: trimmedLine })
  }

  return commands
}

/**
 * Executes a parsed script against a given terminal instance.
 * @param commands The array of command objects from the parser.
 * @param terminal The terminal instance to write to.
 */
async function executeParsedCommands(commands: ParsedCommand[], terminal: { write: (data: string) => void }, autoExecute: boolean) {
  // Find the index of the last COMMAND
  let lastCommandIndex = -1
  for (let i = commands.length - 1; i >= 0; i--) {
    if (commands[i].type === 'COMMAND') {
      lastCommandIndex = i
      break
    }
  }

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    switch (cmd.type) {
      case 'COMMAND': {
        const isLast = i === lastCommandIndex
        const suffix = isLast && !autoExecute ? '' : '\r'
        terminal.write(cmd.payload + suffix) // Send command with optional carriage return
        break
      }
      case 'SLEEP':
        await new Promise((resolve) => setTimeout(resolve, cmd.payload))
        break
      case 'KEY':
        terminal.write(keyMap[cmd.payload])
        break
    }
    // Add a small delay between commands to ensure the server can keep up
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/**
 * Parses and executes a script in the given terminal.
 * This is the main function to be called from the UI.
 * @param scriptContent The raw string content of the script.
 * @param terminal The terminal instance to execute the script in.
 * @param autoExecute Whether to execute the last command (append \r). Default is true.
 */
export async function executeScript(scriptContent: string, terminal: { write: (data: string) => void }, autoExecute: boolean = true) {
  const commands = parseSshScript(scriptContent)
  await executeParsedCommands(commands, terminal, autoExecute)
}
