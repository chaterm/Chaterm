import { getUserInfo } from '@/utils/permission'

/**
 * 初始化 IndexedDB 迁移监听器
 * 监听主进程的迁移数据请求，直接从 IndexedDB 读取数据并响应
 */
export function setupIndexDBMigrationListener(): void {
  // ===== IndexedDB 迁移 IPC 监听器 =====
  // 注册迁移数据请求监听器（直接操作 IndexedDB，不依赖简化后的服务）
  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.on('indexdb-migration:request-data', async (_event, dataSource) => {
      console.log(`[Renderer] Received migration request for: ${dataSource}`)

      try {
        let data

        if (dataSource === 'aliases') {
          // 直接从 IndexedDB 读取别名数据（不指定版本号，使用当前版本）
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('chatermDB') // 不指定版本号
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
          // 直接从 IndexedDB 读取用户配置（不指定版本号，使用当前版本）
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('chatermDB') // 不指定版本号
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
          // 直接从 IndexedDB 读取 KeyValueStore（智能查找数据库）
          console.log('[Renderer] 开始智能查找 KeyValueStore 数据库...')

          // 第一步：列出所有 IndexedDB 数据库
          let allDatabases: IDBDatabaseInfo[] = []
          try {
            allDatabases = await indexedDB.databases()
            console.log(
              `[Renderer] 找到 ${allDatabases.length} 个数据库:`,
              allDatabases.map((db) => db.name)
            )
          } catch (error) {
            console.error('[Renderer] 无法列出数据库，将使用备用方案:', error)
          }

          // 第二步：查找包含 KeyValueStore 的数据库
          let foundDb: IDBDatabase | null = null
          let foundDbName = ''

          // 优先尝试匹配 ChatermStorage_user_* 模式的数据库（排除 unknown）
          const chatermDbs = allDatabases
            .filter((db) => db.name && db.name.startsWith('ChatermStorage_user_'))
            .filter((db) => !db.name!.includes('_unknown')) // 过滤掉之前失败时创建的 unknown 数据库

          console.log(`[Renderer] 找到 ${chatermDbs.length} 个有效的 ChatermStorage 数据库（已排除 unknown）`)

          // 获取当前用户 ID（使用 getUserInfo）
          let currentUserId: number | undefined
          try {
            const userInfo = getUserInfo()
            currentUserId = userInfo?.uid
            console.log(`[Renderer] 当前登录用户 ID: ${currentUserId || '无法获取'}`)
          } catch (error) {
            console.warn('[Renderer] 无法获取当前用户 ID:', error)
          }

          // 排序策略：优先当前用户，其次按数字 ID 降序
          const sortedDbs = chatermDbs.sort((a, b) => {
            const idA = parseInt(a.name!.split('_').pop() || '0')
            const idB = parseInt(b.name!.split('_').pop() || '0')

            // 如果 a 是当前用户，优先
            if (currentUserId && idA === currentUserId) return -1
            // 如果 b 是当前用户，优先
            if (currentUserId && idB === currentUserId) return 1

            // 否则按数字降序
            return idB - idA
          })

          if (sortedDbs.length > 0) {
            console.log('[Renderer] 数据库优先级顺序:')
            sortedDbs.forEach((db) => {
              const userId = db.name!.split('_').pop()
              const isCurrent = currentUserId && parseInt(userId || '0') === currentUserId
              console.log(`[Renderer]   ${isCurrent ? '[当前用户]' : '  '} ${db.name} (用户ID: ${userId})`)
            })
          }

          // 尝试打开每个候选数据库
          for (const dbInfo of chatermDbs) {
            try {
              const dbName = dbInfo.name!
              console.log(`[Renderer] 尝试打开数据库: ${dbName}`)

              const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(dbName)
                request.onerror = () => reject(request.error)
                request.onsuccess = () => resolve(request.result)
              })

              console.log(`[Renderer] 数据库 ${dbName} 打开成功`)
              console.log(`[Renderer] Object stores:`, Array.from(db.objectStoreNames))

              // 检查是否包含 KeyValueStore
              if (db.objectStoreNames.contains('KeyValueStore')) {
                // 检查是否有数据
                const tx = db.transaction('KeyValueStore', 'readonly')
                const store = tx.objectStore('KeyValueStore')
                const count = await new Promise<number>((resolve, reject) => {
                  const req = store.count()
                  req.onsuccess = () => resolve(req.result)
                  req.onerror = () => reject(req.error)
                })

                console.log(`[Renderer] 在 ${dbName} 中找到 KeyValueStore，包含 ${count} 条记录`)

                if (count > 0) {
                  foundDb = db
                  foundDbName = dbName
                  break
                } else {
                  console.log(`[Renderer] Warning: ${dbName} 中的 KeyValueStore 为空，继续查找...`)
                  db.close()
                }
              } else {
                console.log(`[Renderer] ${dbName} 不包含 KeyValueStore`)
                db.close()
              }
            } catch (error) {
              console.error(`[Renderer] 打开数据库失败:`, error)
            }
          }

          // 第三步：读取数据
          if (foundDb) {
            try {
              const transaction = foundDb.transaction(['KeyValueStore'], 'readonly')
              const store = transaction.objectStore('KeyValueStore')
              const getAllRequest = store.getAll()

              const kvPairs = await new Promise<any[]>((resolve, reject) => {
                getAllRequest.onsuccess = () => resolve(getAllRequest.result || [])
                getAllRequest.onerror = () => reject(getAllRequest.error)
              })

              // 转换为 { key, value } 格式
              data = kvPairs.map((item) => ({
                key: item.key || item.id,
                value: item.value
              }))

              foundDb.close()
              console.log(`[Renderer] 成功从 ${foundDbName} 读取 ${data.length} 条 KeyValueStore 记录`)
            } catch (error) {
              console.error(`[Renderer] 读取 KeyValueStore 数据失败:`, error)
              if (foundDb) foundDb.close()
              throw error
            }
          } else {
            console.warn(`[Renderer] Warning: 未找到包含有效 KeyValueStore 数据的数据库，返回空数组`)
            data = []
          }
        } else {
          throw new Error(`Unknown data source: ${dataSource}`)
        }

        // 发送响应
        console.log(`[Renderer] Sending response for ${dataSource}...`)
        window.electron?.ipcRenderer.send(`indexdb-migration:data-response:${dataSource}`, data)
        console.log(`[Renderer] Response sent for ${dataSource}`)
      } catch (error: any) {
        console.error(`[Renderer] Error reading ${dataSource} from IndexedDB:`, error)
        console.error(`[Renderer] Error stack:`, error.stack)
        // 发送错误响应
        window.electron?.ipcRenderer.send(`indexdb-migration:data-response:${dataSource}`, {
          error: error.message || 'Unknown error'
        })
      }
    })
    console.log('[Renderer] IndexedDB migration listener registered')
  }
  // ===== 迁移监听器结束 =====
}
