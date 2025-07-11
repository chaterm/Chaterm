import { ChatermDatabaseService } from './db/chaterm.service'
import { autoCompleteDatabaseService } from './db/autocomplete.service'
import { setCurrentUserId } from './db/connection'

// 导出服务类
export { ChatermDatabaseService, autoCompleteDatabaseService, setCurrentUserId }

// 导出连接资产信息的提供给 agent Task 连接使用
export async function connectAssetInfo(uuid: string): Promise<any> {
  const service = await ChatermDatabaseService.getInstance()
  return service.connectAssetInfo(uuid)
}
