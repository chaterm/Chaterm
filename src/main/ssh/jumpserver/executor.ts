/**
 * JumpServer command execution and output parsing utilities
 */

/**
 * Output parser - cleans control characters and echo from command output
 */
export class OutputParser {
  /**
   * Clean command output, remove echo and control characters
   * @param rawOutput Raw output
   * @returns Cleaned output
   */
  static cleanCommandOutput(rawOutput: string): string {
    // Split by lines
    const lines = rawOutput.split(/\r?\n/)

    // Filter out control characters, empty lines, command echo fragments
    const cleanLines = lines.filter((line, index) => {
      const trimmed = line.trim()

      // Keep non-empty lines
      if (!trimmed || trimmed === '\r') {
        return false
      }

      // Remove control characters
      if (trimmed === '\x1b[?2004l' || trimmed.startsWith('\x1b]')) {
        return false
      }

      // Remove echo marker lines
      if (trimmed.includes('echo "') && trimmed.includes('__CHATERM_')) {
        return false
      }

      // Remove marker itself
      if (trimmed.startsWith('__CHATERM_')) {
        return false
      }

      // Remove command echo (first line is usually the command itself)
      if (index === 0 && (trimmed.includes('ls ') || trimmed.includes('sudo '))) {
        return false
      }

      return true
    })

    // Join and clean trailing \r
    const result = cleanLines
      .map((line) => line.replace(/\r$/, ''))
      .join('\n')
      .trim()

    return result
  }

  /**
   * Extract exit code from output
   * @param output Complete output
   * @param exitCodeMarker Exit code marker
   * @returns Exit code, defaults to 0
   */
  static extractExitCode(output: string, exitCodeMarker: string): number {
    const exitCodePattern = new RegExp(`${exitCodeMarker}(\\d+)`)
    const exitCodeMatch = output.match(exitCodePattern)
    return exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0
  }

  /**
   * Generate unique command marker
   * @returns { marker, exitCodeMarker }
   */
  static generateMarkers(): { marker: string; exitCodeMarker: string } {
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(7)

    return {
      marker: `__CHATERM_EXEC_END_${timestamp}_${randomId}__`,
      exitCodeMarker: `__CHATERM_EXIT_CODE_${timestamp}_${randomId}__`
    }
  }
}
