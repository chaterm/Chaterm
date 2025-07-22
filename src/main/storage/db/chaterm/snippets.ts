import Database from 'better-sqlite3'

// Shortcut command related methods
export function userSnippetOperationLogic(db: Database.Database, operation: 'list' | 'create' | 'delete' | 'update' | 'swap', params?: any): any {
  try {
    switch (operation) {
      case 'list':
        // Query all data in the table, ordered by sort_order
        const listStmt = db.prepare(`
            SELECT id, snippet_name, snippet_content, created_at, updated_at, sort_order
            FROM user_snippet_v1
            ORDER BY sort_order ASC, id ASC
          `)
        const results = listStmt.all() || []
        return {
          code: 200,
          data: {
            snippets: results
          },
          message: 'success'
        }

      case 'create':
        // Create new record
        if (!params || !params.snippet_name || !params.snippet_content) {
          return {
            code: 400,
            message: 'snippet_name and snippet_content are required for create operation'
          }
        }

        const createResult = db.transaction(() => {
          // Get current maximum sort value
          const maxSortResult = db.prepare('SELECT MAX(sort_order) as max_sort FROM user_snippet_v1').get() as { max_sort: number | null }
          const nextSortOrder = (maxSortResult.max_sort || 0) + 10

          // Insert new record
          const createStmt = db.prepare(`
              INSERT INTO user_snippet_v1 (snippet_name, snippet_content, sort_order)
              VALUES (?, ?, ?)
            `)
          return createStmt.run(params.snippet_name, params.snippet_content, nextSortOrder)
        })()

        return {
          code: 200,
          data: {
            message: createResult.changes > 0 ? 'success' : 'failed',
            insertedId: createResult.lastInsertRowid,
            insertedCount: createResult.changes
          }
        }

      case 'delete':
        // Delete record
        if (!params || !params.id) {
          return {
            code: 400,
            message: 'ID is required for delete operation'
          }
        }
        const deleteStmt = db.prepare(`
            DELETE FROM user_snippet_v1 WHERE id = ?
          `)
        const deleteResult = deleteStmt.run(params.id)
        return {
          code: 200,
          data: {
            message: deleteResult.changes > 0 ? 'success' : 'failed',
            deletedCount: deleteResult.changes
          }
        }

      case 'update':
        // Modify record
        if (!params || !params.id || !params.snippet_name || !params.snippet_content) {
          return {
            code: 400,
            message: 'ID, snippet_name and snippet_content are required for update operation'
          }
        }
        const updateStmt = db.prepare(`
            UPDATE user_snippet_v1 
            SET snippet_name = ?, 
                snippet_content = ?, 
                updated_at = strftime('%s', 'now')
            WHERE id = ?
          `)
        const updateResult = updateStmt.run(params.snippet_name, params.snippet_content, params.id)
        return {
          code: 200,
          data: {
            message: updateResult.changes > 0 ? 'success' : 'failed',
            updatedCount: updateResult.changes
          }
        }

      case 'swap':
        // Move record at id1 to id2, records after id2 move back
        if (!params || !params.id1 || !params.id2) {
          return {
            code: 400,
            message: 'Both id1 and id2 are required for swap operation'
          }
        }

        // Use transaction to ensure data consistency
        const swapResult = db.transaction(() => {
          // Get sort values of source and target records
          const getRecordStmt = db.prepare('SELECT id, sort_order FROM user_snippet_v1 WHERE id = ?')
          const sourceRecord = getRecordStmt.get(params.id1)
          const targetRecord = getRecordStmt.get(params.id2)

          if (!sourceRecord) {
            throw new Error(`Record with id ${params.id1} not found`)
          }
          if (!targetRecord) {
            throw new Error(`Record with id ${params.id2} not found`)
          }

          // If source and target records are the same, no movement needed
          if (params.id1 === params.id2) {
            return { changes: 0 }
          }

          const sourceSortOrder = sourceRecord.sort_order
          const targetSortOrder = targetRecord.sort_order

          // Update sort value
          const updateStmt = db.prepare("UPDATE user_snippet_v1 SET sort_order = ?, updated_at = strftime('%s', 'now') WHERE id = ?")

          if (sourceSortOrder < targetSortOrder) {
            // Move backward: source record moves to target position, intermediate records move forward
            db.prepare(
              `
                UPDATE user_snippet_v1 
                SET sort_order = sort_order - 1, updated_at = strftime('%s', 'now')
                WHERE sort_order > ? AND sort_order <= ?
              `
            ).run(sourceSortOrder, targetSortOrder)

            updateStmt.run(targetSortOrder, params.id1)
          } else {
            // Move forward: source record moves to target position, intermediate records move backward
            db.prepare(
              `
                UPDATE user_snippet_v1 
                SET sort_order = sort_order + 1, updated_at = strftime('%s', 'now')
                WHERE sort_order >= ? AND sort_order < ?
              `
            ).run(targetSortOrder, sourceSortOrder)

            updateStmt.run(targetSortOrder, params.id1)
          }

          return { changes: 1 }
        })()

        return {
          code: 200,
          data: {
            message: swapResult.changes > 0 ? 'success' : 'failed',
            affectedCount: swapResult.changes
          }
        }

      default:
        return {
          code: 400,
          message: 'Invalid operation. Supported operations: list, create, delete, update, swap'
        }
    }
  } catch (error) {
    console.error('Chaterm database user snippet operation error:', error)
    return {
      code: 500,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}
