import { createHash } from 'crypto'
import path from 'path'
import type { ChunkedDocument, RawChunk, RawParentChunk } from './types'

export const INDEXABLE_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.sh',
  '.bash',
  '.zsh',
  '.yaml',
  '.yml',
  '.json',
  '.toml',
  '.ini',
  '.conf',
  '.cfg',
  '.py',
  '.js',
  '.ts',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.sql',
  '.html',
  '.css',
  '.xml',
  '.csv',
  '.log',
  '.env',
  '.dockerfile',
  '.makefile'
])

export const CHUNKING_SIGNATURE = 'weknora-be48324c:file-aware-auto:p4096-80:c384-76:adjacent-parent-v3'
export const PARENT_CHUNK_SIZE = 4096
export const PARENT_CHUNK_OVERLAP = 80
export const CHILD_CHUNK_SIZE = 384
export const CHILD_CHUNK_OVERLAP = Math.floor(CHILD_CHUNK_SIZE / 5)
export const ABSOLUTE_MAX_CHUNK_SIZE = 7500

const DEFAULT_CHUNK_SIZE = 512
const DEFAULT_CHUNK_OVERLAP = 80
const DEFAULT_SEPARATORS = ['\n\n', '\n', '。']
const MIN_CHUNK_LENGTH = 50

type Strategy = 'auto' | 'heading' | 'heuristic' | 'recursive'
type StrategyTier = 'heading' | 'heuristic' | 'recursive'

interface SplitterConfig {
  chunkSize: number
  chunkOverlap: number
  separators: string[]
  strategy: Strategy
  languages: string[]
  enableMarkdownHeadings: boolean
}

interface SemanticChunk {
  content: string
  contextHeader: string
  seq: number
  start: number
  end: number
}

interface ChildChunk extends SemanticChunk {
  parentIndex: number
}

interface ParentChildResult {
  parents: SemanticChunk[]
  children: ChildChunk[]
}

interface ParentCandidateResult {
  parent: SemanticChunk
  children: SemanticChunk[]
  requiresParent: boolean
}

interface Span {
  start: number
  end: number
}

interface SplitUnit extends Span {
  text: string
}

interface DocumentProfile {
  totalChars: number
  totalLines: number
  headingCounts: Map<number, number>
  headingTotal: number
  numberedSectionCount: number
  allCapsShortLineCount: number
  formFeedCount: number
  visualSeparatorCount: number
  germanChapterCount: number
  englishChapterCount: number
  chineseChapterCount: number
}

interface HeadingBoundary {
  start: number
  line: string
}

interface HeuristicBoundary {
  start: number
  priority: number
}

interface SectionBreadcrumb {
  start: number
  breadcrumb: string
}

const MARKDOWN_HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const NUMBERED_SECTION_RE = /^[ \t]*(?:\d+(?:\.\d+){1,3}\.?|(?:\d+|[IVX]{1,5})\.)[ \t]+\S.{0,200}$/
const ALL_CAPS_HEADING_RE = /^[ \t]*([A-ZÄÖÜ][A-ZÄÖÜ \-]{3,80}):?\s*$/
const VISUAL_SEPARATOR_RE = /^[ \t]*(?:-{3,}|={3,}|\*{3,}|_{3,})[ \t]*$/
const PAGE_FOOTER_RE = /^[ \t]*(?:Seite|Page|页码?)\s+\d+(?:\s*(?:von|of|\/)\s*\d+)?[ \t]*$/i
const GERMAN_CHAPTER_RE = /^[ \t]*(?:Kapitel|Abschnitt|Teil)\s+(?:[0-9]+|[IVX]{1,5})[\.: ].{0,200}$/
const ENGLISH_CHAPTER_RE = /^[ \t]*(?:Chapter|Section|Part)\s+(?:[0-9]+|[IVX]{1,5})[\.: ].{0,200}$/
const CHINESE_CHAPTER_RE = /^[ \t]*第[ \t]*[一二三四五六七八九十百千零〇0-9]+[ \t]*(?:章|节|節|部分|篇)[ \t]?.{0,200}$/
const TABLE_ROW_RE = /^\s*(?:\|[^|\n]*)+\|\s*$/
const TABLE_HEADER_RE = /^\s*(?:\|[^|\n]*)+[\r\n]+\s*(?:\|\s*:?-{3,}:?\s*)+\|?[\r\n]+$/i

const PROTECTED_PATTERNS = [
  /\$\$[\s\S]*?\$\$/g,
  /!\[[^\]]*\]\([^)]+\)/g,
  /\[[^\]]*\]\([^)]+\)/g,
  /^[ ]*(?:\|[^|\n]*)+\|[\r\n]+\s*(?:\|\s*:?-{3,}:?\s*)+\|[\r\n]+/gm,
  /^[ ]*(?:\|[^|\n]*)+\|[\r\n]+/gm,
  /```(?:\w+)?[\r\n][\s\S]*?```/g
]

const PARENT_CONFIG: SplitterConfig = {
  chunkSize: PARENT_CHUNK_SIZE,
  chunkOverlap: PARENT_CHUNK_OVERLAP,
  separators: DEFAULT_SEPARATORS,
  strategy: 'auto',
  languages: [],
  enableMarkdownHeadings: true
}

const CHILD_CONFIG: SplitterConfig = {
  chunkSize: CHILD_CHUNK_SIZE,
  chunkOverlap: CHILD_CHUNK_OVERLAP,
  separators: DEFAULT_SEPARATORS,
  strategy: 'auto',
  languages: [],
  enableMarkdownHeadings: true
}

export function isIndexableFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  if (!ext) return false
  return INDEXABLE_EXTENSIONS.has(ext)
}

export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex')
}

export function buildEmbeddingText(relPath: string, chunk: Pick<RawChunk, 'contextHeader' | 'text'>): string {
  return [relPath, chunk.contextHeader, chunk.text.trim()].filter(Boolean).join('\n\n')
}

export function chunkDocument(content: string, relPath: string): ChunkedDocument {
  if (!content) return { parents: [], children: [] }

  const enableMarkdownHeadings = path.extname(relPath).toLowerCase() === '.md'
  const split = splitParentChild(content, { ...PARENT_CONFIG, enableMarkdownHeadings }, { ...CHILD_CONFIG, enableMarkdownHeadings })
  const lineStarts = buildLineStarts(content)

  const parents: RawParentChunk[] = split.parents.map((chunk) => ({
    parentIndex: chunk.seq,
    startLine: lineAtOffset(lineStarts, chunk.start),
    endLine: lineAtOffset(lineStarts, Math.max(chunk.start, chunk.end - 1)),
    startOffset: chunk.start,
    endOffset: chunk.end,
    text: chunk.content
  }))

  const children: RawChunk[] = split.children.map((chunk) => ({
    parentIndex: chunk.parentIndex,
    startLine: lineAtOffset(lineStarts, chunk.start),
    endLine: lineAtOffset(lineStarts, Math.max(chunk.start, chunk.end - 1)),
    startOffset: chunk.start,
    endOffset: chunk.end,
    contextHeader: chunk.contextHeader,
    text: chunk.content
  }))

  return { parents, children }
}

function splitParentChild(text: string, parentInput: SplitterConfig, childInput: SplitterConfig): ParentChildResult {
  const parentConfig = ensureDefaults(parentInput)
  const childConfig = ensureDefaults(childInput)
  const parentCandidates = split(text, parentConfig)
  const runes = Array.from(text)
  const candidateResults = parentCandidates.map((parent): ParentCandidateResult => {
    const relativeChildren = split(parent.content, childConfig)
    return {
      parent,
      requiresParent: relativeChildren.length > 1 || (relativeChildren.length === 1 && relativeChildren[0]?.content !== parent.content),
      children: relativeChildren.map((child) => ({
        ...child,
        start: parent.start + child.start,
        end: parent.start + child.end,
        contextHeader: mergeBreadcrumbs(parent.contextHeader, child.contextHeader)
      }))
    }
  })
  const parentGroups = groupAdjacentParentCandidates(candidateResults, runes, parentConfig.chunkSize, parentConfig.enableMarkdownHeadings)
  const parents: SemanticChunk[] = []
  const children: ChildChunk[] = []
  let childSeq = 0

  for (const group of parentGroups) {
    let parentIndex = -1
    if (group.length > 1 || group[0]?.requiresParent) {
      parentIndex = parents.length
      parents.push(buildMergedParent(group, runes, parentIndex))
    }

    for (const candidate of group) {
      for (const child of candidate.children) {
        children.push({ ...child, seq: childSeq++, parentIndex })
      }
    }
  }

  return { parents, children }
}

function groupAdjacentParentCandidates(
  candidates: ParentCandidateResult[],
  runes: string[],
  maximum: number,
  enableMarkdownHeadings: boolean
): ParentCandidateResult[][] {
  if (candidates.length <= 1 || maximum <= 0) return candidates.map((candidate) => [candidate])

  const segments: ParentCandidateResult[][] = []
  let segment: ParentCandidateResult[] = []
  for (const candidate of candidates) {
    const previous = segment.at(-1)
    const startsNewTopLevelSection = enableMarkdownHeadings && startsWithTopLevelHeading(candidate.parent.content)
    if (previous && (startsNewTopLevelSection || !areSourceAdjacent(previous.parent, candidate.parent, runes))) {
      segments.push(segment)
      segment = []
    }
    segment.push(candidate)
  }
  if (segment.length > 0) segments.push(segment)

  return segments.flatMap((parentSegment) => rebalanceLastParentGroups(greedilyGroupParents(parentSegment, maximum), maximum))
}

function greedilyGroupParents(candidates: ParentCandidateResult[], maximum: number): ParentCandidateResult[][] {
  const groups: ParentCandidateResult[][] = []
  let current: ParentCandidateResult[] = []
  for (const candidate of candidates) {
    const combined = [...current, candidate]
    if (current.length > 0 && parentGroupLength(combined) > maximum) {
      groups.push(current)
      current = [candidate]
    } else {
      current = combined
    }
  }
  if (current.length > 0) groups.push(current)
  return groups
}

function rebalanceLastParentGroups(groups: ParentCandidateResult[][], maximum: number): ParentCandidateResult[][] {
  if (groups.length < 2) return groups

  const previous = groups.at(-2)!
  const tail = groups.at(-1)!
  const combined = [...previous, ...tail]
  let bestSplit = previous.length
  let bestImbalance = Math.abs(parentGroupLength(previous) - parentGroupLength(tail))

  for (let split = 1; split < combined.length; split++) {
    const left = combined.slice(0, split)
    const right = combined.slice(split)
    const leftLength = parentGroupLength(left)
    const rightLength = parentGroupLength(right)
    if (leftLength > maximum || rightLength > maximum) continue
    const imbalance = Math.abs(leftLength - rightLength)
    if (imbalance < bestImbalance) {
      bestSplit = split
      bestImbalance = imbalance
    }
  }

  if (bestSplit === previous.length) return groups
  return [...groups.slice(0, -2), combined.slice(0, bestSplit), combined.slice(bestSplit)]
}

function buildMergedParent(group: ParentCandidateResult[], runes: string[], seq: number): SemanticChunk {
  const start = group[0].parent.start
  const end = Math.max(...group.map((candidate) => candidate.parent.end))
  let contextHeader = group[0].parent.contextHeader
  for (let index = 1; index < group.length && contextHeader; index++) {
    contextHeader = commonHeadingPrefix(contextHeader, group[index].parent.contextHeader)
  }
  return {
    content: runes.slice(start, end).join(''),
    contextHeader,
    seq,
    start,
    end
  }
}

function parentGroupLength(group: ParentCandidateResult[]): number {
  if (group.length === 0) return 0
  return Math.max(...group.map((candidate) => candidate.parent.end)) - group[0].parent.start
}

function areSourceAdjacent(left: SemanticChunk, right: SemanticChunk, runes: string[]): boolean {
  if (right.start <= left.end) return true
  return runes.slice(left.end, right.start).join('').trim() === ''
}

function startsWithTopLevelHeading(content: string): boolean {
  const firstContentLine = content.split('\n').find((line) => line.trim())
  return !!firstContentLine && /^#\s+/.test(firstContentLine.trim())
}

function split(text: string, input: SplitterConfig): SemanticChunk[] {
  if (!text) return []
  const config = ensureDefaults(input)
  const profile = config.strategy === 'auto' ? profileDocument(text, config.enableMarkdownHeadings) : undefined
  const chain = resolveStrategyChain(config.strategy, profile)
  let fallbackOutput: SemanticChunk[] = []

  for (const tier of chain) {
    const output = runTier(tier, text, config, profile)
    if (validateChunks(output, codePointLength(text), config.chunkSize)) return output
    if (tier === 'recursive') fallbackOutput = output
  }

  return fallbackOutput.length > 0 ? fallbackOutput : splitText(text, config)
}

function ensureDefaults(input: SplitterConfig): SplitterConfig {
  const chunkSize = input.chunkSize > 0 ? input.chunkSize : DEFAULT_CHUNK_SIZE
  let chunkOverlap = input.chunkOverlap > 0 ? input.chunkOverlap : DEFAULT_CHUNK_OVERLAP
  if (chunkOverlap > chunkSize / 2) chunkOverlap = Math.floor(chunkSize / 2)
  return {
    chunkSize,
    chunkOverlap,
    separators: input.separators.length > 0 ? input.separators : DEFAULT_SEPARATORS,
    strategy: input.strategy,
    languages: input.languages,
    enableMarkdownHeadings: input.enableMarkdownHeadings
  }
}

function resolveStrategyChain(strategy: Strategy, profile?: DocumentProfile): StrategyTier[] {
  if (strategy === 'heading') return ['heading', 'recursive']
  if (strategy === 'heuristic') return ['heuristic', 'recursive']
  if (strategy === 'recursive') return ['recursive']
  return selectStrategy(profile)
}

function selectStrategy(profile?: DocumentProfile): StrategyTier[] {
  if (!profile) return ['recursive']
  const chain: StrategyTier[] = []
  const headingDensity = profile.totalLines === 0 ? 0 : profile.headingTotal / profile.totalLines
  if (profile.headingTotal >= 3 && headingDensity > 0.005 && dominantHeadingLevel(profile) > 0) chain.push('heading')

  const heuristicMarkers =
    profile.numberedSectionCount +
    profile.germanChapterCount +
    profile.englishChapterCount +
    profile.chineseChapterCount +
    profile.allCapsShortLineCount +
    profile.visualSeparatorCount +
    profile.formFeedCount
  if (
    heuristicMarkers >= 5 ||
    profile.formFeedCount > 0 ||
    profile.germanChapterCount + profile.englishChapterCount + profile.chineseChapterCount > 0
  ) {
    chain.push('heuristic')
  }
  chain.push('recursive')
  return chain
}

function runTier(tier: StrategyTier, text: string, config: SplitterConfig, profile?: DocumentProfile): SemanticChunk[] {
  if (tier === 'heading') return splitByHeadings(text, config, profile)
  if (tier === 'heuristic') return splitByHeuristics(text, config)
  return splitText(text, config)
}

function profileDocument(text: string, enableMarkdownHeadings = true): DocumentProfile {
  const headingCounts = new Map<number, number>()
  const profile: DocumentProfile = {
    totalChars: codePointLength(text),
    totalLines: 0,
    headingCounts,
    headingTotal: 0,
    numberedSectionCount: 0,
    allCapsShortLineCount: 0,
    formFeedCount: countOccurrences(text, '\f'),
    visualSeparatorCount: 0,
    germanChapterCount: 0,
    englishChapterCount: 0,
    chineseChapterCount: 0
  }

  const lines = text.split('\n')
  profile.totalLines = lines.length
  let inFence = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    if (enableMarkdownHeadings) {
      const heading = line.match(MARKDOWN_HEADING_RE)
      if (heading) {
        const level = heading[1].length
        headingCounts.set(level, (headingCounts.get(level) ?? 0) + 1)
        profile.headingTotal++
        continue
      }
    }
    if (NUMBERED_SECTION_RE.test(line)) profile.numberedSectionCount++
    if (ALL_CAPS_HEADING_RE.test(line)) profile.allCapsShortLineCount++
    if (VISUAL_SEPARATOR_RE.test(line)) profile.visualSeparatorCount++
    if (GERMAN_CHAPTER_RE.test(line)) profile.germanChapterCount++
    if (ENGLISH_CHAPTER_RE.test(line)) profile.englishChapterCount++
    if (CHINESE_CHAPTER_RE.test(line)) profile.chineseChapterCount++
  }
  return profile
}

function dominantHeadingLevel(profile: DocumentProfile): number {
  if (profile.headingTotal === 0) return 0
  for (let level = 1; level <= 6; level++) {
    if ((profile.headingCounts.get(level) ?? 0) >= 3) return level
  }
  for (let level = 6; level >= 1; level--) {
    if ((profile.headingCounts.get(level) ?? 0) > 0) return level
  }
  return 0
}

function splitByHeadings(text: string, config: SplitterConfig, suppliedProfile?: DocumentProfile): SemanticChunk[] {
  const profile = suppliedProfile ?? profileDocument(text)
  const primaryLevel = dominantHeadingLevel(profile)
  if (primaryLevel === 0) return splitText(text, config)

  const boundaries = findHeadingBoundaries(text, primaryLevel)
  if (boundaries.length <= 1) return splitText(text, config)

  const runes = Array.from(text)
  const hierarchy = new HeadingHierarchy()
  const output: SemanticChunk[] = []

  for (let index = 0; index < boundaries.length; index++) {
    const boundary = boundaries[index]
    const end = boundaries[index + 1]?.start ?? runes.length
    if (boundary.line) hierarchy.observe(boundary.line)
    const breadcrumb = hierarchy.breadcrumb()
    const hierarchyAtSectionStart = hierarchy.clone()
    observeSubHeadings(runes.slice(boundary.start, end), primaryLevel, hierarchy)
    const sectionContent = runes.slice(boundary.start, end).join('')
    if (!sectionContent) continue

    if (codePointLength(breadcrumb) + 2 + (end - boundary.start) <= config.chunkSize) {
      output.push({
        content: sectionContent,
        contextHeader: breadcrumb,
        seq: output.length,
        start: boundary.start,
        end
      })
      continue
    }

    const breadcrumbs = sectionBreadcrumbs(runes.slice(boundary.start, end), primaryLevel, hierarchyAtSectionStart)
    for (const subChunk of splitText(sectionContent, config)) {
      output.push({
        content: subChunk.content,
        contextHeader: breadcrumbAtOffset(breadcrumbs, subChunk.start, breadcrumb),
        seq: output.length,
        start: boundary.start + subChunk.start,
        end: boundary.start + subChunk.end
      })
    }
  }

  return coalesceTinyChunks(output, config.chunkSize)
}

function findHeadingBoundaries(text: string, primaryLevel: number): HeadingBoundary[] {
  const boundaries: HeadingBoundary[] = [{ start: 0, line: '' }]
  const lines = text.split('\n')
  let offset = 0
  let inFence = false

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      inFence = !inFence
    } else if (!inFence) {
      const match = line.match(MARKDOWN_HEADING_RE)
      if (match && match[1].length <= primaryLevel) {
        if (offset === 0) boundaries[0].line = line
        else boundaries.push({ start: offset, line })
      }
    }
    offset += codePointLength(line)
    if (index < lines.length - 1) offset++
  }
  return boundaries
}

function observeSubHeadings(runes: string[], primaryLevel: number, hierarchy: HeadingHierarchy): void {
  let inFence = false
  for (const line of runes.join('').split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = line.match(MARKDOWN_HEADING_RE)
    if (match && match[1].length > primaryLevel) hierarchy.observe(line)
  }
}

function sectionBreadcrumbs(runes: string[], primaryLevel: number, seed: HeadingHierarchy): SectionBreadcrumb[] {
  const hierarchy = seed.clone()
  const output: SectionBreadcrumb[] = [{ start: 0, breadcrumb: hierarchy.breadcrumb() }]
  const lines = runes.join('').split('\n')
  let offset = 0
  let inFence = false

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      inFence = !inFence
    } else if (!inFence) {
      const match = line.match(MARKDOWN_HEADING_RE)
      if (match && match[1].length > primaryLevel) {
        hierarchy.observe(line)
        output.push({ start: offset, breadcrumb: hierarchy.breadcrumb() })
      }
    }
    offset += codePointLength(line)
    if (index < lines.length - 1) offset++
  }
  return output
}

function breadcrumbAtOffset(breadcrumbs: SectionBreadcrumb[], offset: number, fallback: string): string {
  let current = fallback
  for (const entry of breadcrumbs) {
    if (entry.start > offset) break
    current = entry.breadcrumb
  }
  return current
}

function coalesceTinyChunks(chunks: SemanticChunk[], chunkSize: number): SemanticChunk[] {
  if (chunks.length <= 1 || chunkSize <= 0) return chunks
  const target = Math.max(Math.floor(chunkSize / 2), 200)
  const output: SemanticChunk[] = []
  let current = { ...chunks[0] }
  let currentLength = codePointLength(current.content)

  for (let index = 1; index < chunks.length; index++) {
    const next = chunks[index]
    const nextLength = codePointLength(next.content)
    const sharedHeader = commonHeadingPrefix(current.contextHeader, next.contextHeader)
    if (sharedHeader && current.end === next.start && currentLength < target && currentLength + nextLength <= chunkSize) {
      current.content += next.content
      current.contextHeader = sharedHeader
      current.end = next.end
      currentLength += nextLength
    } else {
      output.push(current)
      current = { ...next }
      currentLength = nextLength
    }
  }
  output.push(current)
  output.forEach((chunk, index) => (chunk.seq = index))
  return output
}

function commonHeadingPrefix(left: string, right: string): string {
  if (left === right) return left
  const leftLines = left.split('\n')
  const rightLines = right.split('\n')
  const common: string[] = []
  for (let index = 0; index < Math.min(leftLines.length, rightLines.length); index++) {
    if (leftLines[index] !== rightLines[index]) break
    common.push(leftLines[index])
  }
  return common.join('\n')
}

function splitByHeuristics(text: string, config: SplitterConfig): SemanticChunk[] {
  const runes = Array.from(text)
  if (runes.length <= config.chunkSize) return splitText(text, config)

  let boundaries = findHeuristicBoundaries(text, config.languages)
  boundaries = dropBoundariesInsideSpans(boundaries, protectedSpans(text))
  if (boundaries.length === 0) return splitText(text, config)
  if (boundaries[0].start !== 0) boundaries.unshift({ start: 0, priority: 0 })
  boundaries.push({ start: runes.length, priority: 0 })

  const output: SemanticChunk[] = []
  let chunkStart = boundaries[0].start
  let currentEnd = chunkStart
  const minimumChunkSize = Math.max(Math.floor(config.chunkSize / 4), MIN_CHUNK_LENGTH)

  for (let index = 1; index < boundaries.length; index++) {
    const nextEnd = boundaries[index].start
    const blockLength = nextEnd - currentEnd
    if (blockLength > config.chunkSize) {
      if (currentEnd - chunkStart > 0) appendChunk(output, runes, chunkStart, currentEnd)
      appendOversizeBlock(output, runes, currentEnd, nextEnd, config)
      currentEnd = nextEnd
      chunkStart = nextEnd
      continue
    }

    if (nextEnd - chunkStart > config.chunkSize && currentEnd - chunkStart >= minimumChunkSize) {
      appendChunk(output, runes, chunkStart, currentEnd)
      chunkStart = applyAlignedOverlap(runes, currentEnd, config.chunkOverlap, boundaries)
    }
    currentEnd = nextEnd
  }
  if (currentEnd > chunkStart) appendChunk(output, runes, chunkStart, currentEnd)
  return output
}

function findHeuristicBoundaries(text: string, languages: string[]): HeuristicBoundary[] {
  const boundaries: HeuristicBoundary[] = []
  const runes = Array.from(text)
  runes.forEach((rune, index) => {
    if (rune === '\f') boundaries.push({ start: index, priority: 100 })
  })

  const chapterPatterns = chapterPatternsForLanguages(languages)
  const lines = text.split('\n')
  let offset = 0
  let inFence = false
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      inFence = !inFence
    } else if (!inFence) {
      let priority = 0
      if (chapterPatterns.some((pattern) => pattern.test(line))) priority = 85
      else if (NUMBERED_SECTION_RE.test(line)) priority = 90
      else if (ALL_CAPS_HEADING_RE.test(line)) priority = 70
      else if (VISUAL_SEPARATOR_RE.test(line)) priority = 60
      else if (PAGE_FOOTER_RE.test(line)) priority = 50
      if (priority > 0) boundaries.push({ start: offset, priority })
    }
    offset += codePointLength(line)
    if (index < lines.length - 1) offset++
  }

  const utf16Map = buildUtf16ToCodePointMap(text)
  for (const match of text.matchAll(/\n{3,}/g)) {
    boundaries.push({ start: utf16Map[(match.index ?? 0) + match[0].length], priority: 40 })
  }

  boundaries.sort((left, right) => left.start - right.start || right.priority - left.priority)
  return boundaries.filter((boundary, index) => index === 0 || boundary.start !== boundaries[index - 1].start)
}

function chapterPatternsForLanguages(languages: string[]): RegExp[] {
  if (languages.length === 0) return [GERMAN_CHAPTER_RE, ENGLISH_CHAPTER_RE, CHINESE_CHAPTER_RE]
  const patterns: RegExp[] = []
  if (languages.includes('de')) patterns.push(GERMAN_CHAPTER_RE)
  if (languages.includes('en')) patterns.push(ENGLISH_CHAPTER_RE)
  if (languages.includes('zh')) patterns.push(CHINESE_CHAPTER_RE)
  return patterns.length > 0 ? patterns : [GERMAN_CHAPTER_RE, ENGLISH_CHAPTER_RE, CHINESE_CHAPTER_RE]
}

function dropBoundariesInsideSpans(boundaries: HeuristicBoundary[], spans: Span[]): HeuristicBoundary[] {
  if (spans.length === 0) return boundaries
  return boundaries.filter((boundary) => !spans.some((span) => span.start < boundary.start && boundary.start < span.end))
}

function appendChunk(output: SemanticChunk[], runes: string[], start: number, end: number): void {
  if (end <= start) return
  const content = runes.slice(start, end).join('')
  if (!content.trim()) return
  output.push({ content, contextHeader: '', seq: output.length, start, end })
}

function appendOversizeBlock(output: SemanticChunk[], runes: string[], start: number, end: number, config: SplitterConfig): void {
  const content = runes.slice(start, end).join('')
  for (const subChunk of splitText(content, config)) {
    output.push({
      ...subChunk,
      seq: output.length,
      start: start + subChunk.start,
      end: start + subChunk.end
    })
  }
}

function applyAlignedOverlap(runes: string[], currentEnd: number, overlap: number, boundaries: HeuristicBoundary[]): number {
  if (overlap <= 0) return currentEnd
  const target = Math.max(0, currentEnd - overlap)
  const windowStart = Math.max(0, currentEnd - 2 * overlap)
  let bestBoundary = -1
  for (const boundary of boundaries) {
    if (boundary.start >= windowStart && boundary.start < currentEnd) bestBoundary = Math.max(bestBoundary, boundary.start)
  }
  if (bestBoundary >= 0) return bestBoundary
  for (let index = target; index > windowStart; index--) {
    if (runes[index] === '\n') return index + 1
  }
  return target
}

function splitText(text: string, config: SplitterConfig): SemanticChunk[] {
  if (!text) return []
  const units = buildUnitsWithProtection(text, protectedSpans(text), config.separators, config.chunkSize)
  return mergeUnits(units, config.chunkSize, config.chunkOverlap)
}

function protectedSpans(text: string): Span[] {
  const utf16Map = buildUtf16ToCodePointMap(text)
  const matches: Span[] = []
  for (const pattern of PROTECTED_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      const startUtf16 = match.index ?? 0
      matches.push({ start: utf16Map[startUtf16], end: utf16Map[startUtf16 + match[0].length] })
    }
  }
  matches.sort((left, right) => left.start - right.start || right.end - right.start - (left.end - left.start))
  const output: Span[] = []
  let lastEnd = 0
  for (const match of matches) {
    if (match.start >= lastEnd) {
      output.push(match)
      lastEnd = match.end
    }
  }
  return output
}

function buildUnitsWithProtection(text: string, spans: Span[], separators: string[], chunkSize: number): SplitUnit[] {
  const runes = Array.from(text)
  const units: SplitUnit[] = []
  let position = 0

  for (const span of spans) {
    if (span.start > position) appendSplitParts(units, runes.slice(position, span.start).join(''), position, separators, chunkSize)
    const protectedRunes = runes.slice(span.start, span.end)
    if (protectedRunes.length > ABSOLUTE_MAX_CHUNK_SIZE) {
      let offset = 0
      while (offset < protectedRunes.length) {
        const end = findForcedSplitEnd(protectedRunes, offset, ABSOLUTE_MAX_CHUNK_SIZE)
        units.push({ text: protectedRunes.slice(offset, end).join(''), start: span.start + offset, end: span.start + end })
        offset = end
      }
    } else {
      units.push({ text: protectedRunes.join(''), start: span.start, end: span.end })
    }
    position = span.end
  }
  if (position < runes.length) appendSplitParts(units, runes.slice(position).join(''), position, separators, chunkSize)
  return units
}

function appendSplitParts(units: SplitUnit[], text: string, start: number, separators: string[], chunkSize: number): void {
  let offset = start
  for (const part of splitBySeparators(text, separators, chunkSize)) {
    const length = codePointLength(part)
    units.push({ text: part, start: offset, end: offset + length })
    offset += length
  }
}

function splitBySeparators(text: string, separators: string[], chunkSize: number): string[] {
  if (!text || separators.length === 0 || (chunkSize > 0 && codePointLength(text) <= chunkSize)) return [text]
  for (let index = 0; index < separators.length; index++) {
    const separator = separators[index]
    if (!separator || !text.includes(separator)) continue
    const parts = text.split(new RegExp(`(${escapeRegExp(separator)})`)).filter(Boolean)
    if (parts.length <= 1) continue
    const remaining = separators.slice(index + 1)
    return parts.flatMap((part) =>
      chunkSize > 0 && codePointLength(part) > chunkSize && remaining.length > 0 ? splitBySeparators(part, remaining, chunkSize) : [part]
    )
  }
  return [text]
}

function mergeUnits(units: SplitUnit[], chunkSize: number, overlap: number): SemanticChunk[] {
  if (units.length === 0) return []
  const chunks: SemanticChunk[] = []
  const headerTracker = new TableHeaderTracker()
  let current: SplitUnit[] = []
  let currentLength = 0

  for (const unit of units) {
    const unitLength = codePointLength(unit.text)
    if (unitLength > ABSOLUTE_MAX_CHUNK_SIZE) {
      flushUnits(chunks, current)
      current = []
      currentLength = 0
      const runes = Array.from(unit.text)
      let offset = 0
      while (offset < runes.length) {
        const end = findForcedSplitEnd(runes, offset, ABSOLUTE_MAX_CHUNK_SIZE)
        chunks.push({
          content: runes.slice(offset, end).join(''),
          contextHeader: '',
          seq: chunks.length,
          start: unit.start + offset,
          end: unit.start + end
        })
        offset = end
      }
      continue
    }

    headerTracker.update(unit.text)
    if (headerTracker.headerEndedThisUnit && current.length > 0) {
      flushUnits(chunks, current)
      current = []
      currentLength = 0
    }
    let header = headerTracker.header
    let headerLength = codePointLength(header)
    if (headerLength > chunkSize) {
      header = ''
      headerLength = 0
    }

    if (currentLength + unitLength + headerLength > chunkSize && current.length > 0) {
      flushUnits(chunks, current)
      current = computeOverlap(current, overlap, chunkSize, unitLength)
      currentLength = sumUnitLengths(current)

      while (header && current.length > 0 && currentLength + unitLength + headerLength > chunkSize) {
        currentLength -= codePointLength(current[0].text)
        current.shift()
      }
      if (header && headerLength + unitLength <= chunkSize) {
        const overlapText = current.map((entry) => entry.text).join('')
        if (!headerAlreadyPresent(header, overlapText, unit.text) && !headerColumnMismatch(header, unit.text)) {
          const markerStart = current[0]?.start ?? unit.start
          current.unshift({ text: header, start: markerStart, end: markerStart })
          currentLength += headerLength
        }
      }
    }

    if (currentLength + unitLength > ABSOLUTE_MAX_CHUNK_SIZE && current.length > 0) {
      flushUnits(chunks, current)
      current = []
      currentLength = 0
    }
    current.push(unit)
    currentLength += unitLength
  }
  flushUnits(chunks, current)
  return chunks
}

function flushUnits(chunks: SemanticChunk[], units: SplitUnit[]): void {
  if (units.length === 0) return
  chunks.push({
    content: units.map((unit) => unit.text).join(''),
    contextHeader: '',
    seq: chunks.length,
    start: units[0].start,
    end: units[units.length - 1].end
  })
}

function computeOverlap(units: SplitUnit[], overlap: number, chunkSize: number, nextLength: number): SplitUnit[] {
  if (overlap <= 0) return []
  let overlapLength = 0
  let startIndex = units.length
  for (let index = units.length - 1; index >= 0; index--) {
    const length = codePointLength(units[index].text)
    if (overlapLength + length > overlap || overlapLength + length + nextLength > chunkSize) break
    overlapLength += length
    startIndex = index
  }
  while (startIndex < units.length) {
    const unit = units[startIndex]
    if (unit.start !== unit.end && unit.text.trim() && !isSeparatorOnly(unit.text)) break
    startIndex++
  }
  return units.slice(startIndex)
}

function findForcedSplitEnd(runes: string[], start: number, maximum: number): number {
  let end = Math.min(start + maximum, runes.length)
  if (end === runes.length) return end
  for (let index = end - 1; index > start && index > end - 200; index--) {
    if (runes[index] === '\n' || runes[index] === ' ') return index + 1
  }
  return end
}

function validateChunks(chunks: SemanticChunk[], totalChars: number, chunkSize: number): boolean {
  if (chunks.length === 0) return false
  if (chunks.length === 1 && totalChars > 2 * chunkSize) return false
  const lengths = chunks.map((chunk) => codePointLength(chunk.content))
  const tinyCount = lengths.slice(0, -1).filter((length) => length < MIN_CHUNK_LENGTH).length
  if (tinyCount > chunks.length / 4 && tinyCount > 2) return false
  if (Math.max(...lengths) < chunkSize / 4 && totalChars > chunkSize) return false
  if (Math.max(...lengths) > 2 * chunkSize && chunkSize > 0) return false
  return true
}

function mergeBreadcrumbs(parent: string, child: string): string {
  if (!parent) return child
  if (!child) return parent
  const parentLines = parent.split('\n')
  const childLines = child.split('\n')
  if (parentLines.at(-1)?.trim() === childLines[0]?.trim()) childLines.shift()
  return childLines.length > 0 ? `${parent}\n${childLines.join('\n')}` : parent
}

class HeadingHierarchy {
  private readonly levels: string[]

  constructor(levels: string[] = Array(6).fill('')) {
    this.levels = [...levels]
  }

  observe(line: string): void {
    const match = line.match(MARKDOWN_HEADING_RE)
    if (!match) return
    const level = match[1].length
    this.levels[level - 1] = match[2].trim()
    for (let index = level; index < this.levels.length; index++) this.levels[index] = ''
  }

  breadcrumb(): string {
    return this.levels
      .map((heading, index) => (heading ? `${'#'.repeat(index + 1)} ${heading}` : ''))
      .filter(Boolean)
      .join('\n')
  }

  clone(): HeadingHierarchy {
    return new HeadingHierarchy(this.levels)
  }
}

class TableHeaderTracker {
  header = ''
  headerEndedThisUnit = false
  private pendingBreak = false

  update(unit: string): void {
    this.headerEndedThisUnit = false
    if (this.pendingBreak) {
      this.pendingBreak = false
      if (firstTableRowColumnCount(unit) > 0) this.headerEndedThisUnit = true
      this.header = ''
    }

    if (this.header) {
      const trimmed = unit.trim()
      if (!trimmed || (!trimmed.startsWith('|') && !/^\s/.test(unit))) this.header = ''
      else if (headerColumnMismatch(this.header, unit)) {
        this.header = ''
        this.headerEndedThisUnit = true
      } else if (unit.trimEnd().endsWith('\n\n')) {
        this.pendingBreak = true
      }
    }

    if (!this.header && TABLE_HEADER_RE.test(unit)) this.header = unit.match(TABLE_HEADER_RE)?.[0] ?? ''
  }
}

function headerAlreadyPresent(header: string, overlapText: string, unitText: string): boolean {
  if (overlapText.includes(header) || unitText.includes(header)) return true
  const columnRow = headerColumnRow(header)
  return !!columnRow && (overlapText.includes(columnRow) || unitText.includes(columnRow))
}

function headerColumnRow(header: string): string {
  return (
    header
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.includes('---') && !/^[|\s]+$/.test(line)) ?? ''
  )
}

function headerColumnMismatch(header: string, unit: string): boolean {
  const headerColumns = headerTableColumnCount(header)
  const rowColumns = firstTableRowColumnCount(unit)
  return headerColumns > 0 && rowColumns > 0 && headerColumns !== rowColumns
}

function headerTableColumnCount(header: string): number {
  for (const line of header.split('\n')) {
    if (!line.includes('---')) {
      const count = tableRowColumnCount(line)
      if (count > 0) return count
    }
  }
  return 0
}

function firstTableRowColumnCount(text: string): number {
  for (const line of text.split('\n')) {
    if (TABLE_ROW_RE.test(line.trim())) return tableRowColumnCount(line)
  }
  return 0
}

function tableRowColumnCount(line: string): number {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return 0
  const parts = trimmed.split('|')
  if (!parts[0]?.trim()) parts.shift()
  if (!parts.at(-1)?.trim()) parts.pop()
  return parts.length
}

function buildLineStarts(text: string): number[] {
  const starts = [0]
  Array.from(text).forEach((rune, index) => {
    if (rune === '\n') starts.push(index + 1)
  })
  return starts
}

function lineAtOffset(lineStarts: number[], offset: number): number {
  let low = 0
  let high = lineStarts.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (lineStarts[middle] <= offset) low = middle + 1
    else high = middle
  }
  return Math.max(1, low)
}

function buildUtf16ToCodePointMap(text: string): number[] {
  const map = new Array<number>(text.length + 1)
  let utf16 = 0
  let codePoints = 0
  map[0] = 0
  while (utf16 < text.length) {
    const width = (text.codePointAt(utf16) ?? 0) > 0xffff ? 2 : 1
    for (let index = 1; index <= width; index++) map[utf16 + index] = codePoints + 1
    utf16 += width
    codePoints++
  }
  return map
}

function codePointLength(text: string): number {
  return Array.from(text).length
}

function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0
  return text.split(needle).length - 1
}

function sumUnitLengths(units: SplitUnit[]): number {
  return units.reduce((sum, unit) => sum + codePointLength(unit.text), 0)
}

function isSeparatorOnly(text: string): boolean {
  return /^[\n\r \t。]*$/.test(text)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
