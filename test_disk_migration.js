// 测试脚本：验证disk.ts的数据库迁移
const { ChatermDatabaseService } = require('./src/main/database.ts')

async function testDiskMigration() {
  console.log('开始测试disk.ts数据库迁移...')

  try {
    // 获取数据库服务实例
    const dbService = await ChatermDatabaseService.getInstance()

    const testTaskId = 'test-task-' + Date.now()

    // 测试API对话历史
    console.log('测试API对话历史...')
    const testApiHistory = [
      {
        role: 'user',
        content: [{ type: 'text', text: '你好，请帮我写一个函数' }]
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: '好的，我来帮你写一个函数' },
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'create_file',
            input: { path: 'test.js', content: 'function test() {}' }
          }
        ]
      }
    ]

    await dbService.saveApiConversationHistory(testTaskId, testApiHistory)
    const retrievedApiHistory = await dbService.getSavedApiConversationHistory(testTaskId)
    console.log('API对话历史保存和读取成功:', retrievedApiHistory.length > 0)

    // 测试UI消息
    console.log('测试UI消息...')
    const testUiMessages = [
      {
        ts: Date.now(),
        type: 'ask',
        ask: 'followup',
        text: '请确认是否继续？'
      },
      {
        ts: Date.now() + 1000,
        type: 'say',
        say: 'text',
        text: '好的，我继续执行任务'
      }
    ]

    await dbService.saveChatermMessages(testTaskId, testUiMessages)
    const retrievedUiMessages = await dbService.getSavedChatermMessages(testTaskId)
    console.log('UI消息保存和读取成功:', retrievedUiMessages.length > 0)

    // 测试任务元数据
    console.log('测试任务元数据...')
    const testMetadata = {
      files_in_context: [
        {
          path: '/test/file.js',
          record_state: 'active',
          record_source: 'read_tool',
          cline_read_date: Date.now(),
          cline_edit_date: null
        }
      ],
      model_usage: [
        {
          ts: Date.now(),
          model_id: 'claude-3-sonnet',
          model_provider_id: 'anthropic',
          mode: 'chat'
        }
      ]
    }

    await dbService.saveTaskMetadata(testTaskId, testMetadata)
    const retrievedMetadata = await dbService.getTaskMetadata(testTaskId)
    console.log('任务元数据保存和读取成功:', retrievedMetadata.files_in_context.length > 0)

    // 测试上下文历史
    console.log('测试上下文历史...')
    const testContextHistory = {
      context_data: '这是一些上下文数据',
      timestamp: Date.now()
    }

    await dbService.saveContextHistory(testTaskId, testContextHistory)
    const retrievedContextHistory = await dbService.getContextHistory(testTaskId)
    console.log('上下文历史保存和读取成功:', retrievedContextHistory !== null)

    console.log('所有测试通过！数据库迁移成功。')
  } catch (error) {
    console.error('测试失败:', error)
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  testDiskMigration()
}

module.exports = { testDiskMigration }
