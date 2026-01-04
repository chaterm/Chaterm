//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

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
