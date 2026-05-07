// Copyright (c) 2025-present, chaterm.ai  All rights reserved.
// This source code is licensed under the GPL-3.0

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_WORKSPACE,
  hasValidDbContext,
  isWorkspaceToolAllowed,
  normaliseWorkspace,
  toolsForWorkspace,
  type DbTaskContext,
  type TaskWorkspace
} from '../workspace'
import { toolMetadata } from '../tool-registry'

describe('workspace helpers - normaliseWorkspace', () => {
  it('returns "server" for undefined / null / unknown strings', () => {
    expect(normaliseWorkspace(undefined)).toBe('server')
    expect(normaliseWorkspace(null)).toBe('server')
    expect(normaliseWorkspace('')).toBe('server')
    expect(normaliseWorkspace('unknown')).toBe('server')
    expect(normaliseWorkspace(42)).toBe('server')
  })

  it('returns "server" when value is literally "server"', () => {
    expect(normaliseWorkspace('server')).toBe('server')
  })

  it('returns "database" when value is literally "database"', () => {
    expect(normaliseWorkspace('database')).toBe('database')
  })

  it('DEFAULT_WORKSPACE is "server"', () => {
    expect(DEFAULT_WORKSPACE).toBe<TaskWorkspace>('server')
  })
})

describe('workspace helpers - hasValidDbContext', () => {
  it('rejects null / undefined / primitive values', () => {
    expect(hasValidDbContext(null)).toBe(false)
    expect(hasValidDbContext(undefined)).toBe(false)
    expect(hasValidDbContext('ctx')).toBe(false)
    expect(hasValidDbContext(42)).toBe(false)
  })

  it('rejects objects without assetId', () => {
    expect(hasValidDbContext({ dbType: 'postgresql' })).toBe(false)
  })

  it('rejects objects with unsupported dbType', () => {
    expect(hasValidDbContext({ assetId: 'a1', dbType: 'sqlite' })).toBe(false)
  })

  it('accepts minimal valid context', () => {
    const ctx: DbTaskContext = { assetId: 'a1', dbType: 'postgresql' }
    expect(hasValidDbContext(ctx)).toBe(true)
  })

  it('accepts context with optional fields populated', () => {
    const ctx: DbTaskContext = {
      assetId: 'a1',
      dbType: 'mysql',
      databaseName: 'app',
      schemaName: 'public',
      tableName: 'users'
    }
    expect(hasValidDbContext(ctx)).toBe(true)
  })
})

describe('workspace helpers - toolsForWorkspace / isWorkspaceToolAllowed', () => {
  it('toolsForWorkspace("server") returns every server-visible tool from the registry', () => {
    const serverTools = toolsForWorkspace('server')
    const expected = toolMetadata.filter((m) => m.allowedIn.includes('server'))
    expect(serverTools).toHaveLength(expected.length)
    const names = new Set(serverTools.map((m) => m.name))
    // execute_command is the canonical server-only tool; must always appear.
    expect(names.has('execute_command')).toBe(true)
  })

  it('toolsForWorkspace("database") excludes server-only shell/FS tools', () => {
    const tools = toolsForWorkspace('database')
    const names = new Set(tools.map((m) => m.name))
    expect(names.has('execute_command')).toBe(false)
    expect(names.has('ask_followup_question')).toBe(true)
    expect(names.has('web_fetch')).toBe(true)
  })

  it('isWorkspaceToolAllowed respects workspace visibility', () => {
    expect(isWorkspaceToolAllowed('execute_command', 'server')).toBe(true)
    expect(isWorkspaceToolAllowed('execute_command', 'database')).toBe(false)
    expect(isWorkspaceToolAllowed('ask_followup_question', 'server')).toBe(true)
    expect(isWorkspaceToolAllowed('ask_followup_question', 'database')).toBe(true)
  })
})
