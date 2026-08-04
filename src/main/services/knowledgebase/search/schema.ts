import type Database from 'better-sqlite3'

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      path     TEXT PRIMARY KEY,
      hash     TEXT NOT NULL,
      mtime_ms INTEGER NOT NULL,
      size     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id         TEXT PRIMARY KEY,
      path       TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      start_line INTEGER NOT NULL,
      end_line   INTEGER NOT NULL,
      hash       TEXT NOT NULL,
      model      TEXT NOT NULL,
      text       TEXT NOT NULL,
      embedding  TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
  `)

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

  // FTS5 virtual table — separate exec because CREATE VIRTUAL TABLE
  // cannot be combined with other statements in the same exec block
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
