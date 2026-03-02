export interface CommandSuggestion {
  command: string
  explanation?: string
  source: 'base' | 'history' | 'ai'
}
