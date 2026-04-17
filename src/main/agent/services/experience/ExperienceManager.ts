import { Anthropic } from '@anthropic-ai/sdk'
import path from 'path'
import * as fs from 'fs/promises'
import { get_encoding } from 'tiktoken'

import {
  getExperienceExtractionSystemPrompt,
  getExperienceMergeSystemPrompt,
  getExperienceMergeUserPrompt,
  getExperienceRequiredHeadings
} from '../../core/prompts/responses'
import type { ToolResult } from '../../shared/ToolResult'
import type { TaskExperienceLedgerEntry } from '../../core/context/context-tracking/ContextTrackerTypes'
import { getKnowledgeBaseRoot, getKbSearchManager } from '../../../services/knowledgebase'
import type { KbSearchResult } from '../../../services/knowledgebase/search/types'

const logger = createLogger('agent')

const EXPERIENCE_DIR = 'experience'
const SIMILARITY_THRESHOLD = 0.82
const EXPERIENCE_EXTRACTION_CONTEXT_MAX_TOKENS = 200_000
const EXPERIENCE_EXTRACTION_CONTEXT_ENCODING = get_encoding('o200k_base')
const EXPERIENCE_EXTRACTION_CONTEXT_DECODER = new TextDecoder()

export interface ExperienceExtractionInput {
  taskId: string
  conversationHistory: Anthropic.MessageParam[]
  locale: string
  taskExperienceLedger: TaskExperienceLedgerEntry[]
  timestamp: string
}

export interface ExtractedExperienceCandidate {
  action: 'new' | 'update' | 'skip'
  dedupeKey: string
  slug: string
  title: string
  keywords: string[]
  summaryMarkdown: string
  gist: string
  skipReason?: string
}

export interface ExperienceExtractionResult {
  experiences: ExtractedExperienceCandidate[]
}

export interface ExperienceExtractionOutcome {
  taskExperienceLedger: TaskExperienceLedgerEntry[]
  wroteAny: boolean
}

export type ExperienceLlmCompletion = (systemPrompt: string, userPrompt: string) => Promise<string>

export interface ExperienceManagerOptions {
  completeWithLlm: ExperienceLlmCompletion
  kbRoot?: string
  kbSearchManager?: {
    search(query: string, opts?: { maxResults?: number; minScore?: number }): Promise<KbSearchResult[]>
    onFileChanged(relPath: string): void
  } | null
  now?: () => Date
}

interface MergeCandidateInput {
  title: string
  keywords: string[]
  summaryMarkdown: string
}

interface SimilarExperienceHit {
  relPath: string
  score: number
}

interface FrontmatterData {
  title: string
  createdAt: string
  updatedAt: string
  keywords: string[]
  dedupeKey: string
}

export class ExperienceManager {
  private readonly completeWithLlm: ExperienceLlmCompletion
  private readonly kbRoot: string
  private readonly kbSearchManager: ExperienceManagerOptions['kbSearchManager']
  private readonly now: () => Date

  constructor(options: ExperienceManagerOptions) {
    this.completeWithLlm = options.completeWithLlm
    this.kbRoot = options.kbRoot ?? getKnowledgeBaseRoot()
    this.kbSearchManager = options.kbSearchManager ?? getKbSearchManager()
    this.now = options.now ?? (() => new Date())
  }

  async extractFromCompletedTask(input: ExperienceExtractionInput): Promise<ExperienceExtractionOutcome> {
    const startedAt = Date.now()
    logger.info('experience.extract.started', {
      event: 'experience.extract.started',
      taskId: input.taskId
    })

    let nextLedger = await this.pruneMissingLedgerEntries(input.taskId, [...(input.taskExperienceLedger ?? [])])
    let wroteAny = false

    try {
      const serializedContext = this.buildExtractionContext(input, nextLedger)
      const extractionResult = await this.extractCandidatesWithLLM(input, serializedContext)
      const candidates = Array.isArray(extractionResult.experiences) ? extractionResult.experiences : []

      for (const rawCandidate of candidates) {
        const candidate = this.normalizeCandidate(rawCandidate, input)
        const existingLedgerEntry = nextLedger.find((entry) => entry.dedupeKey === candidate.dedupeKey)

        if (!this.shouldPersistCandidate(candidate)) {
          logger.info('experience.candidate.skipped', {
            event: 'experience.candidate.skipped',
            taskId: input.taskId,
            dedupeKey: candidate.dedupeKey,
            reason: candidate.action === 'skip' ? candidate.skipReason || 'llm_marked_skip' : 'guard_rejected'
          })
          continue
        }

        const candidateFingerprint = createContentFingerprint(candidate.summaryMarkdown)
        if (existingLedgerEntry?.contentFingerprint === candidateFingerprint) {
          logger.info('experience.candidate.unchanged', {
            event: 'experience.candidate.unchanged',
            taskId: input.taskId,
            dedupeKey: candidate.dedupeKey
          })
          continue
        }

        const target = await this.findSimilarExperience(candidate, existingLedgerEntry?.kbRelPath)
        const writeResult = await this.createOrMergeExperience(candidate, target, input.timestamp)
        wroteAny = true

        nextLedger = this.upsertLedgerEntry(nextLedger, {
          dedupeKey: candidate.dedupeKey,
          title: candidate.title,
          slug: candidate.slug,
          keywords: candidate.keywords,
          gist: candidate.gist,
          kbRelPath: writeResult.relPath,
          lastAction: existingLedgerEntry ? 'update' : 'new',
          contentFingerprint: candidateFingerprint,
          updatedAt: normalizeIsoTimestamp(input.timestamp || this.now().toISOString())
        })

        if (this.kbSearchManager) {
          this.kbSearchManager.onFileChanged(writeResult.relPath)
          logger.info('experience.index.notify', {
            event: 'experience.index.notify',
            taskId: input.taskId,
            dedupeKey: candidate.dedupeKey,
            path: writeResult.relPath,
            durationMs: Date.now() - startedAt
          })
        }
      }
    } catch (error) {
      logger.error('experience.extract.failed', {
        event: 'experience.extract.failed',
        taskId: input.taskId,
        error,
        durationMs: Date.now() - startedAt
      })
    }

    return {
      taskExperienceLedger: nextLedger,
      wroteAny
    }
  }

  private async pruneMissingLedgerEntries(taskId: string, taskExperienceLedger: TaskExperienceLedgerEntry[]): Promise<TaskExperienceLedgerEntry[]> {
    const nextLedger: TaskExperienceLedgerEntry[] = []

    for (const entry of taskExperienceLedger) {
      let absPath: string

      try {
        absPath = this.resolveKbPath(entry.kbRelPath)
      } catch {
        logger.info('experience.ledger.pruned', {
          event: 'experience.ledger.pruned',
          taskId,
          dedupeKey: entry.dedupeKey,
          kbRelPath: entry.kbRelPath,
          reason: 'invalid_path'
        })
        continue
      }

      if (!(await this.fileExists(absPath))) {
        logger.info('experience.ledger.pruned', {
          event: 'experience.ledger.pruned',
          taskId,
          dedupeKey: entry.dedupeKey,
          kbRelPath: entry.kbRelPath,
          reason: 'missing_file'
        })
        continue
      }

      nextLedger.push(entry)
    }

    return nextLedger
  }

  private buildExtractionContext(input: ExperienceExtractionInput, taskExperienceLedger: TaskExperienceLedgerEntry[]): string {
    const sections = [this.serializeConversationHistory(input.conversationHistory), this.serializeTaskExperienceLedger(taskExperienceLedger)].filter(
      Boolean
    )

    return this.truncateExtractionContext(sections.join('\n\n'))
  }

  private serializeConversationHistory(conversationHistory: Anthropic.MessageParam[]): string {
    const lines: string[] = ['Conversation history:']

    conversationHistory.forEach((message, index) => {
      const text = this.extractConversationMessage(message)
      if (!text) {
        return
      }

      lines.push(`${index + 1}. ${message.role}`)
      lines.push(text)
      lines.push('')
    })

    return lines.join('\n').trim()
  }

  private serializeTaskExperienceLedger(taskExperienceLedger: TaskExperienceLedgerEntry[]): string {
    if (taskExperienceLedger.length === 0) {
      return ''
    }

    const lines: string[] = ['Already extracted experiences in this task:']

    taskExperienceLedger.forEach((entry, index) => {
      lines.push(`${index + 1}. dedupeKey=${entry.dedupeKey}`)
      lines.push(`title=${entry.title}`)
      lines.push(`keywords=${entry.keywords.join(', ')}`)
      lines.push(`gist=${entry.gist}`)
      lines.push('')
    })

    return lines.join('\n').trim()
  }

  private truncateExtractionContext(fullContext: string): string {
    const normalized = fullContext.replace(/\u0000/g, '').trim()
    const normalizedTokens = EXPERIENCE_EXTRACTION_CONTEXT_ENCODING.encode(normalized)

    if (normalizedTokens.length <= EXPERIENCE_EXTRACTION_CONTEXT_MAX_TOKENS) {
      return normalized
    }

    const omissionMarker = '\n\n[... omitted ...]\n\n'
    const omissionMarkerTokens = EXPERIENCE_EXTRACTION_CONTEXT_ENCODING.encode(omissionMarker)
    const availableTokens = EXPERIENCE_EXTRACTION_CONTEXT_MAX_TOKENS - omissionMarkerTokens.length
    const headTokens = Math.max(1, Math.floor(availableTokens * 0.2))
    const tailTokens = Math.max(1, availableTokens - headTokens)

    const headText = EXPERIENCE_EXTRACTION_CONTEXT_DECODER.decode(
      EXPERIENCE_EXTRACTION_CONTEXT_ENCODING.decode(normalizedTokens.slice(0, headTokens))
    ).trimEnd()
    const tailText = EXPERIENCE_EXTRACTION_CONTEXT_DECODER.decode(
      EXPERIENCE_EXTRACTION_CONTEXT_ENCODING.decode(normalizedTokens.slice(-tailTokens))
    ).trimStart()

    return `${headText}${omissionMarker}${tailText}`
  }

  private async extractCandidatesWithLLM(input: ExperienceExtractionInput, serializedContext: string): Promise<ExperienceExtractionResult> {
    const systemPrompt = getExperienceExtractionSystemPrompt(input.locale)
    const response = await this.completeWithLlm(systemPrompt, serializedContext)
    const parsed = extractJsonObject(response) as ExperienceExtractionResult | null
    if (!parsed || !Array.isArray(parsed.experiences)) {
      throw new Error('experience extraction returned invalid JSON')
    }
    return parsed
  }

  private normalizeCandidate(candidate: ExtractedExperienceCandidate, input: ExperienceExtractionInput): ExtractedExperienceCandidate {
    const action = normalizeAction(candidate.action)
    const title = normalizeInlineText(candidate.title) || deriveTitleFromCandidate(candidate, input.taskId)
    const dedupeKey = normalizeSlug(candidate.dedupeKey || candidate.slug || title)
    const slug = normalizeSlug(candidate.slug || dedupeKey || title)
    const summaryMarkdown = normalizeSummaryMarkdown(candidate.summaryMarkdown)
    const keywords = normalizeKeywords(candidate.keywords, title, summaryMarkdown, dedupeKey)
    const gist = normalizeInlineText(candidate.gist) || summarizeGist(summaryMarkdown)

    return {
      action,
      dedupeKey,
      slug,
      title,
      keywords,
      summaryMarkdown,
      gist,
      skipReason: normalizeInlineText(candidate.skipReason)
    }
  }

  private shouldPersistCandidate(candidate: ExtractedExperienceCandidate): boolean {
    // const requiredHeadings = getExperienceRequiredHeadings(locale)

    if (candidate.action === 'skip') return false
    if (!candidate.slug || !candidate.title || !candidate.dedupeKey) return false
    if (candidate.keywords.length === 0) return false
    if (candidate.gist.length < 10) return false
    if (candidate.summaryMarkdown.length < 80) return false
    // if (!requiredHeadings.every((heading) => candidate.summaryMarkdown.includes(heading))) return false
    return true
  }

  private async findSimilarExperience(candidate: ExtractedExperienceCandidate, preferredRelPath?: string): Promise<SimilarExperienceHit | null> {
    if (preferredRelPath && (await this.fileExists(this.resolveKbPath(preferredRelPath)))) {
      return { relPath: normalizeRelPath(preferredRelPath), score: 1 }
    }

    const directRelPath = this.getExperienceRelPath(candidate.slug)
    if (await this.fileExists(this.resolveKbPath(directRelPath))) {
      return { relPath: directRelPath, score: 1 }
    }

    if (!this.kbSearchManager) return null

    const query = [candidate.title, candidate.dedupeKey, candidate.keywords.join(' ')].filter(Boolean).join('\n')
    const results = await this.kbSearchManager.search(query, { maxResults: 8, minScore: 0 })
    const best = results.filter((result) => normalizeRelPath(result.path).startsWith(`${EXPERIENCE_DIR}/`)).sort((a, b) => b.score - a.score)[0]

    if (!best || best.score < SIMILARITY_THRESHOLD) {
      return null
    }

    return {
      relPath: normalizeRelPath(best.path),
      score: best.score
    }
  }

  private async createOrMergeExperience(
    candidate: ExtractedExperienceCandidate,
    similarHit: SimilarExperienceHit | null,
    timestamp: string
  ): Promise<{ relPath: string }> {
    const directRelPath = this.getExperienceRelPath(candidate.slug)
    const targetRelPath = similarHit?.relPath ?? directRelPath
    const targetAbsPath = this.resolveKbPath(targetRelPath)
    await fs.mkdir(path.dirname(targetAbsPath), { recursive: true })

    if (!(await this.fileExists(targetAbsPath))) {
      const nowIso = normalizeIsoTimestamp(timestamp || this.now().toISOString())
      const content = this.renderExperienceDocument(candidate.summaryMarkdown, {
        title: candidate.title,
        createdAt: nowIso,
        updatedAt: nowIso,
        keywords: candidate.keywords,
        dedupeKey: candidate.dedupeKey
      })
      await this.atomicWriteFile(targetAbsPath, content)
      logger.info('experience.create.success', {
        event: 'experience.create.success',
        slug: candidate.slug,
        dedupeKey: candidate.dedupeKey,
        path: targetRelPath
      })
      return { relPath: targetRelPath }
    }

    try {
      const existingRaw = await fs.readFile(targetAbsPath, 'utf-8')
      const merged = await this.mergeExperience(targetRelPath, existingRaw, candidate)
      await this.atomicWriteFile(targetAbsPath, merged)
      logger.info('experience.merge.success', {
        event: 'experience.merge.success',
        slug: candidate.slug,
        dedupeKey: candidate.dedupeKey,
        path: targetRelPath,
        mergeTargetPath: targetRelPath
      })
      return { relPath: targetRelPath }
    } catch (error) {
      const fallbackRelPath = this.getFallbackRelPath(candidate.slug, timestamp || this.now().toISOString())
      const fallbackAbsPath = this.resolveKbPath(fallbackRelPath)
      const content = this.renderExperienceDocument(candidate.summaryMarkdown, {
        title: candidate.title,
        createdAt: normalizeIsoTimestamp(timestamp || this.now().toISOString()),
        updatedAt: normalizeIsoTimestamp(timestamp || this.now().toISOString()),
        keywords: candidate.keywords,
        dedupeKey: candidate.dedupeKey
      })
      await fs.mkdir(path.dirname(fallbackAbsPath), { recursive: true })
      await this.atomicWriteFile(fallbackAbsPath, content)
      logger.warn('experience.merge.fallback_create', {
        event: 'experience.merge.fallback_create',
        slug: candidate.slug,
        dedupeKey: candidate.dedupeKey,
        path: fallbackRelPath,
        mergeTargetPath: targetRelPath,
        error
      })
      return { relPath: fallbackRelPath }
    }
  }

  private async mergeExperience(relPath: string, existingRaw: string, candidate: ExtractedExperienceCandidate): Promise<string> {
    const existingBody = stripFrontmatter(existingRaw)
    const existingCreatedAt = parseFrontmatterValue(existingRaw, 'created_at') || this.now().toISOString()
    const locale = this.detectPromptLocale(existingRaw, candidate)
    const systemPrompt = getExperienceMergeSystemPrompt(locale)
    const userPrompt = getExperienceMergeUserPrompt(locale, existingBody, this.toMergeCandidateInput(candidate))
    const response = await this.completeWithLlm(systemPrompt, userPrompt)
    const parsed = extractJsonObject(response) as { title?: string; keywords?: string[]; summaryMarkdown?: string } | null
    if (!parsed?.summaryMarkdown) {
      throw new Error(`experience merge returned invalid JSON for ${relPath}`)
    }

    const title = normalizeInlineText(parsed.title) || candidate.title
    const keywords = normalizeKeywords(parsed.keywords, title, candidate.summaryMarkdown)
    const summaryMarkdown = normalizeSummaryMarkdown(parsed.summaryMarkdown)
    if (!getExperienceRequiredHeadings(locale).every((heading) => summaryMarkdown.includes(heading))) {
      throw new Error(`experience merge missing required headings for ${relPath}`)
    }

    return this.renderExperienceDocument(summaryMarkdown, {
      title,
      createdAt: normalizeIsoTimestamp(existingCreatedAt),
      updatedAt: this.now().toISOString(),
      keywords,
      dedupeKey: candidate.dedupeKey
    })
  }

  private upsertLedgerEntry(ledger: TaskExperienceLedgerEntry[], entry: TaskExperienceLedgerEntry): TaskExperienceLedgerEntry[] {
    const next = [...ledger]
    const index = next.findIndex((item) => item.dedupeKey === entry.dedupeKey)
    if (index >= 0) {
      next[index] = entry
    } else {
      next.push(entry)
    }
    return next
  }

  private detectPromptLocale(existingRaw: string, candidate: ExtractedExperienceCandidate): string {
    if (/[\u4e00-\u9fff]/.test(existingRaw) || /[\u4e00-\u9fff]/.test(candidate.summaryMarkdown)) {
      return 'zh-CN'
    }

    return 'en-US'
  }

  private toMergeCandidateInput(candidate: ExtractedExperienceCandidate): MergeCandidateInput {
    return {
      title: candidate.title,
      keywords: candidate.keywords,
      summaryMarkdown: candidate.summaryMarkdown
    }
  }

  private renderExperienceDocument(body: string, frontmatter: FrontmatterData): string {
    const normalizedBody = normalizeSummaryMarkdown(body)
    const yaml = [
      '---',
      `title: ${quoteYamlString(frontmatter.title)}`,
      'source: auto-experience',
      'scope: global',
      `created_at: ${quoteYamlString(normalizeIsoTimestamp(frontmatter.createdAt))}`,
      `updated_at: ${quoteYamlString(normalizeIsoTimestamp(frontmatter.updatedAt))}`,
      'keywords:',
      ...frontmatter.keywords.map((keyword) => `  - ${quoteYamlString(keyword)}`),
      `dedupe_key: ${quoteYamlString(frontmatter.dedupeKey)}`,
      '---'
    ].join('\n')

    return `${yaml}\n\n${normalizedBody}\n`
  }

  private async atomicWriteFile(absPath: string, content: string): Promise<void> {
    const tmpPath = `${absPath}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(tmpPath, content, 'utf-8')
    await fs.rename(tmpPath, absPath)
  }

  private getExperienceRelPath(slug: string): string {
    return `${EXPERIENCE_DIR}/${normalizeSlug(slug)}.md`
  }

  private getFallbackRelPath(slug: string, timestamp: string): string {
    return `${EXPERIENCE_DIR}/${normalizeSlug(slug)}-${formatTimestampForFileName(timestamp)}.md`
  }

  private resolveKbPath(relPath: string): string {
    const normalized = normalizeRelPath(relPath)
    const root = path.resolve(this.kbRoot)
    const resolved = path.resolve(root, normalized)
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new Error('Experience path escapes knowledgebase root')
    }
    return resolved
  }

  private async fileExists(absPath: string): Promise<boolean> {
    try {
      await fs.access(absPath)
      return true
    } catch {
      return false
    }
  }

  private extractConversationMessage(message: Anthropic.MessageParam): string {
    if (typeof message.content === 'string') {
      return this.sanitizeConversationText(message.content)
    }

    if (!Array.isArray(message.content)) return ''

    const parts = message.content
      .map((block) => {
        if (block.type === 'text') {
          return this.sanitizeConversationText(block.text)
        }
        if (block.type === 'tool_result') {
          return this.extractToolResultText(block.content)
        }
        return ''
      })
      .filter(Boolean)

    return parts.join('\n')
  }

  private extractToolResultText(content: unknown): string {
    const rawText = Array.isArray(content)
      ? content
          .map((item) => (typeof item === 'object' && item !== null && 'text' in item && typeof item.text === 'string' ? item.text : ''))
          .filter(Boolean)
          .join('\n')
      : typeof content === 'string'
        ? content
        : ''

    const parsed = tryParseJson(rawText) as ToolResult | null
    return `tool_result ${parsed?.toolName || 'tool'}${parsed?.isError ? ' error' : ''}`.trim()
  }

  private sanitizeConversationText(text: string): string {
    return text
      .replace(/\n?\s*<environment_details>[\s\S]*?<\/environment_details>\s*\n?/gi, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
}

function extractJsonObject(text: string): any | null {
  try {
    return JSON.parse(text)
  } catch {
    // continue
  }

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch {
      // continue
    }
  }

  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1))
    } catch {
      // continue
    }
  }

  return null
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function normalizeAction(action: string | undefined): 'new' | 'update' | 'skip' {
  return action === 'new' || action === 'update' || action === 'skip' ? action : 'skip'
}

function normalizeSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80)
  return normalized || 'experience'
}

function normalizeKeywords(keywords: unknown, ...fallbackSources: string[]): string[] {
  const rawValues = Array.isArray(keywords) ? keywords : []
  const collected = rawValues
    .filter((value): value is string => typeof value === 'string')
    .map((value) => normalizeInlineText(value).toLowerCase())
    .filter(Boolean)

  if (collected.length === 0) {
    const fallback = fallbackSources
      .join(' ')
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/)
      .filter((part) => part.length >= 2)
    collected.push(...fallback.slice(0, 8))
  }

  return [...new Set(collected)].slice(0, 12)
}

function normalizeSummaryMarkdown(markdown: string): string {
  return (markdown || '').replace(/\r\n/g, '\n').replace(/^\s+|\s+$/g, '')
}

function createContentFingerprint(markdown: string): string {
  return normalizeInlineText(normalizeSummaryMarkdown(markdown))
}

function normalizeInlineText(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^\/+/, '')
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith('---\n')) return content.trim()
  const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/)
  return match?.[1]?.trim() ?? content.trim()
}

function parseFrontmatterValue(content: string, key: string): string | null {
  const match = content.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?\\s*$`, 'm'))
  return match?.[1]?.trim() ?? null
}

function quoteYamlString(value: string): string {
  return JSON.stringify(value)
}

function formatTimestampForFileName(timestamp: string): string {
  return normalizeIsoTimestamp(timestamp)
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}

function normalizeIsoTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString()
  }
  return parsed.toISOString()
}

function deriveTitleFromCandidate(candidate: ExtractedExperienceCandidate, taskId: string): string {
  return normalizeInlineText(candidate.gist) || candidate.dedupeKey || candidate.slug || taskId
}

function summarizeGist(summaryMarkdown: string): string {
  return normalizeInlineText(stripMarkdownHeadings(summaryMarkdown)).slice(0, 180)
}

function stripMarkdownHeadings(markdown: string): string {
  return markdown
    .replace(/^#.+$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
