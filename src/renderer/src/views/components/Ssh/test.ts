/**
 * 用户片段操作测试文件
 * 测试 userSnippetOperation 方法的所有功能
 */

interface TestResult {
  testName: string
  success: boolean
  message: string
  data?: any
  error?: any
}

export async function quickTest(): Promise<void> {
  console.log('🧪 开始快速测试用户片段操作（仅写入）...')

  try {
    // 创建多个测试片段
    const testSnippets = [
      {
        snippet_name: `系统监控_${Date.now()}`,
        snippet_content: 'top -n 1 | head -20'
      },
      {
        snippet_name: `磁盘使用情况_${Date.now()}`,
        snippet_content: 'df -h'
      },
      {
        snippet_name: `网络连接_${Date.now()}`,
        snippet_content: 'netstat -tuln'
      },
      {
        snippet_name: `进程查看_${Date.now()}`,
        snippet_content: 'ps aux | grep node'
      },
      {
        snippet_name: `内存使用_${Date.now()}`,
        snippet_content: 'free -h'
      }
    ]

    console.log(`📝 准备创建 ${testSnippets.length} 个测试片段...`)

    for (let i = 0; i < testSnippets.length; i++) {
      const snippet = testSnippets[i]
      console.log(`${i + 1}. 创建片段: ${snippet.snippet_name}`)

      const createResult = await window.api.userSnippetOperation({
        operation: 'create',
        params: snippet
      })

      if (createResult.code === 200) {
        console.log(`✅ 成功创建片段 ID: ${createResult.data.insertedId}`)
      } else {
        console.error(`❌ 创建失败:`, createResult.message)
      }
    }

    // 最后查询一次列表确认数据
    console.log('📋 查询当前所有片段...')
    const listResult = await window.api.userSnippetOperation({ operation: 'list' })
    if (listResult.code === 200) {
      console.log(`✅ 当前数据库中共有 ${listResult.data.snippets.length} 个片段`)
      listResult.data.snippets.forEach((snippet: any, index: number) => {
        console.log(`  ${index + 1}. ${snippet.snippet_name} (ID: ${snippet.id})`)
      })

      const firstSnippet = listResult.data.snippets[0]
      const updateResult = await window.api.userSnippetOperation({
        operation: 'update',
        params: {
          id: firstSnippet.id,
          snippet_name: firstSnippet.snippet_name + '_已修改',
          snippet_content: firstSnippet.snippet_content + '\necho "已变更"'
        }
      })
      console.log('变更结果:', updateResult)

      const firstSnippet1 = listResult.data.snippets[2]
      const deleteResult = await window.api.userSnippetOperation({
        operation: 'delete',
        params: { id: firstSnippet1.id }
      })
      console.log('删除结果:', deleteResult)

      const id1 = listResult.data.snippets[0].id
      const id2 = listResult.data.snippets[1].id
      const swapResult = await window.api.userSnippetOperation({
        operation: 'swap',
        params: { id1, id2 }
      })
      console.log('交换结果:', swapResult)
    }

    console.log('✅ 数据写入测试完成!')
  } catch (error) {
    console.error('❌ 数据写入测试失败:', error)
  }
}

/**
 * 使用示例:
 *
 * // 在浏览器控制台中执行完整测试
 * import { UserSnippetTest } from './test'
 * const tester = new UserSnippetTest()
 * tester.runAllTests()
 *
 * // 或者执行快速测试
 * import { quickTest } from './test'
 * quickTest()
 */
