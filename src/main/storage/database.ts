import { ChatermDatabaseService } from './db/chaterm.service'
import { autoCompleteDatabaseService } from './db/autocomplete.service'
import { setCurrentUserId } from './db/connection'

// 导出服务类
export { ChatermDatabaseService, autoCompleteDatabaseService, setCurrentUserId }

// 导出连接资产信息的便捷函数
export async function connectAssetInfo(uuid: string): Promise<any> {
  const service = await ChatermDatabaseService.getInstance()
  return service.connectAssetInfo(uuid)
}
