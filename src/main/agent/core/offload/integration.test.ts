import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeToolOutput, readOffloadedFile, shouldOffload, listOffloadFiles, deleteOffloadDir, WriteOffloadResult } from './index'

describe('Offload Integration Tests', () => {
  const testTaskId = 'integration-test-task-123'

  beforeEach(async () => {
    // Clean up before each test
    try {
      await deleteOffloadDir(testTaskId)
    } catch {
      // Ignore if doesn't exist
    }
  })

  afterEach(async () => {
    // Clean up after each test
    try {
      await deleteOffloadDir(testTaskId)
    } catch {
      // Ignore if doesn't exist
    }
  })

  describe('End-to-end workflow', () => {
    it('should handle complete offload workflow', async () => {
      const toolDescription = 'execute_command for "ls -la"'
      const largeOutput = 'a'.repeat(5000) // Exceeds default threshold

      // 1. Write tool output
      const writeResult = await writeToolOutput(testTaskId, toolDescription, largeOutput)
      expect(writeResult.path).toBeTruthy()
      expect(writeResult.relativePath).toBeTruthy()
      expect(writeResult.size).toBe(largeOutput.length)

      // 2. List files
      const files = await listOffloadFiles(testTaskId)
      expect(files).toHaveLength(1)
      expect(files[0]).toBe(writeResult.relativePath)

      // 3. Read back using relative path
      const content = await readOffloadedFile(testTaskId, writeResult.relativePath)
      expect(content).toBe(largeOutput)

      // 4. Read back using absolute path
      const contentAbs = await readOffloadedFile(testTaskId, writeResult.path)
      expect(contentAbs).toBe(largeOutput)

      // 5. Clean up
      await deleteOffloadDir(testTaskId)
      const filesAfterDelete = await listOffloadFiles(testTaskId)
      expect(filesAfterDelete).toEqual([])
    })

    it('should handle multiple tool outputs in same task', async () => {
      const outputs = [
        { tool: 'execute_command', content: 'a'.repeat(5000) },
        { tool: 'grep_search', content: 'b'.repeat(6000) },
        { tool: 'read_file', content: 'c'.repeat(7000) }
      ]

      const writeResults: WriteOffloadResult[] = []
      for (const output of outputs) {
        const result = await writeToolOutput(testTaskId, output.tool, output.content)
        writeResults.push(result)
      }

      // Verify all files exist
      const files = await listOffloadFiles(testTaskId)
      expect(files).toHaveLength(3)

      // Verify each file can be read back correctly
      for (let i = 0; i < outputs.length; i++) {
        const content = await readOffloadedFile(testTaskId, writeResults[i].relativePath)
        expect(content).toBe(outputs[i].content)
      }
    })

    it('should properly determine when to offload', () => {
      const smallContent = 'a'.repeat(100)
      const largeContent = 'a'.repeat(5000)

      expect(shouldOffload(smallContent)).toBe(false)
      expect(shouldOffload(largeContent)).toBe(true)
    })

    it('should handle file path with special characters', async () => {
      const toolDescription = 'execute_command for "ls -la /path/with spaces"'
      const content = 'test content'

      const result = await writeToolOutput(testTaskId, toolDescription, content)
      expect(result.relativePath).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.txt$/)

      const readContent = await readOffloadedFile(testTaskId, result.relativePath)
      expect(readContent).toBe(content)
    })
  })

  describe('Edge cases', () => {
    it('should handle empty content', async () => {
      const result = await writeToolOutput(testTaskId, 'test_tool', '')
      const content = await readOffloadedFile(testTaskId, result.relativePath)
      expect(content).toBe('')
    })

    it('should handle very large content', async () => {
      const largeContent = 'x'.repeat(1024 * 1024) // 1MB
      const result = await writeToolOutput(testTaskId, 'large_tool', largeContent)
      const content = await readOffloadedFile(testTaskId, result.relativePath)
      expect(content).toBe(largeContent)
      expect(result.size).toBe(largeContent.length)
    })

    it('should handle unicode content', async () => {
      const unicodeContent = '你好世界 🌍 こんにちは мир'
      const result = await writeToolOutput(testTaskId, 'unicode_tool', unicodeContent)
      const content = await readOffloadedFile(testTaskId, result.relativePath)
      expect(content).toBe(unicodeContent)
    })

    it('should reject path traversal in readOffloadedFile', async () => {
      await expect(readOffloadedFile(testTaskId, '../../../etc/passwd')).rejects.toThrow(/outside task offload directory|Access denied/)
      await expect(readOffloadedFile(testTaskId, '..')).rejects.toThrow(/outside task offload directory|Access denied/)
    })
  })
})
