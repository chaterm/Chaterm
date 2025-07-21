/**
 * 从格式化的终端输出中提取原始输出内容
 * @param formattedOutput 格式化的输出字符串，格式如：Terminal output:\n```\n内容\n```
 * @returns 提取的原始输出内容，如果未找到则返回空字符串
 */
export const extractFinalOutput = (formattedOutput: string): string => {
  if (!formattedOutput || typeof formattedOutput !== 'string') {
    return ''
  }

  // 主要匹配模式：Terminal output:\n```\n内容\n```
  const mainRegex = /Terminal output:\n```\n([\s\S]*?)\n```/
  const mainMatch = formattedOutput.match(mainRegex)

  if (mainMatch && mainMatch[1]) {
    return mainMatch[1].trim()
  }

  // 备用匹配模式：```\n内容\n```
  const alternativeRegex = /```\n([\s\S]*?)\n```/
  const altMatch = formattedOutput.match(alternativeRegex)

  if (altMatch && altMatch[1]) {
    return altMatch[1].trim()
  }

  // 如果都不匹配，尝试提取 ``` 之间的所有内容
  const simpleRegex = /```([\s\S]*?)```/
  const simpleMatch = formattedOutput.match(simpleRegex)

  if (simpleMatch && simpleMatch[1]) {
    return simpleMatch[1].trim()
  }

  return ''
}

/**
 * 测试提取函数
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
      input: '没有格式化的输出',
      expected: ''
    }
  ]

  testCases.forEach((testCase, index) => {
    const result = extractFinalOutput(testCase.input)
    console.log(`测试用例 ${index + 1}:`, result === testCase.expected ? '通过' : '失败')
    console.log('输入:', testCase.input)
    console.log('期望:', testCase.expected)
    console.log('实际:', result)
    console.log('---')
  })
}
