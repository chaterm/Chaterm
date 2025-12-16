import { extractFinalOutput } from './terminalOutputExtractor'

// Test cases
const testCases = [
  {
    name: 'Standard format test',
    input: `Terminal output:\n\`\`\`\nls -la\n-rw-r--r--  1 user  staff  1234 Jan 1 12:00 file.txt\n\`\`\``,
    expected: 'ls -la\n-rw-r--r--  1 user  staff  1234 Jan 1 12:00 file.txt'
  },
  {
    name: 'Simple format test',
    input: `\`\`\`\npwd\n/home/user\n\`\`\``,
    expected: 'pwd\n/home/user'
  },
  {
    name: 'Multi-line output test',
    input: `Terminal output:\n\`\`\`\nCommand 1\nOutput 1\nCommand 2\nOutput 2\n\`\`\``,
    expected: 'Command 1\nOutput 1\nCommand 2\nOutput 2'
  },
  {
    name: 'Empty output test',
    input: `Terminal output:\n\`\`\`\n\n\`\`\``,
    expected: ''
  },
  {
    name: 'Unformatted output test',
    input: 'Unformatted output',
    expected: ''
  },
  {
    name: 'Empty string test',
    input: '',
    expected: ''
  }
]

// Run tests
export const runTests = () => {
  console.log('Starting tests for extractFinalOutput function...')

  let passedTests = 0
  let totalTests = testCases.length

  testCases.forEach((testCase, index) => {
    const result = extractFinalOutput(testCase.input)
    const isPassed = result === testCase.expected

    console.log(`\nTest ${index + 1}: ${testCase.name}`)
    console.log(`Result: ${isPassed ? '✅ Passed' : '❌ Failed'}`)

    if (!isPassed) {
      console.log(`Input: ${JSON.stringify(testCase.input)}`)
      console.log(`Expected: ${JSON.stringify(testCase.expected)}`)
      console.log(`Actual: ${JSON.stringify(result)}`)
    }

    if (isPassed) {
      passedTests++
    }
  })

  console.log(`\nTests completed: ${passedTests}/${totalTests} passed`)

  return passedTests === totalTests
}

// If this file is run directly, execute tests
if (typeof window !== 'undefined') {
  // In browser environment, can be called via console
  ;(window as any).runTerminalOutputTests = runTests
}
