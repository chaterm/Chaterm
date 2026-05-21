import type { DbConnectionSchema } from './index'

export const sqliteConnectionSchema: DbConnectionSchema = {
  dbType: 'SQLite',
  defaultPort: 0,
  fields: [
    { key: 'name', kind: 'text', labelKey: 'database.fields.name', required: true },
    { key: 'filePath', kind: 'text', labelKey: 'database.fields.filePath', required: true },
    { key: 'readonly', kind: 'checkbox', labelKey: 'database.fields.readonly' },
    { key: 'url', kind: 'text', labelKey: 'database.fields.url' }
  ]
}
