/**
 * Minimal in-memory mock of better-sqlite3 Database for knowledgebase search tests.
 * Stores rows in plain arrays and matches SQL patterns via string checks.
 */

type Row = Record<string, unknown>

interface MockStatement {
  run(...args: unknown[]): { changes: number }
  get(...args: unknown[]): Row | undefined
  all(...args: unknown[]): Row[]
}

export interface MockDb {
  exec(sql: string): void
  prepare(sql: string): MockStatement
  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T
  pragma(stmt: string): unknown
  close(): void
  _tables: { files: Row[]; chunks: Row[]; chunks_fts: Row[]; parent_chunks: Row[] }
}

export function createMockDatabase(): MockDb {
  const tables = {
    files: [] as Row[],
    chunks: [] as Row[],
    chunks_fts: [] as Row[],
    parent_chunks: [] as Row[]
  }

  function matchSql(sql: string, pattern: string): boolean {
    return sql.includes(pattern)
  }

  function createStatement(sql: string): MockStatement {
    return {
      run(...args: unknown[]) {
        // DELETE FROM <table> WHERE path = ?
        if (matchSql(sql, 'DELETE FROM chunks_fts WHERE')) {
          tables.chunks_fts = tables.chunks_fts.filter((r) => r.path !== args[0])
        } else if (matchSql(sql, 'DELETE FROM chunks WHERE')) {
          tables.chunks = tables.chunks.filter((r) => r.path !== args[0])
        } else if (matchSql(sql, 'DELETE FROM parent_chunks WHERE')) {
          tables.parent_chunks = tables.parent_chunks.filter((r) => r.path !== args[0])
        } else if (matchSql(sql, 'DELETE FROM files WHERE')) {
          tables.files = tables.files.filter((r) => r.path !== args[0])
        }
        // INSERT INTO parent_chunks (...) VALUES (?, ...)
        else if (matchSql(sql, 'INSERT INTO parent_chunks (')) {
          tables.parent_chunks.push({
            id: args[0],
            path: args[1],
            parent_index: args[2],
            start_line: args[3],
            end_line: args[4],
            start_offset: args[5],
            end_offset: args[6],
            text: args[7],
            updated_at: args[8]
          })
        }
        // INSERT INTO chunks (...) VALUES (?, ...)
        else if (matchSql(sql, 'INSERT INTO chunks (')) {
          tables.chunks.push({
            id: args[0],
            path: args[1],
            chunk_index: args[2],
            parent_id: args[3],
            start_line: args[4],
            end_line: args[5],
            start_offset: args[6],
            end_offset: args[7],
            context_header: args[8],
            hash: args[9],
            model: args[10],
            text: args[11],
            embedding: args[12],
            updated_at: args[13]
          })
        }
        // INSERT INTO chunks_fts (...) VALUES (?, ?, ?, ?, ?)
        else if (matchSql(sql, 'INSERT INTO chunks_fts')) {
          tables.chunks_fts.push({
            text: args[0],
            id: args[1],
            path: args[2],
            start_line: args[3],
            end_line: args[4]
          })
        }
        // INSERT OR REPLACE INTO files (...) VALUES (?, ?, ?, ?, ?)
        else if (matchSql(sql, 'INSERT OR REPLACE INTO files')) {
          tables.files = tables.files.filter((r) => r.path !== args[0])
          tables.files.push({ path: args[0], hash: args[1], index_signature: args[2], mtime_ms: args[3], size: args[4] })
        }
        return { changes: 1 }
      },

      get(...args: unknown[]) {
        if (matchSql(sql, 'SELECT hash, index_signature FROM files WHERE')) {
          return tables.files.find((r) => r.path === args[0]) as Row | undefined
        }
        if (matchSql(sql, 'SELECT embedding FROM chunks WHERE model')) {
          return tables.chunks.find((r) => r.model === args[0] && r.hash === args[1]) as Row | undefined
        }
        if (matchSql(sql, 'SELECT * FROM files WHERE')) {
          return tables.files.find((r) => r.path === args[0]) as Row | undefined
        }
        if (matchSql(sql, 'count(*) as cnt FROM chunks_fts WHERE')) {
          return { cnt: tables.chunks_fts.filter((r) => r.path === args[0]).length }
        }
        if (matchSql(sql, 'count(*) as cnt FROM chunks WHERE')) {
          return { cnt: tables.chunks.filter((r) => r.path === args[0]).length }
        }
        if (matchSql(sql, 'count(*) as cnt FROM files WHERE')) {
          return { cnt: tables.files.filter((r) => r.path === args[0]).length }
        }
        if (matchSql(sql, 'count(*) as cnt FROM files')) {
          return { cnt: tables.files.length }
        }
        if (matchSql(sql, 'count(*) as cnt FROM chunks') && !matchSql(sql, 'chunks_fts')) {
          return { cnt: tables.chunks.length }
        }
        return undefined
      },

      all(...args: unknown[]) {
        if (matchSql(sql, 'SELECT * FROM chunks WHERE')) {
          return tables.chunks.filter((r) => r.path === args[0])
        }
        if (matchSql(sql, 'FROM parent_chunks WHERE id IN')) {
          return tables.parent_chunks.filter((row) => args.includes(row.id))
        }
        if (matchSql(sql, 'SELECT path FROM files')) {
          return tables.files.map((r) => ({ path: r.path }))
        }
        // Vector search: SELECT ... FROM chunks WHERE model = ?
        if (matchSql(sql, 'FROM chunks WHERE model')) {
          return tables.chunks.filter((r) => r.model === args[0])
        }
        // FTS5 MATCH: simple substring match on text for testing
        if (matchSql(sql, 'chunks_fts') && matchSql(sql, 'MATCH')) {
          const query = String(args[0])
          // Extract keywords from FTS query like '"word1" OR "word2"'
          const keywords = query
            .split(/\s+OR\s+/i)
            .map((t) => t.replace(/"/g, '').toLowerCase())
            .filter(Boolean)
          const limit = typeof args[1] === 'number' ? args[1] : 100
          return tables.chunks_fts
            .filter((r) => {
              const text = String(r.text).toLowerCase()
              return keywords.some((kw) => text.includes(kw))
            })
            .slice(0, limit)
            .map((r) => {
              const chunk = tables.chunks.find((candidate) => candidate.id === r.id)
              return {
                id: chunk?.id,
                path: chunk?.path,
                chunk_index: chunk?.chunk_index,
                parent_id: chunk?.parent_id,
                start_line: chunk?.start_line,
                end_line: chunk?.end_line,
                start_offset: chunk?.start_offset,
                end_offset: chunk?.end_offset,
                context_header: chunk?.context_header,
                text: chunk?.text,
                rank: -1 // fake BM25 rank (negative = more relevant)
              }
            })
        }
        return []
      }
    }
  }

  return {
    exec(sql: string) {
      void sql
    },
    prepare: createStatement,
    transaction<T>(fn: (...args: unknown[]) => T) {
      return fn
    },
    pragma(stmt: string) {
      if (stmt === 'table_info(files)') return [{ name: 'index_signature' }]
      if (stmt === 'table_info(chunks)') {
        return [{ name: 'chunk_index' }, { name: 'parent_id' }, { name: 'start_offset' }, { name: 'end_offset' }, { name: 'context_header' }]
      }
      return []
    },
    close() {
      // no-op: mock database has no external resources to release
    },
    _tables: tables
  }
}
