/**
 * Keyword Highlight Service
 * Applies highlighting to terminal output based on keyword-highlight.json configuration
 * Priority: Keyword Highlight > Global Highlight > OS Native Highlight
 */

interface HighlightRule {
  name: string
  enabled: boolean
  scope: 'output' | 'input' | 'both'
  matchType: 'regex' | 'wildcard'
  pattern: string | string[]
  style: {
    foreground: string
    fontStyle: 'bold' | 'normal'
  }
}

interface KeywordHighlightConfig {
  'keyword-highlight': {
    enabled: boolean
    applyTo: {
      output: boolean
      input: boolean
    }
    rules: HighlightRule[]
  }
}

interface HighlightMatch {
  start: number
  end: number
  style: { foreground: string; fontStyle: string }
}

class KeywordHighlightService {
  private config: KeywordHighlightConfig | null = null
  private compiledRules: Array<{
    regex: RegExp
    style: { foreground: string; fontStyle: string }
    scope: 'output' | 'input' | 'both'
  }> = []

  /**
   * Load configuration from file
   */
  async loadConfig(): Promise<void> {
    try {
      const content = await window.api.readKeywordHighlightConfig()
      this.config = JSON.parse(content)
      this.compileRules()
    } catch (error) {
      console.error('[KeywordHighlight] Failed to load config:', error)
      this.config = null
      this.compiledRules = []
    }
  }

  /**
   * Compile rules into regex patterns for performance
   */
  private compileRules(): void {
    if (!this.config || !this.config['keyword-highlight'].enabled) {
      this.compiledRules = []
      return
    }

    this.compiledRules = []
    const rules = this.config['keyword-highlight'].rules

    for (const rule of rules) {
      if (!rule.enabled) continue

      try {
        let regex: RegExp

        if (rule.matchType === 'regex') {
          // Direct regex pattern - preserve flags from pattern
          const pattern = rule.pattern as string
          // Check if pattern already has flags (case insensitive indicated by (?i))
          const hasFlags = pattern.startsWith('(?i)')
          const cleanPattern = hasFlags ? pattern.replace(/^\(\?i\)/, '') : pattern
          const flags = hasFlags ? 'gi' : 'g'
          regex = new RegExp(cleanPattern, flags)
        } else if (rule.matchType === 'wildcard') {
          // Convert wildcard patterns to regex
          const patterns = Array.isArray(rule.pattern) ? rule.pattern : [rule.pattern]
          const regexPattern = patterns
            .map((p) => {
              // Escape special regex characters except * and ?
              let escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&')
              // Convert wildcard to regex: * -> [^\s]*, ? -> [^\s]
              escaped = escaped.replace(/\*/g, '[^\\s]*').replace(/\?/g, '[^\\s]')
              return escaped
            })
            .join('|')
          regex = new RegExp(regexPattern, 'g')
        } else {
          continue
        }

        this.compiledRules.push({
          regex,
          style: rule.style,
          scope: rule.scope
        })
      } catch (error) {
        console.warn(`[KeywordHighlight] Failed to compile rule "${rule.name}":`, error)
      }
    }
  }

  /**
   * Check if highlighting is enabled
   */
  isEnabled(): boolean {
    return this.config?.['keyword-highlight']?.enabled ?? false
  }

  /**
   * Check if highlighting should apply to output
   */
  shouldApplyToOutput(): boolean {
    return this.config?.['keyword-highlight']?.applyTo?.output ?? false
  }

  /**
   * Apply highlighting to text while preserving native ANSI colors
   * Returns text with ANSI escape codes for keyword highlighting
   * Priority: Keyword Highlight > Global Highlight > OS Native Highlight
   */
  applyHighlight(text: string, scope: 'output' | 'input' = 'output'): string {
    if (!this.isEnabled() || this.compiledRules.length === 0) {
      return text
    }

    // Don't apply if scope doesn't match configuration
    if (scope === 'output' && !this.shouldApplyToOutput()) {
      return text
    }

    // Parse the text to extract existing ANSI codes and plain text segments
    const segments = this.parseAnsiText(text)

    // Find all keyword matches in the plain text
    const plainText = segments.map((s) => s.text).join('')
    const matches = this.findMatches(plainText, scope)

    if (matches.length === 0) {
      // No keyword matches, return original text with native colors
      return text
    }

    // Apply keyword highlighting while preserving native colors for non-matching text
    return this.applyMatchesToSegments(segments, matches)
  }

  /**
   * Parse text with ANSI codes into segments
   */
  private parseAnsiText(text: string): Array<{
    text: string
    ansiPrefix: string
    originalStart: number
  }> {
    const segments: Array<{ text: string; ansiPrefix: string; originalStart: number }> = []
    const ansiRegex = /\x1b\[[0-9;]*m/g
    let lastIndex = 0
    let currentAnsi = ''
    let plainTextOffset = 0

    while (lastIndex < text.length) {
      const match = ansiRegex.exec(text)

      if (match) {
        // Text before ANSI code
        if (match.index > lastIndex) {
          const textSegment = text.substring(lastIndex, match.index)
          segments.push({
            text: textSegment,
            ansiPrefix: currentAnsi,
            originalStart: plainTextOffset
          })
          plainTextOffset += textSegment.length
        }

        // Update current ANSI state
        currentAnsi = match[0]
        lastIndex = match.index + match[0].length
      } else {
        // Remaining text
        const textSegment = text.substring(lastIndex)
        if (textSegment.length > 0) {
          segments.push({
            text: textSegment,
            ansiPrefix: currentAnsi,
            originalStart: plainTextOffset
          })
        }
        break
      }
    }

    return segments
  }

  /**
   * Find all matches in plain text
   */
  private findMatches(plainText: string, scope: 'output' | 'input'): HighlightMatch[] {
    const matches: HighlightMatch[] = []

    for (const rule of this.compiledRules) {
      // Check if rule applies to this scope
      if (rule.scope !== 'both' && rule.scope !== scope) {
        continue
      }

      const { regex, style } = rule
      regex.lastIndex = 0 // Reset regex state

      let match
      while ((match = regex.exec(plainText)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          style
        })
      }
    }

    // Sort matches by start position
    matches.sort((a, b) => a.start - b.start)

    // Remove overlapping matches (keep first match due to priority)
    const nonOverlapping: HighlightMatch[] = []
    for (const match of matches) {
      if (nonOverlapping.length === 0 || match.start >= nonOverlapping[nonOverlapping.length - 1].end) {
        nonOverlapping.push(match)
      }
    }

    return nonOverlapping
  }

  /**
   * Apply keyword matches to text segments while preserving native colors
   */
  private applyMatchesToSegments(segments: Array<{ text: string; ansiPrefix: string; originalStart: number }>, matches: HighlightMatch[]): string {
    let result = ''
    let matchIndex = 0

    for (const segment of segments) {
      const segmentStart = segment.originalStart
      const segmentEnd = segmentStart + segment.text.length
      let segmentPos = 0

      // Process matches that overlap with this segment
      while (matchIndex < matches.length && matches[matchIndex].start < segmentEnd) {
        const match = matches[matchIndex]

        // Skip matches that are before this segment
        if (match.end <= segmentStart) {
          matchIndex++
          continue
        }

        // Calculate match position within segment
        const matchStartInSegment = Math.max(0, match.start - segmentStart)
        const matchEndInSegment = Math.min(segment.text.length, match.end - segmentStart)

        // Add text before match with native color
        if (matchStartInSegment > segmentPos) {
          result += segment.ansiPrefix + segment.text.substring(segmentPos, matchStartInSegment)
        }

        // Add matched text with keyword highlight color
        const ansiCode = this.getAnsiCode(match.style.foreground, match.style.fontStyle)
        result += ansiCode + segment.text.substring(matchStartInSegment, matchEndInSegment)

        // Reset to native color after match
        result += '\x1b[0m'

        segmentPos = matchEndInSegment

        // Move to next match if this one ends in this segment
        if (match.end <= segmentEnd) {
          matchIndex++
        } else {
          break
        }
      }

      // Add remaining text in segment with native color
      if (segmentPos < segment.text.length) {
        result += segment.ansiPrefix + segment.text.substring(segmentPos)
      }
    }

    return result
  }

  /**
   * Convert hex color to ANSI 256-color code
   */
  private getAnsiCode(hexColor: string, fontStyle: string): string {
    const rgb = this.hexToRgb(hexColor)
    if (!rgb) return ''

    // Convert RGB to ANSI 256-color
    const colorCode = this.rgbToAnsi256(rgb.r, rgb.g, rgb.b)
    const bold = fontStyle === 'bold' ? '\x1b[1;' : '\x1b['

    return `${bold}38;5;${colorCode}m`
  }

  /**
   * Convert hex color to RGB
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16)
        }
      : null
  }

  /**
   * Convert RGB to ANSI 256-color code
   */
  private rgbToAnsi256(r: number, g: number, b: number): number {
    // Convert RGB to 256-color palette
    // Use 6x6x6 color cube (colors 16-231)
    const rIndex = Math.round((r / 255) * 5)
    const gIndex = Math.round((g / 255) * 5)
    const bIndex = Math.round((b / 255) * 5)

    return 16 + 36 * rIndex + 6 * gIndex + bIndex
  }

  /**
   * Reload configuration
   */
  async reload(): Promise<void> {
    await this.loadConfig()
  }
}

// Singleton instance
export const keywordHighlightService = new KeywordHighlightService()
