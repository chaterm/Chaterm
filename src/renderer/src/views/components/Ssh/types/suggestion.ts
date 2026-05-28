export interface CommandSuggestion {
  command: string
  displayLabel?: string
  explanation?: string
  source: 'base' | 'history' | 'ai' | 'subcommand' | 'option' | 'arg' | 'command'
}
