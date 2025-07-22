/**
 * Extracts the raw output content from formatted terminal output
 * @param formattedOutput The formatted output string, format: Terminal output:\n```\ncontent\n```
 * @returns The extracted raw output content, or an empty string if not found
 */
export const extractFinalOutput = (formattedOutput: string): string => {
  if (!formattedOutput || typeof formattedOutput !== 'string') {
    return formattedOutput
  }

  // Main match pattern: Terminal output:\n```\ncontent\n```
  const mainRegex = /Terminal output:\n```\n([\s\S]*?)\n```/
  const mainMatch = formattedOutput.match(mainRegex)

  if (mainMatch && mainMatch[1]) {
    return mainMatch[1].trim()
  }

  // Alternative match pattern: ```\ncontent\n```
  const alternativeRegex = /```\n([\s\S]*?)\n```/
  const altMatch = formattedOutput.match(alternativeRegex)

  if (altMatch && altMatch[1]) {
    return altMatch[1].trim()
  }

  // If neither matches, try to extract everything between ```
  const simpleRegex = /```([\s\S]*?)```/
  const simpleMatch = formattedOutput.match(simpleRegex)

  if (simpleMatch && simpleMatch[1]) {
    return simpleMatch[1].trim()
  }

  return formattedOutput
}

/**
 * Test extraction function
 */
export const testExtractFinalOutput = () => {
  const testCases = [
    {
      input: `Terminal output:\n\`\`\`\nls -la\n-rw-r--r--  1 user  staff  1234 Jan 1 12:00 file.txt\n\`\`\``,
      expected: 'ls -la\n-rw-r--r--  1 user  staff  1234 Jan 1 12:00 file.txt'
    },
    {
      input: `\`\`\`\npwd\n/home/user\n\`\`\``,
      expected: 'pwd\n/home/user'
    },
    {
      input: 'No formatted output',
      expected: ''
    }
  ]

  testCases.forEach((testCase, index) => {
    const result = extractFinalOutput(testCase.input)
    console.log(`Test case ${index + 1}:`, result === testCase.expected ? 'Passed' : 'Failed')
    console.log('Input:', testCase.input)
    console.log('Expected:', testCase.expected)
    console.log('Actual:', result)
    console.log('---')
  })
}
