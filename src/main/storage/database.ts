import { ChatermDatabaseService } from './db/chaterm.service'
import { autoCompleteDatabaseService } from './db/autocomplete.service'
import { setCurrentUserId } from './db/connection'

// Export service classes
export { ChatermDatabaseService, autoCompleteDatabaseService, setCurrentUserId }

// Export connection asset information for agent Task connection usage
export async function connectAssetInfo(uuid: string): Promise<any> {
  const service = await ChatermDatabaseService.getInstance()
  return service.connectAssetInfo(uuid)
}
