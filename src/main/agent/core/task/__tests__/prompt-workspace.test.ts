// Copyright (c) 2025-present, chaterm.ai  All rights reserved.
// This source code is licensed under the GPL-3.0

import { describe, expect, it } from 'vitest'

import {
  CHAT_SYSTEM_PROMPT_DATABASE,
  CHAT_SYSTEM_PROMPT_DATABASE_CN,
  pickDatabaseChatSystemTemplate,
  renderDatabaseChatSystemPrompt
} from '../../../../services/database-ai/prompts/chat-system'
import { selectSystemPrompt } from '../../prompts/system'

describe('selectSystemPrompt - workspace × language matrix', () => {
  it('workspace=server + en-US returns classic English SYSTEM_PROMPT', () => {
    const prompt = selectSystemPrompt({ workspace: 'server', language: 'en-US' })
    // Classic prompt introduces itself as "Chaterm, a seasoned system
    // administrator" and mentions SSH/OS domain language.
    expect(prompt).toContain('Chaterm, a seasoned system administrator')
    expect(prompt).toContain('execute_command')
    // Must NOT contain the DB-AI marker phrasing.
    expect(prompt).not.toContain('Chaterm DB-AI')
  })

  it('workspace=server + zh-CN returns classic Chinese SYSTEM_PROMPT_CN', () => {
    const prompt = selectSystemPrompt({ workspace: 'server', language: 'zh-CN' })
    expect(prompt).toContain('Chaterm')
    // Classic CN prompt opens with 系统管理员 phrasing.
    expect(prompt).toContain('系统管理员')
    expect(prompt).not.toContain('Chaterm DB-AI')
  })

  it('workspace=database + en-US returns DB-AI EN template with placeholders substituted', () => {
    const prompt = selectSystemPrompt({
      workspace: 'database',
      language: 'en-US',
      dbContext: { assetId: 'ast-42', dbType: 'postgresql', databaseName: 'app_prod', schemaName: 'public' }
    })
    expect(prompt).toContain('Chaterm DB-AI')
    expect(prompt).toContain('Asset identifier: ast-42')
    // dbType appears both in the context section and in tool-group heading.
    expect(prompt).toContain('Engine: postgresql')
    expect(prompt).toContain('Current database: app_prod')
    expect(prompt).toContain('Current schema: public')
    // None of the server-workspace tools or host/SSH/OS system-info segments.
    // (The intro mentions "no shell" as a boundary statement, which is
    // intentional; we only assert that the prompt does not describe or
    // instruct the model to use shell tools.)
    expect(prompt).not.toContain('execute_command')
    expect(prompt).not.toContain('SSH')
    expect(prompt).not.toContain('OS_VERSION')
    // Placeholders must all be substituted.
    expect(prompt).not.toMatch(/\{\{\w+\}\}/)
  })

  it('workspace=database + zh-CN returns DB-AI CN template with placeholders substituted', () => {
    const prompt = selectSystemPrompt({
      workspace: 'database',
      language: 'zh-CN',
      dbContext: { assetId: 'ast-7', dbType: 'mysql', databaseName: 'shop', schemaName: undefined }
    })
    expect(prompt).toContain('Chaterm DB-AI')
    expect(prompt).toContain('资产标识：ast-7')
    expect(prompt).toContain('引擎：mysql')
    expect(prompt).toContain('当前数据库：shop')
    // MySQL has no schema, so the placeholder renders as the localised fallback.
    expect(prompt).toContain('当前 schema：（未设置）')
    // No server-workspace tool instructions.
    expect(prompt).not.toContain('execute_command')
    expect(prompt).not.toContain('SSH')
    expect(prompt).not.toMatch(/\{\{\w+\}\}/)
  })
})

describe('selectSystemPrompt - defaults and back-compat', () => {
  it('omitting workspace falls back to server (classic) prompt', () => {
    const enPrompt = selectSystemPrompt({ language: 'en-US' })
    expect(enPrompt).toContain('Chaterm, a seasoned system administrator')
    const cnPrompt = selectSystemPrompt({ language: 'zh-CN' })
    expect(cnPrompt).toContain('系统管理员')
  })

  it('omitting language falls back to English', () => {
    const prompt = selectSystemPrompt({ workspace: 'database', dbContext: { assetId: 'a', dbType: 'postgresql' } })
    expect(prompt).toContain('Chaterm DB-AI')
    expect(prompt).toContain('Engine: postgresql')
  })

  it('workspace=database without dbContext uses (not set) fallbacks without throwing', () => {
    const prompt = selectSystemPrompt({ workspace: 'database', language: 'en-US' })
    expect(prompt).toContain('Chaterm DB-AI')
    // Empty assetId + mysql fallback engine is emitted as (not set) /
    // the literal dbType. Key property: no raw `{{...}}` tokens leak.
    expect(prompt).not.toMatch(/\{\{\w+\}\}/)
  })

  it('unknown language value coerces to English', () => {
    const prompt = selectSystemPrompt({ workspace: 'server', language: 'fr-FR' })
    expect(prompt).toContain('Chaterm, a seasoned system administrator')
  })
})

describe('chat-system template - DB tool surface', () => {
  const allDbTools = [
    'list_databases',
    'list_schemas',
    'list_tables',
    'describe_table',
    'inspect_indexes',
    'sample_rows',
    'count_rows',
    'explain_plan',
    'execute_readonly_query',
    'execute_write_query',
    'suggest_indexes'
  ] as const

  it('EN template lists every DB-AI tool', () => {
    for (const name of allDbTools) {
      expect(CHAT_SYSTEM_PROMPT_DATABASE).toContain(`## ${name}`)
    }
  })

  it('CN template lists every DB-AI tool', () => {
    for (const name of allDbTools) {
      expect(CHAT_SYSTEM_PROMPT_DATABASE_CN).toContain(`## ${name}`)
    }
  })

  it('templates expose execute_readonly_query', () => {
    expect(CHAT_SYSTEM_PROMPT_DATABASE).toContain('execute_readonly_query')
    expect(CHAT_SYSTEM_PROMPT_DATABASE_CN).toContain('execute_readonly_query')
  })

  it('templates do NOT mention shell/SSH-specific tools', () => {
    // Tools that only live in the server workspace must never leak into the
    // DB prompt, even by mistake.
    for (const serverOnly of ['execute_command', 'write_to_file', 'read_file', 'glob_search', 'grep_search']) {
      expect(CHAT_SYSTEM_PROMPT_DATABASE, `EN template must not mention ${serverOnly}`).not.toContain(serverOnly)
      expect(CHAT_SYSTEM_PROMPT_DATABASE_CN, `CN template must not mention ${serverOnly}`).not.toContain(serverOnly)
    }
  })

  it('templates include read-only boundary and no-fabrication guardrails', () => {
    expect(CHAT_SYSTEM_PROMPT_DATABASE).toContain('READ-ONLY BOUNDARY')
    expect(CHAT_SYSTEM_PROMPT_DATABASE).toMatch(/MUST NOT.*(write operations|DDL|DML)/i)
    expect(CHAT_SYSTEM_PROMPT_DATABASE).toMatch(/MUST NOT invent/i)
    expect(CHAT_SYSTEM_PROMPT_DATABASE_CN).toContain('只读边界')
    expect(CHAT_SYSTEM_PROMPT_DATABASE_CN).toContain('编造不存在')
  })
})

describe('chat-system template - pickDatabaseChatSystemTemplate / renderDatabaseChatSystemPrompt', () => {
  it('pickDatabaseChatSystemTemplate returns EN by default', () => {
    expect(pickDatabaseChatSystemTemplate(undefined)).toBe(CHAT_SYSTEM_PROMPT_DATABASE)
    expect(pickDatabaseChatSystemTemplate('en-US')).toBe(CHAT_SYSTEM_PROMPT_DATABASE)
  })

  it('pickDatabaseChatSystemTemplate returns CN for zh-CN', () => {
    expect(pickDatabaseChatSystemTemplate('zh-CN')).toBe(CHAT_SYSTEM_PROMPT_DATABASE_CN)
  })

  it('renderDatabaseChatSystemPrompt replaces every placeholder', () => {
    const rendered = renderDatabaseChatSystemPrompt({ assetId: 'a1', dbType: 'mysql', databaseName: 'shop', schemaName: undefined }, 'en-US')
    // Every placeholder token must be replaced.
    for (const placeholder of ['{{assetId}}', '{{dbType}}', '{{database}}', '{{schema}}']) {
      expect(rendered).not.toContain(placeholder)
    }
    // Values actually land.
    expect(rendered).toContain('a1') // assetId
    expect(rendered).toContain('shop') // databaseName
    expect(rendered).toContain('(not set)') // schemaName fallback
  })
})
