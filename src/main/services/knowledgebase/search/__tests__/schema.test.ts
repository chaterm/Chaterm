import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from '../schema'

describe('initSchema', () => {
  it('backfills chunk indexes in file order without dropping cached embeddings', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE chunks (
        id         TEXT PRIMARY KEY,
        path       TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line   INTEGER NOT NULL,
        hash       TEXT NOT NULL,
        model      TEXT NOT NULL,
        text       TEXT NOT NULL,
        embedding  TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO chunks VALUES
        ('a-0', 'a.md', 1, 4, 'h1', 'model', 'a0', '[1,0]', 1),
        ('b-0', 'b.md', 1, 2, 'h2', 'model', 'b0', '[0,1]', 1),
        ('a-1', 'a.md', 3, 6, 'h3', 'model', 'a1', '[0.5,0.5]', 1);
    `)

    initSchema(db)
    initSchema(db)

    const rows = db.prepare('SELECT id, chunk_index, embedding FROM chunks ORDER BY rowid').all() as Array<{
      id: string
      chunk_index: number
      embedding: string
    }>
    expect(rows).toEqual([
      { id: 'a-0', chunk_index: 0, embedding: '[1,0]' },
      { id: 'b-0', chunk_index: 0, embedding: '[0,1]' },
      { id: 'a-1', chunk_index: 1, embedding: '[0.5,0.5]' }
    ])

    db.prepare('INSERT INTO chunks_fts (text, id, path, start_line, end_line) VALUES (?, ?, ?, ?, ?)').run('a1', 'a-1', 'a.md', 3, 6)
    const keywordHit = db
      .prepare(
        `SELECT chunks.chunk_index AS chunk_index
         FROM chunks_fts
         INNER JOIN chunks ON chunks.id = chunks_fts.id
         WHERE chunks_fts MATCH ?`
      )
      .get('a1') as { chunk_index: number }
    expect(keywordHit.chunk_index).toBe(1)

    db.close()
  })
})
