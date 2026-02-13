/**
 * Keyword Highlight Service
 * Applies highlighting to terminal output based on keyword-highlight.json configuration
 * Priority: Keyword Highlight > Global Highlight > OS Native Highlight
 */

const logger = createRendererLogger('service.keywordHighlight')

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
      logger.error('Failed to load config', { error: error })
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
        logger.warn('Failed to compile rule', { ruleName: rule.name, error: error })
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
   * Tracks the complete ANSI state by accumulating all codes until a reset
   */
  private parseAnsiText(text: string): Array<{
    text: string
    ansiPrefix: string
    originalStart: number
  }> {
    const segments: Array<{ text: string; ansiPrefix: string; originalStart: number }> = []
    const ansiRegex = /\x1b\[[0-9;]*m/g
    let lastIndex = 0
    let accumulatedAnsi = '' // Accumulate all ANSI codes to maintain full state
    let plainTextOffset = 0

    let match
    while ((match = ansiRegex.exec(text)) !== null) {
      // Text before ANSI code
      if (match.index > lastIndex) {
        const textSegment = text.substring(lastIndex, match.index)
        segments.push({
          text: textSegment,
          ansiPrefix: accumulatedAnsi,
          originalStart: plainTextOffset
        })
        plainTextOffset += textSegment.length
      }

      // Check if this is a reset code
      // A reset can be:
      // - \x1b[0m or \x1b[m - explicit reset
      // - \x1b[0;...m - reset followed by other attributes (the 0 resets first)
      const code = match[0]
      if (code === '\x1b[0m' || code === '\x1b[m' || /^\x1b\[0[;m]/.test(code)) {
        // Reset all accumulated state, then apply any new attributes after the 0
        if (code === '\x1b[0m' || code === '\x1b[m') {
          accumulatedAnsi = ''
        } else {
          // Extract attributes after the leading 0 and rebuild the code
          // e.g., \x1b[0;1;32m -> reset, then apply \x1b[1;32m
          const attrs = code.slice(3, -1) // Remove \x1b[ and m
          const parts = attrs.split(';').slice(1) // Remove the leading 0
          accumulatedAnsi = parts.length > 0 ? `\x1b[${parts.join(';')}m` : ''
        }
      } else {
        // Accumulate ANSI codes to maintain full state
        accumulatedAnsi += code
      }

      lastIndex = match.index + match[0].length
    }

    // Remaining text after last ANSI code
    if (lastIndex < text.length) {
      const textSegment = text.substring(lastIndex)
      if (textSegment.length > 0) {
        segments.push({
          text: textSegment,
          ansiPrefix: accumulatedAnsi,
          originalStart: plainTextOffset
        })
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
   * Tracks ANSI state across segments to ensure proper reset between segments
   */
  private applyMatchesToSegments(segments: Array<{ text: string; ansiPrefix: string; originalStart: number }>, matches: HighlightMatch[]): string {
    let result = ''
    let matchIndex = 0
    let lastAnsiState = '' // Track the last ANSI state output

    for (const segment of segments) {
      const segmentStart = segment.originalStart
      const segmentEnd = segmentStart + segment.text.length
      let segmentPos = 0

      // Ensure correct ANSI state at segment start
      // If the current state differs from what this segment expects, do a transition
      if (lastAnsiState !== segment.ansiPrefix) {
        if (segment.ansiPrefix === '') {
          // Need to reset to default state
          if (lastAnsiState !== '') {
            result += '\x1b[0m'
          }
        } else {
          // Need to set new ANSI state
          result += '\x1b[0m' + segment.ansiPrefix
        }
        lastAnsiState = segment.ansiPrefix
      }

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

        // Add text before match (ANSI state already set at segment start)
        if (matchStartInSegment > segmentPos) {
          result += segment.text.substring(segmentPos, matchStartInSegment)
        }

        // Add matched text with keyword highlight color
        const ansiCode = this.getAnsiCode(match.style.foreground, match.style.fontStyle)
        result += ansiCode + segment.text.substring(matchStartInSegment, matchEndInSegment)

        // Restore segment's ANSI state after highlighting
        if (segment.ansiPrefix) {
          result += '\x1b[0m' + segment.ansiPrefix
        } else {
          result += '\x1b[0m'
        }
        lastAnsiState = segment.ansiPrefix

        segmentPos = matchEndInSegment

        // Move to next match if this one ends in this segment
        if (match.end <= segmentEnd) {
          matchIndex++
        } else {
          break
        }
      }

      // Add remaining text in segment (ANSI state already correct)
      if (segmentPos < segment.text.length) {
        result += segment.text.substring(segmentPos)
      }
    }

    // Ensure we end with a clean state to prevent color leakage
    // If the last segment had an ANSI prefix, we need to reset it
    if (lastAnsiState !== '') {
      result += '\x1b[0m'
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
