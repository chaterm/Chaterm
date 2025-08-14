/**
 * 全量同步定时器演示脚本
 * 展示如何使用FullSyncTimerManager来管理定期全量同步
 */

import { FullSyncTimerManager } from '../services/FullSyncTimerManager'
import { logger } from '../utils/logger'

// 模拟全量同步函数
async function mockFullSync(): Promise<void> {
  logger.info('开始执行模拟全量同步...')

  // 模拟同步过程（耗时1-3秒）
  const duration = Math.random() * 2000 + 1000
  await new Promise((resolve) => setTimeout(resolve, duration))

  // 模拟偶尔的同步失败（10%概率）
  if (Math.random() < 0.1) {
    throw new Error('模拟同步失败')
  }

  logger.info(`模拟全量同步完成，耗时: ${Math.round(duration)}ms`)
}

async function demonstrateFullSyncTimer() {
  logger.info('=== 全量同步定时器演示开始 ===')

  // 创建全量同步定时器管理器
  const fullSyncTimer = new FullSyncTimerManager(
    {
      intervalHours: 0.002, // 7.2秒间隔（用于演示）
      enableOnStart: false // 手动启动
    },
    mockFullSync // 全量同步回调
  )

  try {
    // 1. 显示初始状态
    logger.info('1. 初始状态:')
    console.log(JSON.stringify(fullSyncTimer.getStatus(), null, 2))

    // 2. 立即执行一次全量同步
    logger.info('2. 手动执行全量同步:')
    const manualResult = await fullSyncTimer.syncNow()
    logger.info(`手动同步结果: ${manualResult ? '成功' : '失败'}`)
    console.log(JSON.stringify(fullSyncTimer.getStatus(), null, 2))

    // 3. 启动定时器
    logger.info('3. 启动定时器:')
    await fullSyncTimer.start()
    console.log(JSON.stringify(fullSyncTimer.getStatus(), null, 2))

    // 4. 等待几次定时执行
    logger.info('4. 等待定时器执行（30秒）...')
    for (let i = 0; i < 6; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      const status = fullSyncTimer.getStatus()
      logger.info(`定时器状态 - 总执行次数: ${status.totalFullSyncs}, 成功次数: ${status.successfulFullSyncs}`)

      if (status.lastFullSyncTime) {
        logger.info(`上次同步时间: ${status.lastFullSyncTime.toLocaleString()}`)
      }
      if (status.nextFullSyncTime) {
        logger.info(`下次同步时间: ${status.nextFullSyncTime.toLocaleString()}`)
      }
    }

    // 5. 更新定时器间隔
    logger.info('5. 更新定时器间隔为0.001小时（3.6秒）:')
    fullSyncTimer.updateInterval(0.001)
    console.log(JSON.stringify(fullSyncTimer.getStatus(), null, 2))

    // 6. 再等待一段时间观察新间隔
    logger.info('6. 观察新间隔效果（15秒）...')
    await new Promise((resolve) => setTimeout(resolve, 15000))
    console.log(JSON.stringify(fullSyncTimer.getStatus(), null, 2))

    // 7. 测试并发执行保护
    logger.info('7. 测试并发执行保护:')
    const [result1, result2, result3] = await Promise.all([fullSyncTimer.syncNow(), fullSyncTimer.syncNow(), fullSyncTimer.syncNow()])
    logger.info(`并发执行结果: ${result1}, ${result2}, ${result3}`)
    logger.info('应该只有一个返回true，其他返回false')

    // 8. 停止定时器
    logger.info('8. 停止定时器:')
    await fullSyncTimer.stop()
    console.log(JSON.stringify(fullSyncTimer.getStatus(), null, 2))

    // 9. 显示最终统计
    logger.info('9. 最终统计:')
    const finalStatus = fullSyncTimer.getStatus()
    logger.info(`总执行次数: ${finalStatus.totalFullSyncs}`)
    logger.info(`成功次数: ${finalStatus.successfulFullSyncs}`)
    logger.info(`成功率: ${finalStatus.totalFullSyncs > 0 ? Math.round((finalStatus.successfulFullSyncs / finalStatus.totalFullSyncs) * 100) : 0}%`)

    // 10. 清理资源
    logger.info('10. 清理资源:')
    await fullSyncTimer.destroy()
    logger.info('资源清理完成')
  } catch (error) {
    logger.error('演示过程中发生错误:', error)
  }

  logger.info('=== 全量同步定时器演示结束 ===')
}

// 如果直接运行此文件，则执行演示
if (require.main === module) {
  demonstrateFullSyncTimer().catch(console.error)
}

export { demonstrateFullSyncTimer, mockFullSync }
