export type ParsedCommand =
  | { type: 'COMMAND'; payload: string }
  | { type: 'SLEEP'; payload: number }
  | { type: 'KEY'; payload: 'esc' | 'tab' | 'return' | 'backspace' | 'up' | 'down' | 'left' | 'right' }
  | { type: 'CTRL'; payload: string }

const keyMap = {
  esc: '\x1b',
  tab: '\t',
  return: '\r',
  backspace: '\b',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D'
}

const ctrlKeyMap: { [key: string]: string } = {
  'ctrl+a': '\x01',
  'ctrl+b': '\x02',
  'ctrl+c': '\x03',
  'ctrl+d': '\x04',
  'ctrl+e': '\x05',
  'ctrl+f': '\x06',
  'ctrl+g': '\x07',
  'ctrl+h': '\x08',
  'ctrl+k': '\x0b',
  'ctrl+l': '\x0c',
  'ctrl+n': '\x0e',
  'ctrl+p': '\x10',
  'ctrl+r': '\x12',
  'ctrl+t': '\x14',
  'ctrl+u': '\x15',
  'ctrl+w': '\x17',
  'ctrl+z': '\x1a'
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

    // Skip empty lines
    if (trimmedLine === '') {
      continue
    }

    // Skip comments (lines starting with # or //)
    if (trimmedLine.startsWith('#') || trimmedLine.startsWith('//')) {
      continue
    }

    // Check for sleep command
    const sleepMatch = trimmedLine.match(/^sleep==(\d+)$/i)
    if (sleepMatch) {
      commands.push({ type: 'SLEEP', payload: parseInt(sleepMatch[1], 10) })
      continue
    }

    const lowerLine = trimmedLine.toLowerCase()

    // Check for Ctrl key combinations
    if (lowerLine.startsWith('ctrl+') && ctrlKeyMap[lowerLine]) {
      commands.push({ type: 'CTRL', payload: lowerLine })
      continue
    }

    // Check for special keys
    if (lowerLine === 'esc' || lowerLine === 'tab' || lowerLine === 'return' || lowerLine === 'backspace') {
      commands.push({ type: 'KEY', payload: lowerLine as 'esc' | 'tab' | 'return' | 'backspace' })
      continue
    }

    // Check for arrow keys
    if (lowerLine === 'up' || lowerLine === 'down' || lowerLine === 'left' || lowerLine === 'right') {
      commands.push({ type: 'KEY', payload: lowerLine as 'up' | 'down' | 'left' | 'right' })
      continue
    }

    // Default to command
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
      case 'CTRL':
        terminal.write(ctrlKeyMap[cmd.payload])
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
