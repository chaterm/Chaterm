// 测试修复后的 processString 函数
const processString = (str) => {
  const result = []
  let i = 0

  while (i < str.length) {
    // 1. 处理引号整体
    if (str[i] === '"' || str[i] === "'") {
      const quote = str[i]
      let j = i + 1

      // 查找匹配的闭引号
      while (j < str.length && str[j] !== quote) {
        // 跳过转义引号
        if (str[j] === '\\' && str[j + 1] === quote) {
          j += 2
        } else {
          j++
        }
      }

      if (j < str.length) {
        // 找到匹配的闭引号
        result.push({
          type: 'matched',
          startIndex: i,
          endIndex: j,
          content: str.slice(i, j + 1)
        })
        i = j + 1
      } else {
        // 未找到匹配的闭引号，将开引号作为未匹配处理
        result.push({
          type: 'unmatched',
          content: str[i],
          startIndex: i
        })
        i++
      }
      continue
    }

    // 2. 处理 {{...}} 嵌套
    if (str[i] === '{' && str[i + 1] === '{') {
      let depth = 1
      let j = i + 2

      // 查找匹配的闭合括号
      while (j < str.length) {
        if (str[j] === '{' && str[j + 1] === '{') {
          depth++
          j++
        } else if (str[j] === '}' && str[j + 1] === '}') {
          depth--
          if (depth === 0) break
          j++
        }
        j++
      }

      if (depth === 0 && j < str.length) {
        // 找到匹配的闭合括号
        result.push({
          type: 'matched',
          startIndex: i,
          endIndex: j + 1,
          content: str.slice(i, j + 2)
        })
        i = j + 2
      } else {
        // 未找到匹配的闭合括号，将开括号作为未匹配处理
        result.push({
          type: 'unmatched',
          content: str[i],
          startIndex: i
        })
        i++
      }
      continue
    }

    // 3. 处理单字符闭合符号 {} [] ()
    if (str[i] === '{' || str[i] === '[' || str[i] === '(') {
      const openChar = str[i]
      const closeChar = openChar === '{' ? '}' : openChar === '[' ? ']' : ')'
      let depth = 1
      let j = i + 1

      // 查找匹配的闭合符号
      while (j < str.length) {
        if (str[j] === openChar) {
          depth++
        } else if (str[j] === closeChar) {
          depth--
          if (depth === 0) break
        }
        j++
      }

      if (depth === 0 && j < str.length) {
        // 找到匹配的闭合符号
        result.push({
          type: 'matched',
          startIndex: i,
          endIndex: j,
          content: str.slice(i, j + 1)
        })
        i = j + 1
      } else {
        // 未找到匹配的闭合符号，将开符号作为未匹配处理
        result.push({
          type: 'unmatched',
          content: str[i],
          startIndex: i
        })
        i++
      }
      continue
    }

    // 4. 普通字符处理
    let start = i
    while (
      i < str.length &&
      str[i] !== '"' &&
      str[i] !== "'" &&
      !(str[i] === '{' && str[i + 1] === '{') &&
      str[i] !== '{' &&
      str[i] !== '[' &&
      str[i] !== '('
    ) {
      i++
    }

    if (start < i) {
      result.push({
        type: 'afterMatched',
        content: str.slice(start, i),
        startIndex: start
      })
    }

    // 防止无限循环的安全检查
    if (i === start) {
      result.push({
        type: 'afterMatched',
        content: str[i],
        startIndex: i
      })
      i++
    }
  }

  return result
}

// 测试用例
const testCases = [
  // 原有测试用例
  '{{path/to/file}}',
  'KUBECONFIG="{{$HOME.kube/config:path/to/custom/kubeconfig.yaml}}" kubectl config get-contexts',
  '"', // 单个开引号
  "'", // 单个开引号
  '{{', // 单个开括号
  '{{{{', // 多个开括号
  '{{path', // 不完整的嵌套
  '"hello', // 不完整的引号
  '{{path/to', // 不完整的嵌套路径
  '', // 空字符串
  'a', // 单个字符
  '{{}}', // 空的双大括号
  '""', // 空的双引号
  "''", // 空的单引号
  '{{{{}}}}', // 嵌套双大括号
  '{{{{{{}}}}}}', // 多层嵌套双大括号
  '{{path/to/file}} "quoted string" {{nested}}', // 复杂情况
  '{{path/to/file}} "unclosed quote', // 不完整的引号
  '{{unclosed {{nested}}', // 不完整的嵌套

  // 新增测试用例 - 单字符闭合符号
  'ls -la {file1,file2}', // 大括号
  'find . -name "*.txt" -exec grep "pattern" {} \\;', // 大括号和引号
  'echo [1,2,3,4]', // 方括号
  'array=([0]="first" [1]="second")', // 方括号嵌套
  'function test() { echo "hello"; }', // 圆括号和大括号
  'if (condition) { action; }', // 圆括号和大括号组合
  'echo "test" {nested} [array] (function)', // 混合符号
  'echo "quoted" {braced} [bracketed] (parenthesized)', // 所有符号类型

  // 嵌套测试
  'echo {outer {inner} outer}', // 嵌套大括号
  'array=([0]="first" [1]="second" [2]="third")', // 嵌套方括号
  'function test() { if (condition) { action; } }', // 复杂嵌套

  // 边界情况
  '{', // 单个开大括号
  '[', // 单个开方括号
  '(', // 单个开圆括号
  '}', // 单个闭大括号
  ']', // 单个闭方括号
  ')', // 单个闭圆括号
  '{}', // 空大括号
  '[]', // 空方括号
  '()', // 空圆括号

  // 不完整的情况
  '{unclosed', // 不完整的大括号
  '[unclosed', // 不完整的方括号
  '(unclosed', // 不完整的圆括号
  'echo "test" {unclosed', // 混合不完整
  'echo "test" [unclosed', // 混合不完整
  'echo "test" (unclosed', // 混合不完整

  // 复杂命令示例
  'find . -type f -name "*.txt" -exec grep -l "pattern" {} \\;',
  'ls -la | grep -E "(file1|file2)" | awk \'{print $1}\'',
  'echo "Current directory: $(pwd)" && ls -la [a-z]*.txt',
  'for file in {1..10}; do echo "Processing file $file"; done'
]

console.log('开始测试优化后的 processString 函数...\n')

testCases.forEach((testCase, index) => {
  console.log(`测试 ${index + 1}: "${testCase}"`)

  try {
    const startTime = Date.now()
    const result = processString(testCase)
    const endTime = Date.now()
    const duration = endTime - startTime

    console.log(`✅ 执行成功 (${duration}ms)`)
    console.log(`   结果: ${result.map((item) => `[${item.type}: "${item.content}"]`).join(' ')}`)

    // 验证重构
    const reconstructed = result.map((item) => item.content).join('')
    console.log(`   重构: "${reconstructed}"`)
    console.log(`   匹配: ${reconstructed === testCase ? '✅' : '❌'}`)

    // 显示匹配的闭合符号
    const matchedItems = result.filter((item) => item.type === 'matched')
    if (matchedItems.length > 0) {
      console.log(`   匹配项: ${matchedItems.map((item) => `"${item.content}"`).join(', ')}`)
    }
  } catch (error) {
    console.log(`❌ 执行失败: ${error.message}`)
  }

  console.log('')
})

console.log('测试完成！')
