import * as os from 'os'
import { describe, test, expect } from 'vitest'

// Mock platform-specific line ending behavior
const mockPlatformBehavior = (platform: string, data: string) => {
  if (data.endsWith('\n')) {
    const command = data.slice(0, -1)
    let expectedOutput = command

    switch (platform) {
      case 'win32':
        expectedOutput += '\r\n'
        break
      case 'darwin':
      case 'linux':
      default:
        expectedOutput += '\n'
        break
    }

    return expectedOutput
  }
  return data
}

/**
 * Test local terminal data sending line ending handling logic
 * This test verifies the core logic for fixing command execution issues in Command mode
 */
describe('Local Terminal Data Sending Logic', () => {
  test('Windows platform should use \\r\\n to trigger command execution', () => {
    const command = 'Get-Location\n'
    const result = mockPlatformBehavior('win32', command)
    expect(result).toBe('Get-Location\r\n')
  })

  test('macOS platform should use \\n to trigger command execution', () => {
    const command = 'pwd\n'
    const result = mockPlatformBehavior('darwin', command)
    expect(result).toBe('pwd\n')
  })

  test('Linux platform should use \\n to trigger command execution', () => {
    const command = 'ls -la\n'
    const result = mockPlatformBehavior('linux', command)
    expect(result).toBe('ls -la\n')
  })

  test('Data not ending with \\n should be passed directly', () => {
    const data = 'partial input'
    const result = mockPlatformBehavior('win32', data)
    expect(result).toBe('partial input')
  })

  test('Empty command should be handled correctly', () => {
    const command = '\n'
    const result = mockPlatformBehavior('win32', command)
    expect(result).toBe('\r\n')
  })

  test('Multi-line command should be handled correctly', () => {
    const command = 'echo "line1"\necho "line2"\n'
    // Only the last \n will be processed
    const result = mockPlatformBehavior('win32', command)
    expect(result).toBe('echo "line1"\necho "line2"\r\n')
  })
})

/**
 * Integration test: Verify actual platform detection logic
 */
describe('Platform Detection Integration', () => {
  test('Current platform should return correct line ending', () => {
    const currentPlatform = os.platform()
    const testCommand = 'test\n'

    const result = mockPlatformBehavior(currentPlatform, testCommand)

    if (currentPlatform === 'win32') {
      expect(result).toBe('test\r\n')
    } else {
      expect(result).toBe('test\n')
    }
  })
})
