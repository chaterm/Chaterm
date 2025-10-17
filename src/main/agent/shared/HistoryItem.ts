export type HistoryItem = {
  id: string
  ts: number
  task: string // Original full task description
  chatTitle?: string // Optional LLM-generated short title for display
  tokensIn: number
  tokensOut: number
  cacheWrites?: number
  cacheReads?: number
  totalCost: number

  size?: number
  shadowGitConfigWorkTree?: string
  conversationHistoryDeletedRange?: [number, number]
  isFavorited?: boolean
}
