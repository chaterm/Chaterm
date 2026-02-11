import { getUserInfo } from '@/utils/permission'


const logger = createRendererLogger('service.indexdbMigration')

/**
 * Initialize IndexedDB migration listener
 * Listen to migration data requests from main process, read data directly from IndexedDB and respond
 */
export function setupIndexDBMigrationListener(): void {
  // ===== IndexedDB Migration IPC Listener =====
  // Register migration data request listener (directly operate IndexedDB, not dependent on simplified services)
  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.on('indexdb-migration:request-data', async (_event, dataSource) => {
      logger.info('Received migration request', { dataSource })

      try {
        let data

        if (dataSource === 'aliases') {
          // Read alias data directly from IndexedDB (no version specified, use current version)
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('chatermDB') // No version specified
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
          })

          const transaction = db.transaction(['aliases'], 'readonly')
          const store = transaction.objectStore('aliases')
          const getAllRequest = store.getAll()

          data = await new Promise<any[]>((resolve, reject) => {
            getAllRequest.onsuccess = () => resolve(getAllRequest.result || [])
            getAllRequest.onerror = () => reject(getAllRequest.error)
          })

          db.close()
          logger.info('Read aliases from IndexedDB', { count: data.length })
        } else if (dataSource === 'userConfig') {
          // Read user config directly from IndexedDB (no version specified, use current version)
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('chatermDB') // No version specified
            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
          })

          const transaction = db.transaction(['userConfig'], 'readonly')
          const store = transaction.objectStore('userConfig')
          const getRequest = store.get('userConfig')

          data = await new Promise<any>((resolve, reject) => {
            getRequest.onsuccess = () => resolve(getRequest.result || null)
            getRequest.onerror = () => reject(getRequest.error)
          })

          db.close()
          logger.info('Read userConfig from IndexedDB')
        } else if (dataSource === 'keyValueStore') {
          // Read KeyValueStore directly from IndexedDB (intelligent database lookup)
          logger.info('Starting intelligent KeyValueStore database lookup...')

          // Step 1: List all IndexedDB databases
          let allDatabases: IDBDatabaseInfo[] = []
          try {
            allDatabases = await indexedDB.databases()
            logger.info('Found databases', {
              count: allDatabases.length,
              names: allDatabases.map((db) => db.name)
            })
          } catch (error) {
            logger.error('Unable to list databases, will use fallback', { error: error instanceof Error ? error.message : String(error) })
          }

          // Step 2: Find database containing KeyValueStore
          let foundDb: IDBDatabase | null = null
          let foundDbName = ''

          // Prioritize matching ChatermStorage_user_* pattern databases (exclude unknown)
          const chatermDbs = allDatabases
            .filter((db) => db.name && db.name.startsWith('ChatermStorage_user_'))
            .filter((db) => !db.name!.includes('_unknown')) // Filter out unknown databases created during previous failures

          logger.info('Found valid ChatermStorage databases (unknown excluded)', { count: chatermDbs.length })

          // Get current user ID (using getUserInfo)
          let currentUserId: number | undefined
          try {
            const userInfo = getUserInfo()
            currentUserId = userInfo?.uid
            logger.info('Current logged-in user ID', { userId: currentUserId || 'Unable to get' })
          } catch (error) {
            logger.warn('Unable to get current user ID', { error: error instanceof Error ? error.message : String(error) })
          }

          // Sorting strategy: prioritize current user, then by numeric ID descending
          const sortedDbs = chatermDbs.sort((a, b) => {
            const idA = parseInt(a.name!.split('_').pop() || '0')
            const idB = parseInt(b.name!.split('_').pop() || '0')

            // If a is current user, prioritize
            if (currentUserId && idA === currentUserId) return -1
            // If b is current user, prioritize
            if (currentUserId && idB === currentUserId) return 1

            // Otherwise sort by numeric ID descending
            return idB - idA
          })

          if (sortedDbs.length > 0) {
            logger.info('Database priority order:')
            sortedDbs.forEach((db) => {
              const userId = db.name!.split('_').pop()
              const isCurrent = currentUserId && parseInt(userId || '0') === currentUserId
              logger.info(`  ${isCurrent ? '[Current User]' : '  '} ${db.name}`, { userId })
            })
          }

          // Try to open each candidate database
          for (const dbInfo of chatermDbs) {
            try {
              const dbName = dbInfo.name!
              logger.info('Attempting to open database', { dbName })

              const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(dbName)
                request.onerror = () => reject(request.error)
                request.onsuccess = () => resolve(request.result)
              })

              logger.info('Database opened successfully', { dbName })
              logger.info('Object stores', { stores: Array.from(db.objectStoreNames) })

              // Check if KeyValueStore is included
              if (db.objectStoreNames.contains('KeyValueStore')) {
                // Check if there is data
                const tx = db.transaction('KeyValueStore', 'readonly')
                const store = tx.objectStore('KeyValueStore')
                const count = await new Promise<number>((resolve, reject) => {
                  const req = store.count()
                  req.onsuccess = () => resolve(req.result)
                  req.onerror = () => reject(req.error)
                })

                logger.info('Found KeyValueStore', { dbName, count })

                if (count > 0) {
                  foundDb = db
                  foundDbName = dbName
                  break
                } else {
                  logger.info('KeyValueStore is empty, continuing search...', { dbName })
                  db.close()
                }
              } else {
                logger.info('Database does not contain KeyValueStore', { dbName })
                db.close()
              }
            } catch (error) {
              logger.error('Failed to open database', { error: error instanceof Error ? error.message : String(error) })
            }
          }

          // Step 3: Read data
          if (foundDb) {
            try {
              const transaction = foundDb.transaction(['KeyValueStore'], 'readonly')
              const store = transaction.objectStore('KeyValueStore')
              const getAllRequest = store.getAll()

              const kvPairs = await new Promise<any[]>((resolve, reject) => {
                getAllRequest.onsuccess = () => resolve(getAllRequest.result || [])
                getAllRequest.onerror = () => reject(getAllRequest.error)
              })

              // Convert to { key, value } format
              data = kvPairs.map((item) => ({
                key: item.key || item.id,
                value: item.value
              }))

              foundDb.close()
              logger.info('Successfully read KeyValueStore records', { count: data.length, dbName: foundDbName })
            } catch (error) {
              logger.error('Failed to read KeyValueStore data', { error: error instanceof Error ? error.message : String(error) })
              if (foundDb) foundDb.close()
              throw error
            }
          } else {
            logger.warn('No database with valid KeyValueStore data found, returning empty array')
            data = []
          }
        } else {
          throw new Error(`Unknown data source: ${dataSource}`)
        }

        // Send response
        logger.info('Sending response', { dataSource })
        window.electron?.ipcRenderer.send(`indexdb-migration:data-response:${dataSource}`, data)
        logger.info('Response sent', { dataSource })
      } catch (error: any) {
        logger.error(`Error reading ${dataSource} from IndexedDB`, { error: error.message || 'Unknown error' })
        logger.error('Error stack', { stack: error.stack })
        // Send error response
        window.electron?.ipcRenderer.send(`indexdb-migration:data-response:${dataSource}`, {
          error: error.message || 'Unknown error'
        })
      }
    })
    logger.info('IndexedDB migration listener registered')
  }
  // ===== Migration Listener End =====
}
