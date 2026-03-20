import { safeParse, safeStringify } from './json-serializer'

export type KvTransactionOp = { action: 'set'; key: string; value: string } | { action: 'delete'; key: string }

export interface DeserializedKvValue {
  value: unknown
  source: 'superjson' | 'plain_json' | 'invalid'
}

export async function serializeKvTransactionOps(ops: Array<{ action: 'set' | 'delete'; key: string; value?: string }>): Promise<KvTransactionOp[]> {
  const serializedOps: KvTransactionOp[] = []

  for (const op of ops) {
    if (op.action === 'delete') {
      serializedOps.push({
        action: 'delete',
        key: op.key
      })
      continue
    }

    if (op.value === undefined) {
      throw new Error(`KV transaction set action requires value for key ${op.key}`)
    }

    const valueObj = JSON.parse(op.value)
    const result = await safeStringify(valueObj)
    if (!result.success || !result.data) {
      throw new Error(`Failed to serialize KV transaction value for key ${op.key}: ${result.error || 'unknown error'}`)
    }

    serializedOps.push({
      action: 'set',
      key: op.key,
      value: result.data
    })
  }

  return serializedOps
}

export async function deserializeStoredKvValue(rawValue: string): Promise<DeserializedKvValue> {
  const parsedValue = await safeParse(rawValue)

  if (parsedValue !== undefined && parsedValue !== null) {
    return {
      value: parsedValue,
      source: 'superjson'
    }
  }

  try {
    return {
      value: JSON.parse(rawValue),
      source: 'plain_json'
    }
  } catch {
    return {
      value: parsedValue,
      source: 'invalid'
    }
  }
}
