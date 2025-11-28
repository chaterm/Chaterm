import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'

// Shortcut command related methods
export function userSnippetOperationLogic(
  db: Database.Database,
  operation: 'list' | 'create' | 'delete' | 'update' | 'swap' | 'listGroups' | 'createGroup' | 'updateGroup' | 'deleteGroup',
  params?: any
): any {
  try {
    switch (operation) {
      case 'list':
        // Query all data in the table, ordered by sort_order
        const listStmt = db.prepare(`
            SELECT id, uuid, snippet_name, snippet_content, group_uuid, created_at, updated_at, sort_order
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
          const uuid = uuidv4()

          // Insert new record
          const createStmt = db.prepare(`
              INSERT INTO user_snippet_v1 (uuid, snippet_name, snippet_content, group_uuid, sort_order)
              VALUES (?, ?, ?, ?, ?)
            `)
          const result = createStmt.run(uuid, params.snippet_name, params.snippet_content, params.group_uuid || null, nextSortOrder)
          return { ...result, uuid }
        })()

        return {
          code: 200,
          data: {
            message: createResult.changes > 0 ? 'success' : 'failed',
            insertedId: createResult.lastInsertRowid,
            insertedCount: createResult.changes,
            uuid: createResult.uuid
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
                group_uuid = ?,
                updated_at = strftime('%s', 'now')
            WHERE id = ?
          `)
        const updateResult = updateStmt.run(params.snippet_name, params.snippet_content, params.group_uuid || null, params.id)
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

      case 'listGroups':
        const listGroupsStmt = db.prepare('SELECT * FROM user_snippet_groups_v1 ORDER BY created_at ASC')
        const groups = listGroupsStmt.all() || []
        return {
          code: 200,
          data: {
            groups
          },
          message: 'success'
        }

      case 'createGroup':
        if (!params || !params.group_name) {
          return {
            code: 400,
            message: 'group_name is required for createGroup operation'
          }
        }
        const uuid = uuidv4()
        const createGroupStmt = db.prepare('INSERT INTO user_snippet_groups_v1 (uuid, group_name) VALUES (?, ?)')
        const createGroupResult = createGroupStmt.run(uuid, params.group_name)
        return {
          code: 200,
          data: {
            message: createGroupResult.changes > 0 ? 'success' : 'failed',
            insertedId: createGroupResult.lastInsertRowid,
            insertedCount: createGroupResult.changes,
            uuid
          }
        }

      case 'updateGroup':
        if (!params || !params.uuid || !params.group_name) {
          return {
            code: 400,
            message: 'uuid and group_name are required for updateGroup operation'
          }
        }
        const updateGroupStmt = db.prepare("UPDATE user_snippet_groups_v1 SET group_name = ?, updated_at = strftime('%s', 'now') WHERE uuid = ?")
        const updateGroupResult = updateGroupStmt.run(params.group_name, params.uuid)
        return {
          code: 200,
          data: {
            message: updateGroupResult.changes > 0 ? 'success' : 'failed',
            updatedCount: updateGroupResult.changes
          }
        }

      case 'deleteGroup':
        if (!params || !params.uuid) {
          return {
            code: 400,
            message: 'uuid is required for deleteGroup operation'
          }
        }
        // Transaction to delete group and set group_uuid to null for snippets in this group
        const deleteGroupResult = db.transaction(() => {
          db.prepare('UPDATE user_snippet_v1 SET group_uuid = NULL WHERE group_uuid = ?').run(params.uuid)
          return db.prepare('DELETE FROM user_snippet_groups_v1 WHERE uuid = ?').run(params.uuid)
        })()
        return {
          code: 200,
          data: {
            message: deleteGroupResult.changes > 0 ? 'success' : 'failed',
            deletedCount: deleteGroupResult.changes
          }
        }

      default:
        return {
          code: 400,
          message: 'Invalid operation. Supported operations: list, create, delete, update, swap, listGroups, createGroup, updateGroup, deleteGroup'
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
