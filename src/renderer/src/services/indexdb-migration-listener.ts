import { getUserInfo } from '@/utils/permission'

/**
 * Initialize IndexedDB migration listener
 * Listen to migration data requests from main process, read data directly from IndexedDB and respond
 */
export function setupIndexDBMigrationListener(): void {
  // ===== IndexedDB Migration IPC Listener =====
  // Register migration data request listener (directly operate IndexedDB, not dependent on simplified services)
  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.on('indexdb-migration:request-data', async (_event, dataSource) => {
      console.log(`[Renderer] Received migration request for: ${dataSource}`)

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
          console.log(`[Renderer] Read ${data.length} aliases from IndexedDB`)
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
          console.log(`[Renderer] Read userConfig from IndexedDB`)
        } else if (dataSource === 'keyValueStore') {
          // Read KeyValueStore directly from IndexedDB (intelligent database lookup)
          console.log('[Renderer] Starting intelligent KeyValueStore database lookup...')

          // Step 1: List all IndexedDB databases
          let allDatabases: IDBDatabaseInfo[] = []
          try {
            allDatabases = await indexedDB.databases()
            console.log(
              `[Renderer] Found ${allDatabases.length} databases:`,
              allDatabases.map((db) => db.name)
            )
          } catch (error) {
            console.error('[Renderer] Unable to list databases, will use fallback:', error)
          }

          // Step 2: Find database containing KeyValueStore
          let foundDb: IDBDatabase | null = null
          let foundDbName = ''

          // Prioritize matching ChatermStorage_user_* pattern databases (exclude unknown)
          const chatermDbs = allDatabases
            .filter((db) => db.name && db.name.startsWith('ChatermStorage_user_'))
            .filter((db) => !db.name!.includes('_unknown')) // Filter out unknown databases created during previous failures

          console.log(`[Renderer] Found ${chatermDbs.length} valid ChatermStorage databases (unknown excluded)`)

          // Get current user ID (using getUserInfo)
          let currentUserId: number | undefined
          try {
            const userInfo = getUserInfo()
            currentUserId = userInfo?.uid
            console.log(`[Renderer] Current logged-in user ID: ${currentUserId || 'Unable to get'}`)
          } catch (error) {
            console.warn('[Renderer] Unable to get current user ID:', error)
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
            console.log('[Renderer] Database priority order:')
            sortedDbs.forEach((db) => {
              const userId = db.name!.split('_').pop()
              const isCurrent = currentUserId && parseInt(userId || '0') === currentUserId
              console.log(`[Renderer]   ${isCurrent ? '[Current User]' : '  '} ${db.name} (User ID: ${userId})`)
            })
          }

          // Try to open each candidate database
          for (const dbInfo of chatermDbs) {
            try {
              const dbName = dbInfo.name!
              console.log(`[Renderer] Attempting to open database: ${dbName}`)

              const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(dbName)
                request.onerror = () => reject(request.error)
                request.onsuccess = () => resolve(request.result)
              })

              console.log(`[Renderer] Database ${dbName} opened successfully`)
              console.log(`[Renderer] Object stores:`, Array.from(db.objectStoreNames))

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

                console.log(`[Renderer] Found KeyValueStore in ${dbName}, containing ${count} records`)

                if (count > 0) {
                  foundDb = db
                  foundDbName = dbName
                  break
                } else {
                  console.log(`[Renderer] Warning: KeyValueStore in ${dbName} is empty, continuing search...`)
                  db.close()
                }
              } else {
                console.log(`[Renderer] ${dbName} does not contain KeyValueStore`)
                db.close()
              }
            } catch (error) {
              console.error(`[Renderer] Failed to open database:`, error)
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
              console.log(`[Renderer] Successfully read ${data.length} KeyValueStore records from ${foundDbName}`)
            } catch (error) {
              console.error(`[Renderer] Failed to read KeyValueStore data:`, error)
              if (foundDb) foundDb.close()
              throw error
            }
          } else {
            console.warn(`[Renderer] Warning: No database with valid KeyValueStore data found, returning empty array`)
            data = []
          }
        } else {
          throw new Error(`Unknown data source: ${dataSource}`)
        }

        // Send response
        console.log(`[Renderer] Sending response for ${dataSource}...`)
        window.electron?.ipcRenderer.send(`indexdb-migration:data-response:${dataSource}`, data)
        console.log(`[Renderer] Response sent for ${dataSource}`)
      } catch (error: any) {
        console.error(`[Renderer] Error reading ${dataSource} from IndexedDB:`, error)
        console.error(`[Renderer] Error stack:`, error.stack)
        // Send error response
        window.electron?.ipcRenderer.send(`indexdb-migration:data-response:${dataSource}`, {
          error: error.message || 'Unknown error'
        })
      }
    })
    console.log('[Renderer] IndexedDB migration listener registered')
  }
  // ===== Migration Listener End =====
}
