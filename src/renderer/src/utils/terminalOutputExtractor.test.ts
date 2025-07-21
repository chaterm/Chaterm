import { extractFinalOutput } from './terminalOutputExtractor'

// 测试用例
const testCases = [
  {
    name: '标准格式测试',
    input: `Terminal output:\n\`\`\`\nls -la\n-rw-r--r--  1 user  staff  1234 Jan 1 12:00 file.txt\n\`\`\``,
    expected: 'ls -la\n-rw-r--r--  1 user  staff  1234 Jan 1 12:00 file.txt'
  },
  {
    name: '简单格式测试',
    input: `\`\`\`\npwd\n/home/user\n\`\`\``,
    expected: 'pwd\n/home/user'
  },
  {
    name: '多行输出测试',
    input: `Terminal output:\n\`\`\`\nCommand 1\nOutput 1\nCommand 2\nOutput 2\n\`\`\``,
    expected: 'Command 1\nOutput 1\nCommand 2\nOutput 2'
  },
  {
    name: '空输出测试',
    input: `Terminal output:\n\`\`\`\n\n\`\`\``,
    expected: ''
  },
  {
    name: '无格式输出测试',
    input: '没有格式化的输出',
    expected: ''
  },
  {
    name: '空字符串测试',
    input: '',
    expected: ''
  }
]

// 运行测试
export const runTests = () => {
  console.log('开始测试 extractFinalOutput 函数...')

  let passedTests = 0
  let totalTests = testCases.length

  testCases.forEach((testCase, index) => {
    const result = extractFinalOutput(testCase.input)
    const isPassed = result === testCase.expected

    console.log(`\n测试 ${index + 1}: ${testCase.name}`)
    console.log(`结果: ${isPassed ? '✅ 通过' : '❌ 失败'}`)

    if (!isPassed) {
      console.log(`输入: ${JSON.stringify(testCase.input)}`)
      console.log(`期望: ${JSON.stringify(testCase.expected)}`)
      console.log(`实际: ${JSON.stringify(result)}`)
    }

    if (isPassed) {
      passedTests++
    }
  })

  console.log(`\n测试完成: ${passedTests}/${totalTests} 通过`)

  return passedTests === totalTests
}

// 如果直接运行此文件，执行测试
if (typeof window !== 'undefined') {
  // 在浏览器环境中，可以通过控制台调用
  ;(window as any).runTerminalOutputTests = runTests
}
