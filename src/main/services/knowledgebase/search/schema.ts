import type Database from 'better-sqlite3'

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      path            TEXT PRIMARY KEY,
      hash            TEXT NOT NULL,
      index_signature TEXT NOT NULL,
      mtime_ms        INTEGER NOT NULL,
      size            INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id             TEXT PRIMARY KEY,
      path           TEXT NOT NULL,
      chunk_index    INTEGER NOT NULL,
      parent_id      TEXT,
      start_line     INTEGER NOT NULL,
      end_line       INTEGER NOT NULL,
      start_offset   INTEGER NOT NULL,
      end_offset     INTEGER NOT NULL,
      context_header TEXT NOT NULL,
      hash           TEXT NOT NULL,
      model          TEXT NOT NULL,
      text           TEXT NOT NULL,
      embedding      TEXT NOT NULL,
      updated_at     INTEGER NOT NULL
    );
  `)

  const fileColumns = db.pragma('table_info(files)') as Array<{ name: string }>
  if (!fileColumns.some((column) => column.name === 'index_signature')) {
    db.exec("ALTER TABLE files ADD COLUMN index_signature TEXT NOT NULL DEFAULT '';")
  }

  const chunkColumns = db.pragma('table_info(chunks)') as Array<{ name: string }>
  if (!chunkColumns.some((column) => column.name === 'chunk_index')) {
    db.transaction(() => {
      db.exec('ALTER TABLE chunks ADD COLUMN chunk_index INTEGER NOT NULL DEFAULT 0;')
      db.exec(`
        WITH ranked AS (
          SELECT
            rowid,
            ROW_NUMBER() OVER (PARTITION BY path ORDER BY rowid) - 1 AS chunk_index
          FROM chunks
        )
        UPDATE chunks
        SET chunk_index = (
          SELECT ranked.chunk_index
          FROM ranked
          WHERE ranked.rowid = chunks.rowid
        );
      `)
    })()
  }

  const migratedChunkColumns = db.pragma('table_info(chunks)') as Array<{ name: string }>
  const addChunkColumn = (name: string, definition: string) => {
    if (!migratedChunkColumns.some((column) => column.name === name)) {
      db.exec(`ALTER TABLE chunks ADD COLUMN ${name} ${definition};`)
    }
  }
  addChunkColumn('parent_id', 'TEXT')
  addChunkColumn('start_offset', 'INTEGER NOT NULL DEFAULT 0')
  addChunkColumn('end_offset', 'INTEGER NOT NULL DEFAULT 0')
  addChunkColumn('context_header', "TEXT NOT NULL DEFAULT ''")

  db.exec(`
    CREATE TABLE IF NOT EXISTS parent_chunks (
      id           TEXT PRIMARY KEY,
      path         TEXT NOT NULL,
      parent_index INTEGER NOT NULL,
      start_line   INTEGER NOT NULL,
      end_line     INTEGER NOT NULL,
      start_offset INTEGER NOT NULL,
      end_offset   INTEGER NOT NULL,
      text         TEXT NOT NULL,
      updated_at   INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
    CREATE INDEX IF NOT EXISTS idx_chunks_parent_id ON chunks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_parent_chunks_path ON parent_chunks(path);
  `)

  // FTS5 stays child-only. Its text contains the filename and heading context;
  // callers join back to chunks when they need the original source snippet.
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      text,
      id UNINDEXED,
      path UNINDEXED,
      start_line UNINDEXED,
      end_line UNINDEXED
    );
  `)
}
