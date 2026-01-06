import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock window.api
const mockReadKeywordHighlightConfig = vi.fn()
global.window = {
  api: {
    readKeywordHighlightConfig: mockReadKeywordHighlightConfig
  }
} as any

// Import after mocking
import { keywordHighlightService } from '../keywordHighlightService'

describe('KeywordHighlightService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loadConfig', () => {
    it('should load valid config successfully', async () => {
      const validConfig = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: {
            output: true,
            input: false
          },
          rules: [
            {
              name: 'Test Rule',
              enabled: true,
              scope: 'output',
              matchType: 'regex',
              pattern: '\\berror\\b',
              style: {
                foreground: '#FF0000',
                fontStyle: 'bold'
              }
            }
          ]
        }
      })

      mockReadKeywordHighlightConfig.mockResolvedValue(validConfig)
      await keywordHighlightService.loadConfig()

      expect(keywordHighlightService.isEnabled()).toBe(true)
      expect(keywordHighlightService.shouldApplyToOutput()).toBe(true)
    })

    it('should handle empty config', async () => {
      mockReadKeywordHighlightConfig.mockResolvedValue('')
      await keywordHighlightService.loadConfig()

      expect(keywordHighlightService.isEnabled()).toBe(false)
    })

    it('should handle invalid JSON', async () => {
      mockReadKeywordHighlightConfig.mockResolvedValue('invalid json')
      await keywordHighlightService.loadConfig()

      expect(keywordHighlightService.isEnabled()).toBe(false)
    })

    it('should handle load error', async () => {
      mockReadKeywordHighlightConfig.mockRejectedValue(new Error('Load failed'))
      await keywordHighlightService.loadConfig()

      expect(keywordHighlightService.isEnabled()).toBe(false)
    })
  })

  describe('applyHighlight', () => {
    beforeEach(async () => {
      const config = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: {
            output: true,
            input: false
          },
          rules: [
            {
              name: 'Error Rule',
              enabled: true,
              scope: 'output',
              matchType: 'regex',
              pattern: '(?i)\\berror\\b',
              style: {
                foreground: '#FF0000',
                fontStyle: 'bold'
              }
            },
            {
              name: 'Success Rule',
              enabled: true,
              scope: 'output',
              matchType: 'regex',
              pattern: '(?i)\\bsuccess\\b',
              style: {
                foreground: '#00FF00',
                fontStyle: 'normal'
              }
            }
          ]
        }
      })

      mockReadKeywordHighlightConfig.mockResolvedValue(config)
      await keywordHighlightService.loadConfig()
    })

    it('should apply highlighting to matched keywords', () => {
      const input = 'This is an error message'
      const output = keywordHighlightService.applyHighlight(input, 'output')

      // Output should contain ANSI escape codes
      expect(output).toContain('\x1b[')
      expect(output).not.toBe(input)
    })

    it('should preserve original text when no match', () => {
      const input = 'This is a normal message'
      const output = keywordHighlightService.applyHighlight(input, 'output')

      expect(output).toBe(input)
    })

    it('should handle case-insensitive matching with (?i) flag', () => {
      const input1 = 'ERROR occurred'
      const input2 = 'error occurred'
      const input3 = 'Error occurred'

      const output1 = keywordHighlightService.applyHighlight(input1, 'output')
      const output2 = keywordHighlightService.applyHighlight(input2, 'output')
      const output3 = keywordHighlightService.applyHighlight(input3, 'output')

      // All should be highlighted (not equal to original)
      expect(output1).not.toBe(input1)
      expect(output2).not.toBe(input2)
      expect(output3).not.toBe(input3)
    })

    it('should handle multiple matches in one line', () => {
      const input = 'error occurred with success status'
      const output = keywordHighlightService.applyHighlight(input, 'output')

      // Should contain multiple ANSI codes for both "error" and "success"
      expect(output).toContain('\x1b[')
      expect(output).not.toBe(input)
    })

    it('should return original when disabled', async () => {
      const disabledConfig = JSON.stringify({
        'keyword-highlight': {
          enabled: false,
          applyTo: {
            output: true,
            input: false
          },
          rules: []
        }
      })

      mockReadKeywordHighlightConfig.mockResolvedValue(disabledConfig)
      await keywordHighlightService.loadConfig()

      const input = 'error message'
      const output = keywordHighlightService.applyHighlight(input, 'output')

      expect(output).toBe(input)
    })

    it('should return original when no rules', async () => {
      const noRulesConfig = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: {
            output: true,
            input: false
          },
          rules: []
        }
      })

      mockReadKeywordHighlightConfig.mockResolvedValue(noRulesConfig)
      await keywordHighlightService.loadConfig()

      const input = 'error message'
      const output = keywordHighlightService.applyHighlight(input, 'output')

      expect(output).toBe(input)
    })
  })

  describe('scope filtering', () => {
    it('should apply output-only rules to output scope', async () => {
      const config = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: {
            output: true,
            input: true
          },
          rules: [
            {
              name: 'Output Only',
              enabled: true,
              scope: 'output',
              matchType: 'regex',
              pattern: 'error',
              style: {
                foreground: '#FF0000',
                fontStyle: 'bold'
              }
            }
          ]
        }
      })

      mockReadKeywordHighlightConfig.mockResolvedValue(config)
      await keywordHighlightService.loadConfig()

      const input = 'error message'
      const outputResult = keywordHighlightService.applyHighlight(input, 'output')
      const inputResult = keywordHighlightService.applyHighlight(input, 'input')

      expect(outputResult).not.toBe(input) // Should be highlighted
      expect(inputResult).toBe(input) // Should not be highlighted
    })

    it('should apply input-only rules to input scope', async () => {
      const config = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: {
            output: true,
            input: true
          },
          rules: [
            {
              name: 'Input Only',
              enabled: true,
              scope: 'input',
              matchType: 'regex',
              pattern: 'sudo',
              style: {
                foreground: '#FF0000',
                fontStyle: 'bold'
              }
            }
          ]
        }
      })

      mockReadKeywordHighlightConfig.mockResolvedValue(config)
      await keywordHighlightService.loadConfig()

      const input = 'sudo command'
      const outputResult = keywordHighlightService.applyHighlight(input, 'output')
      const inputResult = keywordHighlightService.applyHighlight(input, 'input')

      expect(outputResult).toBe(input) // Should not be highlighted
      expect(inputResult).not.toBe(input) // Should be highlighted
    })

    it('should apply both-scope rules to both output and input', async () => {
      const config = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: {
            output: true,
            input: true
          },
          rules: [
            {
              name: 'Both Scopes',
              enabled: true,
              scope: 'both',
              matchType: 'regex',
              pattern: 'test',
              style: {
                foreground: '#0000FF',
                fontStyle: 'normal'
              }
            }
          ]
        }
      })

      mockReadKeywordHighlightConfig.mockResolvedValue(config)
      await keywordHighlightService.loadConfig()

      const input = 'test command'
      const outputResult = keywordHighlightService.applyHighlight(input, 'output')
      const inputResult = keywordHighlightService.applyHighlight(input, 'input')

      expect(outputResult).not.toBe(input) // Should be highlighted
      expect(inputResult).not.toBe(input) // Should be highlighted
    })
  })

  describe('wildcard pattern matching', () => {
    beforeEach(async () => {
      const config = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: {
            output: true,
            input: false
          },
          rules: [
            {
              name: 'Path Wildcard',
              enabled: true,
              scope: 'output',
              matchType: 'wildcard',
              pattern: ['/etc/*', '*.conf'],
              style: {
                foreground: '#00FFFF',
                fontStyle: 'normal'
              }
            }
          ]
        }
      })

      mockReadKeywordHighlightConfig.mockResolvedValue(config)
      await keywordHighlightService.loadConfig()
    })

    it('should match wildcard patterns with *', () => {
      const input1 = '/etc/nginx/nginx.conf'
      const input2 = 'test.conf'

      const output1 = keywordHighlightService.applyHighlight(input1, 'output')
      const output2 = keywordHighlightService.applyHighlight(input2, 'output')

      expect(output1).not.toBe(input1)
      expect(output2).not.toBe(input2)
    })

    it('should not match non-wildcard patterns', () => {
      const input = '/var/log/test.log'
      const output = keywordHighlightService.applyHighlight(input, 'output')

      expect(output).toBe(input)
    })
  })

  describe('ANSI preservation', () => {
    beforeEach(async () => {
      const config = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: {
            output: true,
            input: false
          },
          rules: [
            {
              name: 'Error',
              enabled: true,
              scope: 'output',
              matchType: 'regex',
              pattern: 'error',
              style: {
                foreground: '#FF0000',
                fontStyle: 'bold'
              }
            }
          ]
        }
      })

      mockReadKeywordHighlightConfig.mockResolvedValue(config)
      await keywordHighlightService.loadConfig()
    })

    it('should preserve existing ANSI codes for non-matching text', () => {
      // Text with existing ANSI color code (green)
      const input = '\x1b[32mSuccess\x1b[0m and error occurred'
      const output = keywordHighlightService.applyHighlight(input, 'output')

      // Output should contain both the original green code and new error highlighting
      expect(output).toContain('\x1b[32m') // Original green code preserved
      expect(output).toContain('Success')
      expect(output).toContain('error')
    })

    it('should handle text with multiple ANSI codes', () => {
      const input = '\x1b[32mGreen\x1b[0m \x1b[34mBlue\x1b[0m error \x1b[33mYellow\x1b[0m'
      const output = keywordHighlightService.applyHighlight(input, 'output')

      // Should preserve original colors for non-matching parts
      expect(output).toContain('\x1b[32m') // Green
      expect(output).toContain('\x1b[34m') // Blue
      expect(output).toContain('\x1b[33m') // Yellow
    })

    it('should handle plain text without ANSI codes', () => {
      const input = 'This is an error message'
      const output = keywordHighlightService.applyHighlight(input, 'output')

      // Should add ANSI codes only for the matched word
      expect(output).toContain('\x1b[')
      expect(output).toContain('error')
    })
  })

  describe('priority and overlapping matches', () => {
    beforeEach(async () => {
      const config = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: {
            output: true,
            input: false
          },
          rules: [
            {
              name: 'Rule 1',
              enabled: true,
              scope: 'output',
              matchType: 'regex',
              pattern: 'error',
              style: {
                foreground: '#FF0000',
                fontStyle: 'bold'
              }
            },
            {
              name: 'Rule 2',
              enabled: true,
              scope: 'output',
              matchType: 'regex',
              pattern: 'fatal error',
              style: {
                foreground: '#FF00FF',
                fontStyle: 'bold'
              }
            }
          ]
        }
      })

      mockReadKeywordHighlightConfig.mockResolvedValue(config)
      await keywordHighlightService.loadConfig()
    })

    it('should handle overlapping matches with priority', () => {
      const input = 'fatal error occurred'
      const output = keywordHighlightService.applyHighlight(input, 'output')

      // Should apply first matching rule and skip overlapping matches
      expect(output).not.toBe(input)
      expect(output).toContain('fatal')
      expect(output).toContain('error')
    })
  })

  describe('disabled rules', () => {
    it('should skip disabled rules', async () => {
      const config = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: {
            output: true,
            input: false
          },
          rules: [
            {
              name: 'Disabled Rule',
              enabled: false,
              scope: 'output',
              matchType: 'regex',
              pattern: 'error',
              style: {
                foreground: '#FF0000',
                fontStyle: 'bold'
              }
            }
          ]
        }
      })

      mockReadKeywordHighlightConfig.mockResolvedValue(config)
      await keywordHighlightService.loadConfig()

      const input = 'error message'
      const output = keywordHighlightService.applyHighlight(input, 'output')

      expect(output).toBe(input) // Should not be highlighted
    })
  })

  describe('hex to ANSI conversion', () => {
    beforeEach(async () => {
      const config = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: {
            output: true,
            input: false
          },
          rules: [
            {
              name: 'Test Color',
              enabled: true,
              scope: 'output',
              matchType: 'regex',
              pattern: 'test',
              style: {
                foreground: '#FF0000',
                fontStyle: 'bold'
              }
            }
          ]
        }
      })

      mockReadKeywordHighlightConfig.mockResolvedValue(config)
      await keywordHighlightService.loadConfig()
    })

    it('should convert hex colors to ANSI 256-color codes', () => {
      const input = 'test message'
      const output = keywordHighlightService.applyHighlight(input, 'output')

      // Should contain ANSI 256-color format: \x1b[1;38;5;{code}m
      expect(output).toMatch(/\x1b\[1;38;5;\d+m/)
    })
  })

  describe('background color preservation', () => {
    beforeEach(async () => {
      const config = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: {
            output: true,
            input: false
          },
          rules: [
            {
              name: 'Test Keyword',
              enabled: true,
              scope: 'output',
              matchType: 'regex',
              pattern: 'sudo',
              style: {
                foreground: '#AF52DE',
                fontStyle: 'bold'
              }
            }
          ]
        }
      })

      mockReadKeywordHighlightConfig.mockResolvedValue(config)
      await keywordHighlightService.loadConfig()
    })

    it('should restore original ANSI state after highlighting', () => {
      const input = 'sudo command'
      const output = keywordHighlightService.applyHighlight(input, 'output')

      // For plain text without ANSI codes, should use full reset \x1b[0m
      expect(output).toContain('\x1b[0m')
      expect(output).toContain('sudo')
    })

    it('should preserve background color in commands like "sudo umount /tmp/jfs_temp"', () => {
      const input = 'sudo umount /tmp/jfs_temp'
      const output = keywordHighlightService.applyHighlight(input, 'output')

      // Should highlight 'sudo' and use full reset for plain text
      expect(output).toContain('sudo')
      expect(output).toContain('\x1b[0m')
    })

    it('should preserve accumulated ANSI state with foreground and background colors', () => {
      // Simulate Ubuntu terminal with both foreground and background colors
      const input = '\x1b[31m\x1b[47msudo command\x1b[0m'
      const output = keywordHighlightService.applyHighlight(input, 'output')

      // Should accumulate \x1b[31m (red fg) and \x1b[47m (white bg) and restore them after highlighting
      expect(output).toContain('\x1b[31m\x1b[47m')
      expect(output).toContain('sudo')
    })
  })

  describe('reload', () => {
    it('should reload config successfully', async () => {
      const config1 = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: { output: true, input: false },
          rules: []
        }
      })

      const config2 = JSON.stringify({
        'keyword-highlight': {
          enabled: false,
          applyTo: { output: true, input: false },
          rules: []
        }
      })

      mockReadKeywordHighlightConfig.mockResolvedValueOnce(config1)
      await keywordHighlightService.loadConfig()
      expect(keywordHighlightService.isEnabled()).toBe(true)

      mockReadKeywordHighlightConfig.mockResolvedValueOnce(config2)
      await keywordHighlightService.reload()
      expect(keywordHighlightService.isEnabled()).toBe(false)
    })
  })
})
