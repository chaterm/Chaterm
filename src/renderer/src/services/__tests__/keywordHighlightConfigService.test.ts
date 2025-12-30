import { describe, it, expect, beforeEach, vi } from 'vitest'
import { KeywordHighlightConfigService } from '../keywordHighlightConfigService'

// Mock window.api
const mockGetKeywordHighlightConfigPath = vi.fn()
const mockReadKeywordHighlightConfig = vi.fn()
const mockWriteKeywordHighlightConfig = vi.fn()
const mockOnKeywordHighlightConfigFileChanged = vi.fn()

global.window = {
  api: {
    getKeywordHighlightConfigPath: mockGetKeywordHighlightConfigPath,
    readKeywordHighlightConfig: mockReadKeywordHighlightConfig,
    writeKeywordHighlightConfig: mockWriteKeywordHighlightConfig,
    onKeywordHighlightConfigFileChanged: mockOnKeywordHighlightConfigFileChanged
  }
} as any

describe('KeywordHighlightConfigService', () => {
  let service: KeywordHighlightConfigService

  beforeEach(() => {
    vi.clearAllMocks()
    // Create a fresh instance for each test
    service = new KeywordHighlightConfigService()
  })

  describe('getConfigPath', () => {
    it('should return config path from main process', async () => {
      const mockPath = '/Users/test/.chaterm/keyword-highlight.json'
      mockGetKeywordHighlightConfigPath.mockResolvedValue(mockPath)

      const path = await service.getConfigPath()

      expect(path).toBe(mockPath)
      expect(mockGetKeywordHighlightConfigPath).toHaveBeenCalledTimes(1)
    })

    it('should cache config path after first call', async () => {
      const mockPath = '/Users/test/.chaterm/keyword-highlight.json'
      mockGetKeywordHighlightConfigPath.mockResolvedValue(mockPath)

      await service.getConfigPath()
      await service.getConfigPath()

      // Should only call main process once
      expect(mockGetKeywordHighlightConfigPath).toHaveBeenCalledTimes(1)
    })

    it('should return empty string if path is null', async () => {
      mockGetKeywordHighlightConfigPath.mockResolvedValue(null)

      const path = await service.getConfigPath()

      expect(path).toBe('')
    })
  })

  describe('readConfigFile', () => {
    it('should read valid config file', async () => {
      const validConfig = JSON.stringify(
        {
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
                pattern: 'error',
                style: {
                  foreground: '#FF0000',
                  fontStyle: 'bold'
                }
              }
            ]
          }
        },
        null,
        2
      )

      mockReadKeywordHighlightConfig.mockResolvedValue(validConfig)

      const content = await service.readConfigFile()

      expect(content).toBe(validConfig)
      expect(mockReadKeywordHighlightConfig).toHaveBeenCalledTimes(1)
    })

    it('should return default config when file is empty', async () => {
      mockReadKeywordHighlightConfig.mockResolvedValue('')

      const content = await service.readConfigFile()

      // Should return default config structure
      expect(content).toContain('keyword-highlight')
      expect(content).toContain('enabled')
      expect(content).toContain('applyTo')
      expect(content).toContain('rules')

      const parsed = JSON.parse(content)
      expect(parsed['keyword-highlight'].enabled).toBe(true)
      expect(parsed['keyword-highlight'].applyTo.output).toBe(true)
      expect(parsed['keyword-highlight'].applyTo.input).toBe(false)
      expect(parsed['keyword-highlight'].rules).toEqual([])
    })

    it('should return default config when file contains only whitespace', async () => {
      mockReadKeywordHighlightConfig.mockResolvedValue('   \n\t  ')

      const content = await service.readConfigFile()

      const parsed = JSON.parse(content)
      expect(parsed['keyword-highlight']).toBeDefined()
      expect(parsed['keyword-highlight'].enabled).toBe(true)
    })

    it('should return original content when JSON is invalid', async () => {
      const invalidJson = '{invalid json content'
      mockReadKeywordHighlightConfig.mockResolvedValue(invalidJson)

      const content = await service.readConfigFile()

      // Should return original content for user to manually fix
      expect(content).toBe(invalidJson)
    })

    it('should throw error when read fails', async () => {
      const errorMessage = 'Failed to read file'
      mockReadKeywordHighlightConfig.mockRejectedValue(new Error(errorMessage))

      await expect(service.readConfigFile()).rejects.toThrow()
    })

    it('should validate JSON format', async () => {
      const validJson = JSON.stringify({
        'keyword-highlight': {
          enabled: false,
          applyTo: { output: false, input: false },
          rules: []
        }
      })

      mockReadKeywordHighlightConfig.mockResolvedValue(validJson)

      const content = await service.readConfigFile()

      // Should return the valid JSON
      expect(() => JSON.parse(content)).not.toThrow()
      expect(content).toBe(validJson)
    })
  })

  describe('writeConfigFile', () => {
    it('should write config file successfully', async () => {
      const config = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: { output: true, input: false },
          rules: []
        }
      })

      mockWriteKeywordHighlightConfig.mockResolvedValue(undefined)

      await service.writeConfigFile(config)

      expect(mockWriteKeywordHighlightConfig).toHaveBeenCalledWith(config)
      expect(mockWriteKeywordHighlightConfig).toHaveBeenCalledTimes(1)
    })

    it('should throw error when write fails', async () => {
      const config = '{}'
      const errorMessage = 'Failed to write file'
      mockWriteKeywordHighlightConfig.mockRejectedValue(new Error(errorMessage))

      await expect(service.writeConfigFile(config)).rejects.toThrow()
    })

    it('should handle empty string content', async () => {
      mockWriteKeywordHighlightConfig.mockResolvedValue(undefined)

      await service.writeConfigFile('')

      expect(mockWriteKeywordHighlightConfig).toHaveBeenCalledWith('')
    })

    it('should handle large config content', async () => {
      const largeConfig = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: { output: true, input: false },
          rules: Array(100).fill({
            name: 'Rule',
            enabled: true,
            scope: 'output',
            matchType: 'regex',
            pattern: 'test',
            style: { foreground: '#FF0000', fontStyle: 'bold' }
          })
        }
      })

      mockWriteKeywordHighlightConfig.mockResolvedValue(undefined)

      await service.writeConfigFile(largeConfig)

      expect(mockWriteKeywordHighlightConfig).toHaveBeenCalledWith(largeConfig)
    })
  })

  describe('onFileChanged', () => {
    it('should register file change listener', () => {
      const callback = vi.fn()
      const unsubscribe = vi.fn()

      mockOnKeywordHighlightConfigFileChanged.mockReturnValue(unsubscribe)

      const result = service.onFileChanged(callback)

      expect(mockOnKeywordHighlightConfigFileChanged).toHaveBeenCalledWith(callback)
      expect(result).toBe(unsubscribe)
    })

    it('should return undefined when listener is not available', () => {
      // Temporarily remove the listener
      const originalListener = window.api.onKeywordHighlightConfigFileChanged
      delete (window.api as any).onKeywordHighlightConfigFileChanged

      const callback = vi.fn()
      const result = service.onFileChanged(callback)

      expect(result).toBeUndefined()

      // Restore
      window.api.onKeywordHighlightConfigFileChanged = originalListener
    })

    it('should allow multiple listeners', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const unsubscribe1 = vi.fn()
      const unsubscribe2 = vi.fn()

      mockOnKeywordHighlightConfigFileChanged.mockReturnValueOnce(unsubscribe1).mockReturnValueOnce(unsubscribe2)

      service.onFileChanged(callback1)
      service.onFileChanged(callback2)

      expect(mockOnKeywordHighlightConfigFileChanged).toHaveBeenCalledTimes(2)
    })
  })

  describe('integration scenarios', () => {
    it('should handle complete config lifecycle', async () => {
      // 1. Get path
      const mockPath = '/Users/test/.chaterm/keyword-highlight.json'
      mockGetKeywordHighlightConfigPath.mockResolvedValue(mockPath)

      const path = await service.getConfigPath()
      expect(path).toBe(mockPath)

      // 2. Read config
      const initialConfig = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: { output: true, input: false },
          rules: []
        }
      })
      mockReadKeywordHighlightConfig.mockResolvedValue(initialConfig)

      const readContent = await service.readConfigFile()
      expect(readContent).toBe(initialConfig)

      // 3. Modify and write config
      const updatedConfig = JSON.stringify({
        'keyword-highlight': {
          enabled: false,
          applyTo: { output: false, input: false },
          rules: []
        }
      })
      mockWriteKeywordHighlightConfig.mockResolvedValue(undefined)

      await service.writeConfigFile(updatedConfig)
      expect(mockWriteKeywordHighlightConfig).toHaveBeenCalledWith(updatedConfig)
    })

    it('should handle file watcher during editing', async () => {
      const callback = vi.fn()
      const unsubscribe = vi.fn()

      mockOnKeywordHighlightConfigFileChanged.mockImplementation((cb) => {
        // Simulate file change
        setTimeout(() => cb('new config content'), 0)
        return unsubscribe
      })

      service.onFileChanged(callback)

      // Wait for async callback
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(callback).toHaveBeenCalledWith('new config content')
    })
  })

  describe('edge cases', () => {
    it('should handle null or undefined values gracefully', async () => {
      mockReadKeywordHighlightConfig.mockResolvedValue(null as any)

      const content = await service.readConfigFile()

      // Should return default config when null
      const parsed = JSON.parse(content)
      expect(parsed['keyword-highlight']).toBeDefined()
    })

    it('should handle very long config paths', async () => {
      const longPath = '/Users/' + 'a'.repeat(1000) + '/keyword-highlight.json'
      mockGetKeywordHighlightConfigPath.mockResolvedValue(longPath)

      const path = await service.getConfigPath()

      expect(path).toBe(longPath)
    })

    it('should handle special characters in config content', async () => {
      const specialConfig = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: { output: true, input: false },
          rules: [
            {
              name: 'Special chars: "quotes" and \\backslash\\',
              enabled: true,
              scope: 'output',
              matchType: 'regex',
              pattern: '[\\s\\S]*',
              style: { foreground: '#FF0000', fontStyle: 'bold' }
            }
          ]
        }
      })

      mockReadKeywordHighlightConfig.mockResolvedValue(specialConfig)

      const content = await service.readConfigFile()

      expect(content).toBe(specialConfig)
      expect(() => JSON.parse(content)).not.toThrow()
    })

    it('should handle Unicode characters in config', async () => {
      const unicodeConfig = JSON.stringify({
        'keyword-highlight': {
          enabled: true,
          applyTo: { output: true, input: false },
          rules: [
            {
              name: '中文测试 テスト 테스트',
              enabled: true,
              scope: 'output',
              matchType: 'regex',
              pattern: '[一-龥]+',
              style: { foreground: '#FF0000', fontStyle: 'bold' }
            }
          ]
        }
      })

      mockWriteKeywordHighlightConfig.mockResolvedValue(undefined)

      await service.writeConfigFile(unicodeConfig)

      expect(mockWriteKeywordHighlightConfig).toHaveBeenCalledWith(unicodeConfig)
    })
  })
})
