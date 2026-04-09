//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

import { getContextWindowInfo } from './context-window-utils'
import { getFormatResponse } from '../../prompts/responses'
import { saveContextHistoryStorage, ensureTaskExists, getContextHistoryStorage } from '../../storage/disk'
import { ChatermApiReqInfo, ChatermMessage } from '../../../shared/ExtensionMessage'
import { ApiHandler } from '../../../api'
import { Anthropic } from '@anthropic-ai/sdk'
const logger = createLogger('agent')

/**
 * Represents a text override applied to the first assistant message (index 1).
 * Used to insert a truncation notice or context summary when conversation history is truncated.
 */
interface TruncationNotice {
  timestamp: number
  text: string
}

export class ContextManager {
  // The truncation notice or context summary that replaces the first assistant message's
  // text content when conversation history is truncated to free context window space.
  private truncationNotice: TruncationNotice | null = null
  private responseFormatter: ReturnType<typeof getFormatResponse>

  constructor(language: string = 'en-US') {
    this.responseFormatter = getFormatResponse(language)
  }

  /**
   * Update the language used for formatting responses.
   */
  setLanguage(language: string) {
    this.responseFormatter = getFormatResponse(language)
  }

  /**
   * Load truncation notice from disk, if it exists.
   */
  async initializeContextHistory(taskId: string) {
    this.truncationNotice = await this.loadFromDisk(taskId)
  }

  private async loadFromDisk(taskId: string): Promise<TruncationNotice | null> {
    try {
      if (await ensureTaskExists(taskId)) {
        const raw = await getContextHistoryStorage(taskId)
        if (!raw) return null

        const data = typeof raw === 'string' ? JSON.parse(raw) : raw

        // v2 format: plain object with version field
        if (data.version === 2) {
          return data.truncationNotice ?? null
        }

        // v1 legacy format: nested arrays — migrate
        return this.migrateLegacyFormat(data)
      }
    } catch (error) {
      logger.error('Failed to load context history', { error: error })
    }
    return null
  }

  /**
   * Migrate v1 nested-array format to TruncationNotice.
   * v1 structure: [[messageIndex, [messageType, [[blockIndex, [[timestamp, updateType, [text], metadata], ...]]]]]]
   * We only need the latest update at messageIndex=1, blockIndex=0.
   */
  private migrateLegacyFormat(data: unknown): TruncationNotice | null {
    if (!Array.isArray(data)) return null
    const entry = data.find(([idx]: [number]) => idx === 1)
    if (!entry) return null
    const innerMapArray = entry[1]?.[1]
    if (!Array.isArray(innerMapArray)) return null
    const blockEntry = innerMapArray.find(([idx]: [number]) => idx === 0)
    if (!blockEntry) return null
    const updates = blockEntry[1]
    if (!Array.isArray(updates) || updates.length === 0) return null
    const latest = updates[updates.length - 1]
    return { timestamp: latest[0], text: latest[2]?.[0] ?? '' }
  }

  private async saveToDisk(taskId: string) {
    try {
      const data = { version: 2, truncationNotice: this.truncationNotice }
      saveContextHistoryStorage(taskId, data)
    } catch (error) {
      logger.error('Failed to save context history', { error: error })
    }
  }

  /**
   * Check whether the conversation needs truncation based on the previous API request's token usage.
   * Call this before getNewContextMessagesAndMetadata() to send a UI notification before the
   * potentially slow truncation + summarization process begins.
   */
  needsTruncation(chatermMessages: ChatermMessage[], api: ApiHandler, previousApiReqIndex: number): boolean {
    if (previousApiReqIndex < 0) return false
    const previousRequest = chatermMessages[previousApiReqIndex]
    if (!previousRequest?.text) return false
    try {
      const { tokensIn, tokensOut, cacheWrites, cacheReads }: ChatermApiReqInfo = JSON.parse(previousRequest.text)
      const totalTokens = (tokensIn || 0) + (tokensOut || 0) + (cacheWrites || 0) + (cacheReads || 0)
      const { maxAllowedSize } = getContextWindowInfo(api)
      return totalTokens >= maxAllowedSize
    } catch {
      return false
    }
  }

  /**
   * Primary entry point for getting up to date context & truncating when required.
   */
  async getNewContextMessagesAndMetadata(
    apiConversationHistory: Anthropic.Messages.MessageParam[],
    chatermMessages: ChatermMessage[],
    api: ApiHandler,
    conversationHistoryDeletedRange: [number, number] | undefined,
    previousApiReqIndex: number,
    taskId: string
  ) {
    let updatedConversationHistoryDeletedRange = false

    if (this.needsTruncation(chatermMessages, api, previousApiReqIndex)) {
      const timestamp = chatermMessages[previousApiReqIndex].ts

      const keepCount = 2
      const nextRange = this.getNextTruncationRange(apiConversationHistory, conversationHistoryDeletedRange, 'lastN', keepCount)
      const removeCount = nextRange[1] - nextRange[0] + 1

      if (removeCount > 0) {
        let anyContextUpdates = false

        const existingSummary = this.getExistingSummary()
        const summary = await this.summarizeMessagesBeforeTruncation(apiConversationHistory, nextRange[0], nextRange[1], api, existingSummary)
        if (summary) {
          anyContextUpdates = this.updateContextSummary(timestamp, summary)
        }
        if (!anyContextUpdates) {
          anyContextUpdates = this.applyStandardContextTruncationNoticeChange(timestamp)
        }

        conversationHistoryDeletedRange = nextRange
        updatedConversationHistoryDeletedRange = true

        if (anyContextUpdates) {
          await this.saveToDisk(taskId)
        }
      }
    }

    const truncatedConversationHistory = this.getAndAlterTruncatedMessages(apiConversationHistory, conversationHistoryDeletedRange)

    return {
      conversationHistoryDeletedRange: conversationHistoryDeletedRange,
      updatedConversationHistoryDeletedRange: updatedConversationHistoryDeletedRange,
      truncatedConversationHistory: truncatedConversationHistory
    }
  }

  /**
   * Calculate the range of messages to remove from conversation history.
   */
  public getNextTruncationRange(
    apiMessages: Anthropic.Messages.MessageParam[],
    currentDeletedRange: [number, number] | undefined,
    keep: 'none' | 'lastTwo' | 'lastN',
    keepCount?: number
  ): [number, number] {
    // We always keep the first user-assistant pairing, and truncate an even number of messages from there
    const startOfRest = currentDeletedRange ? currentDeletedRange[1] + 1 : 2 // inclusive starting index

    let keepMessages: number
    if (keep === 'none') {
      keepMessages = 0
    } else if (keep === 'lastTwo') {
      keepMessages = 2
    } else {
      keepMessages = keepCount ?? 8
    }
    const messagesToRemove = Math.max(apiMessages.length - startOfRest - keepMessages, 0)

    let rangeEndIndex = startOfRest + messagesToRemove - 1 // inclusive ending index

    // Make sure that the last message being removed is an assistant message to preserve user-assistant structure.
    // if (apiMessages[rangeEndIndex].role !== 'assistant') {
    //   rangeEndIndex -= 1
    // }

    // this is an inclusive range that will be removed from the conversation history
    return [startOfRest, rangeEndIndex]
  }

  /**
   * Apply truncation (message deletion) and the truncation notice/summary to the message array.
   * Returns a new array with middle messages removed and the first assistant message updated.
   */
  private getAndAlterTruncatedMessages(
    messages: Anthropic.Messages.MessageParam[],
    deletedRange: [number, number] | undefined
  ): Anthropic.Messages.MessageParam[] {
    if (messages.length <= 1) return messages

    const startFromIndex = deletedRange ? deletedRange[1] + 1 : 2
    const firstChunk = messages.slice(0, 2)
    const secondChunk = messages.slice(startFromIndex)

    // Replace the first assistant message's text with the truncation notice/summary
    if (this.truncationNotice && firstChunk.length > 1) {
      const assistantMsg = structuredClone(firstChunk[1])
      const firstBlock = Array.isArray(assistantMsg.content) ? assistantMsg.content[0] : undefined
      if (firstBlock?.type === 'text') {
        firstBlock.text = this.truncationNotice.text
        firstChunk[1] = assistantMsg
      }
    }

    return [...firstChunk, ...secondChunk]
  }

  /**
   * If the truncation message already exists, does nothing, otherwise sets a standard notice.
   */
  async triggerApplyStandardContextTruncationNoticeChange(timestamp: number, taskId: string) {
    const updated = this.applyStandardContextTruncationNoticeChange(timestamp)
    if (updated) {
      await this.saveToDisk(taskId)
    }
  }

  private applyStandardContextTruncationNoticeChange(timestamp: number): boolean {
    if (!this.truncationNotice) {
      this.truncationNotice = { timestamp, text: this.responseFormatter.contextTruncationNotice() }
      return true
    }
    return false
  }

  private updateContextSummary(timestamp: number, summary: string): boolean {
    this.truncationNotice = { timestamp, text: this.responseFormatter.contextSummaryNotice(summary) }
    return true
  }

  private getExistingSummary(): string | null {
    if (!this.truncationNotice) return null
    const match = this.truncationNotice.text.match(/<context_summary>\n([\s\S]*?)\n<\/context_summary>/)
    return match ? match[1] : null
  }

  /**
   * Serialize messages in the given range into readable text for summarization.
   * Skips base64 image data and other non-text content.
   */
  private serializeMessagesForSummary(apiMessages: Anthropic.Messages.MessageParam[], rangeStart: number, rangeEnd: number): string {
    const parts: string[] = []
    const maxChars = 80_000

    for (let i = rangeStart; i <= rangeEnd && i < apiMessages.length; i++) {
      const msg = apiMessages[i]
      const role = msg.role === 'user' ? 'User' : 'Assistant'
      const content = msg.content

      if (typeof content === 'string') {
        parts.push(`${role}: ${content}`)
      } else if (Array.isArray(content)) {
        const textParts: string[] = []
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            textParts.push(block.text)
          } else if (block.type === 'tool_use') {
            const toolBlock = block as { name?: string; input?: unknown }
            textParts.push(`[Tool call: ${toolBlock.name || 'unknown'}]`)
          } else if (block.type === 'tool_result') {
            const resultBlock = block as { content?: unknown }
            if (typeof resultBlock.content === 'string') {
              textParts.push(`[Tool result]: ${resultBlock.content}`)
            } else if (Array.isArray(resultBlock.content)) {
              for (const inner of resultBlock.content) {
                const innerBlock = inner as { type?: string; text?: string }
                if (innerBlock.type === 'text' && innerBlock.text) {
                  textParts.push(`[Tool result]: ${innerBlock.text}`)
                }
              }
            }
          }
          // skip image blocks entirely
        }
        if (textParts.length > 0) {
          parts.push(`${role}: ${textParts.join('\n')}`)
        }
      }
    }

    let serialized = parts.join('\n\n')

    // Cap at maxChars to avoid overloading the summary call
    if (serialized.length > maxChars) {
      const halfBudget = Math.floor(maxChars / 2) - 50
      serialized =
        serialized.slice(0, halfBudget) + '\n\n[... middle portion omitted for brevity ...]\n\n' + serialized.slice(serialized.length - halfBudget)
    }

    return serialized
  }

  /**
   * Call the LLM to summarize messages that are about to be truncated.
   * Returns the summary string, or null if summarization fails or is not worthwhile.
   */
  private async summarizeMessagesBeforeTruncation(
    apiMessages: Anthropic.Messages.MessageParam[],
    rangeStart: number,
    rangeEnd: number,
    api: ApiHandler,
    existingSummary?: string | null
  ): Promise<string | null> {
    try {
      const serialized = this.serializeMessagesForSummary(apiMessages, rangeStart, rangeEnd)
      if (!serialized || serialized.length < 100) {
        return null
      }

      const userContent = this.responseFormatter.preTruncationSummaryUserContent(serialized, existingSummary)

      const summaryMessages: Anthropic.Messages.MessageParam[] = [
        {
          role: 'user',
          content: userContent
        }
      ]

      const stream = api.createMessage(this.responseFormatter.preTruncationSummaryPrompt(), summaryMessages)
      // Collect the full response with a 30-second timeout.
      // On timeout, close the stream so it stops consuming API resources.
      let timedOut = false
      const collectResponse = async (): Promise<string> => {
        const chunks: string[] = []
        for await (const chunk of stream) {
          if (timedOut) {
            break
          }
          if (chunk.type === 'text') {
            chunks.push(chunk.text)
          }
        }
        return chunks.join('')
      }

      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => {
          timedOut = true
          // Terminate the async generator so the provider connection is released
          stream.return(undefined as never).catch(() => {})
          reject(new Error('Summary request timed out'))
        }, 30_000)
      })

      const summary = await Promise.race([collectResponse(), timeoutPromise])

      if (!summary || summary.length < 50) {
        return null
      }

      // Cap summary length
      if (summary.length > 8_000) {
        return summary.slice(0, 8_000) + '...'
      }

      return summary
    } catch (error) {
      logger.error('Pre-truncation summary failed, falling back to standard truncation', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  /**
   * Filter conversation history by timestamp, returning messages up to the specified timestamp.
   * Used for summarization to include only messages up to a certain point.
   */
  filterConversationHistoryByTimestamp(
    conversationHistory: Anthropic.Messages.MessageParam[],
    chatermMessages: ChatermMessage[],
    upToTs: number
  ): Anthropic.Messages.MessageParam[] {
    const msgIndex = chatermMessages.findIndex((m) => m.ts >= upToTs)
    if (msgIndex <= 0) return conversationHistory

    const targetMsg = chatermMessages[msgIndex]
    const apiIndex = targetMsg.conversationHistoryIndex

    if (apiIndex === undefined || apiIndex < 0 || apiIndex >= conversationHistory.length) {
      return conversationHistory
    }

    // Verify apiIndex accuracy by comparing message content (only if text is available)
    if (targetMsg.text) {
      const apiMsg = conversationHistory[apiIndex]
      if (!this.verifyMessageMatch(apiMsg, targetMsg)) {
        return conversationHistory
      }
    }

    // Preserve the last user message (current request) after truncation
    const lastUserMsg = conversationHistory[conversationHistory.length - 1]
    const truncated = conversationHistory.slice(0, apiIndex + 1)

    if (lastUserMsg && lastUserMsg.role === 'user') {
      truncated.push(lastUserMsg)
    }

    return truncated
  }

  private verifyMessageMatch(apiMsg: Anthropic.Messages.MessageParam, chatermMsg: ChatermMessage): boolean {
    const apiText = this.extractTextFromApiMessage(apiMsg)
    const chatermText = chatermMsg.text || ''
    if (!chatermText) return false
    return apiText.includes(chatermText.slice(0, Math.min(100, chatermText.length)))
  }

  private extractTextFromApiMessage(apiMsg: Anthropic.Messages.MessageParam): string {
    const content = apiMsg.content

    if (typeof content === 'string') {
      return content
    }

    if (Array.isArray(content)) {
      return content
        .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join(' ')
    }

    return ''
  }
}
