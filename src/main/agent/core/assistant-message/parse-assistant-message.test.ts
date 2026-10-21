import { describe, expect, it } from 'vitest'
import { parseAssistantMessageV2 } from './parse-assistant-message'

const issueMessage = `The service list was offloaded. Let me read it to understand the topology.
<｜｜DSML｜｜ calls>
<｜｜DSML｜｜ invoke name="read_file">
<｜｜DSML｜｜ parameter name="path">offload/bdeba49e-89e7-45e1-bb9c-5c5675b7f875.txt</｜｜DSML｜｜ parameter>
<｜｜DSML｜｜ parameter name="limit>200</｜｜DSML｜｜ parameter>
<｜｜DSML｜｜ parameter name="offset>0</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>`

const expectedRead = {
  type: 'tool_use',
  name: 'read_file',
  params: { path: 'offload/bdeba49e-89e7-45e1-bb9c-5c5675b7f875.txt', limit: '200', offset: '0' },
  partial: false
}

const issue2627Todos =
  '[{"id":"t1","content":"确认 MetaTube 运行状态与配置","status":"in_progress","priority":"high"},{"id":"t2","content":"分析 MetaTube 日志中的数据库连接错误","status":"pending","priority":"high"},{"id":"t3","content":"检查 Emby 刮削调用链与 MediaWarp","status":"pending","priority":"medium"},{"id":"t4","content":"验证修复并给出结论","status":"pending","priority":"medium"}]'
const issue2627Message = `<tool_name>todo_write</tool_name> <｜｜DSML｜｜ parameter name="todos">${issue2627Todos}</｜｜DSML｜｜ parameter> </｜｜DSML｜｜ invoke>`
const expectedTodoWrite = { type: 'tool_use', name: 'todo_write', params: { todos: issue2627Todos }, partial: false }

describe('parseAssistantMessageV2 DSML compatibility', () => {
  it('parses the exact issue #2627 hybrid tool header and DSML parameters', () => {
    expect(parseAssistantMessageV2(issue2627Message)).toEqual([expectedTodoWrite])
  })

  it.each(['｜｜DSML｜｜', '||DSML||'])('accepts hybrid %s calls with whitespace and multiple parameters', (marker) => {
    const message = `<tool_name>\n read_file \n</tool_name>\n<${marker} parameter name="path">a.txt</${marker} parameter><${marker} parameter name="limit" string="false">200</${marker} parameter></${marker} invoke>`
    expect(parseAssistantMessageV2(message)).toEqual([
      { type: 'tool_use', name: 'read_file', params: { path: 'a.txt', limit: '200' }, partial: false }
    ])
  })

  it('keeps hybrid calls partial at every streaming split until invoke closes', () => {
    const parameterStart = issue2627Message.indexOf('>[') + 1
    for (let end = 1; end <= issue2627Message.length; end++) {
      const blocks = parseAssistantMessageV2(issue2627Message.slice(0, end))
      const tools = blocks.filter((block) => block.type === 'tool_use')
      expect(tools).toHaveLength(end < parameterStart ? 0 : 1)
      if (tools.length > 0) {
        expect(tools[0]).toMatchObject({ name: 'todo_write', partial: end < issue2627Message.length })
        expect(blocks.some((block) => block.type === 'text')).toBe(false)
      }
    }
  })

  it('continues parsing hybrid, DSML and XML calls with surrounding text', () => {
    expect(parseAssistantMessageV2(`Plan: ${issue2627Message}${issueMessage}<read_file><path>b.txt</path></read_file>Done`)).toEqual([
      { type: 'text', content: 'Plan:', partial: false },
      expectedTodoWrite,
      { type: 'text', content: issueMessage.split('\n')[0], partial: false },
      expectedRead,
      { type: 'tool_use', name: 'read_file', params: { path: 'b.txt' }, partial: false },
      { type: 'text', content: 'Done', partial: true }
    ])
  })

  it('does not interpret standalone tool_name text or unregistered hybrid names as tools', () => {
    for (const message of ['<tool_name>todo_write</tool_name>', issue2627Message.replace('todo_write', 'unknown_tool')]) {
      expect(parseAssistantMessageV2(message)).toEqual([{ type: 'text', content: message, partial: true }])
    }
    const literalHeader = '<tool_name>todo_write</tool_name>'
    expect(parseAssistantMessageV2(`${literalHeader} is a header. ${issue2627Message}${literalHeader}`)).toEqual([
      { type: 'text', content: `${literalHeader} is a header.`, partial: false },
      expectedTodoWrite,
      { type: 'text', content: literalHeader, partial: true }
    ])
  })

  it('parses consecutive hybrid calls without merging their parameters', () => {
    expect(parseAssistantMessageV2(`${issue2627Message}${issue2627Message}`)).toEqual([expectedTodoWrite, expectedTodoWrite])
  })

  it('preserves hybrid-looking parameter contents and MCP tool_name parameters', () => {
    expect(parseAssistantMessageV2(`<write_to_file><path>a.txt</path><content>${issue2627Message}</content></write_to_file>`)).toEqual([
      { type: 'tool_use', name: 'write_to_file', params: { path: 'a.txt', content: issue2627Message }, partial: false }
    ])
    const content = '<tool_name>todo_write</tool_name><todos>[]</todos><read_file><path>example</path></read_file>'
    expect(
      parseAssistantMessageV2(
        `<tool_name>write_to_file</tool_name><｜｜DSML｜｜ parameter name="path">a.txt</｜｜DSML｜｜ parameter><｜｜DSML｜｜ parameter name="content">${content}</｜｜DSML｜｜ parameter></｜｜DSML｜｜ invoke>`
      )
    ).toEqual([{ type: 'tool_use', name: 'write_to_file', params: { path: 'a.txt', content }, partial: false }])
    expect(
      parseAssistantMessageV2(
        '<use_mcp_tool><server_name>test</server_name><tool_name>todo_write</tool_name><arguments>{}</arguments></use_mcp_tool>'
      )
    ).toEqual([{ type: 'tool_use', name: 'use_mcp_tool', params: { server_name: 'test', tool_name: 'todo_write', arguments: '{}' }, partial: false }])
  })

  it('parses the exact issue #2556 response, including missing parameter quotes', () => {
    expect(parseAssistantMessageV2(issueMessage)).toEqual([{ type: 'text', content: issueMessage.split('\n')[0], partial: false }, expectedRead])
  })

  it.each(['｜｜DSML｜｜', '||DSML||'])('accepts valid %s calls and parameter attributes', (marker) => {
    const message = issueMessage
      .replaceAll('｜｜DSML｜｜', marker)
      .replace('name="limit>', 'name="limit" string="false">')
      .replace('name="offset>', 'name="offset">')
    expect(parseAssistantMessageV2(message)[1]).toEqual(expectedRead)
  })

  it('keeps streamed calls partial until the invoke closes and hides DSML text at every split', () => {
    const invocationEnd = issueMessage.indexOf('</｜｜DSML｜｜ invoke>') + '</｜｜DSML｜｜ invoke>'.length
    for (let end = 1; end <= issueMessage.length; end++) {
      const blocks = parseAssistantMessageV2(issueMessage.slice(0, end))
      expect(
        blocks
          .filter((block) => block.type === 'text')
          .map((block) => block.content)
          .join('')
      ).toBe(issueMessage.split('\n')[0].slice(0, end).trim())
      for (const block of blocks) {
        if (block.type === 'tool_use') expect(block.partial).toBe(end < invocationEnd)
      }
    }
  })

  it('handles calls without introductory text, multiple invocations and trailing text', () => {
    const invocation =
      '<｜｜DSML｜｜ invoke name="read_file"><｜｜DSML｜｜ parameter name="path">a.txt</｜｜DSML｜｜ parameter></｜｜DSML｜｜ invoke>'
    expect(parseAssistantMessageV2(`<｜｜DSML｜｜ calls>${invocation}${invocation}</｜｜DSML｜｜ calls>Done`)).toEqual([
      { type: 'tool_use', name: 'read_file', params: { path: 'a.txt' }, partial: false },
      { type: 'tool_use', name: 'read_file', params: { path: 'a.txt' }, partial: false },
      { type: 'text', content: 'Done', partial: true }
    ])
  })

  it('does not execute unregistered DSML tool names', () => {
    const blocks = parseAssistantMessageV2('<｜｜DSML｜｜ calls><｜｜DSML｜｜ invoke name="unknown_tool"></｜｜DSML｜｜ invoke></｜｜DSML｜｜ calls>')
    expect(blocks.some((block) => block.type === 'tool_use')).toBe(false)
    expect(blocks[0]).toMatchObject({ type: 'text', content: '<｜｜DSML｜｜ invoke name="unknown_tool"></｜｜DSML｜｜ invoke>' })
  })

  it('preserves XML-like text inside DSML parameter values', () => {
    const content = '<content>literal</content><read_file><path>example</path></read_file>'
    expect(
      parseAssistantMessageV2(
        `<｜｜DSML｜｜ invoke name="write_to_file"><｜｜DSML｜｜ parameter name="path">a.txt</｜｜DSML｜｜ parameter><｜｜DSML｜｜ parameter name="content">${content}</｜｜DSML｜｜ parameter></｜｜DSML｜｜ invoke>`
      )
    ).toEqual([{ type: 'tool_use', name: 'write_to_file', params: { path: 'a.txt', content }, partial: false }])
  })

  it('preserves DSML-like file contents in ordinary XML calls', () => {
    const content =
      '<｜｜DSML｜｜ calls><｜｜DSML｜｜ invoke name="read_file"><｜｜DSML｜｜ parameter name="path">example</｜｜DSML｜｜ parameter></｜｜DSML｜｜ invoke></｜｜DSML｜｜ calls>'
    expect(parseAssistantMessageV2(`<write_to_file><path>a.txt</path><content>${content}</content></write_to_file>`)).toEqual([
      { type: 'tool_use', name: 'write_to_file', params: { path: 'a.txt', content }, partial: false }
    ])
  })

  it('continues parsing ordinary XML calls after DSML calls', () => {
    expect(parseAssistantMessageV2(`${issueMessage}<read_file><path>b.txt</path></read_file>`).at(-1)).toEqual({
      type: 'tool_use',
      name: 'read_file',
      params: { path: 'b.txt' },
      partial: false
    })
  })

  it('retains existing XML and plain-text behavior', () => {
    expect(parseAssistantMessageV2('Hello <read_file><path>a.txt</path></read_file>Done')).toEqual([
      { type: 'text', content: 'Hello', partial: false },
      { type: 'tool_use', name: 'read_file', params: { path: 'a.txt' }, partial: false },
      { type: 'text', content: 'Done', partial: true }
    ])
    expect(parseAssistantMessageV2('<read_file><path>a')).toEqual([{ type: 'tool_use', name: 'read_file', params: { path: 'a' }, partial: true }])
  })

  const malformedInvocation = `<execute_command">
<command>uname -a</command>
<interactive>false</interactive>
<ip>69.12.64.21</ip>
<requires_approval>false</requires_approval>
</execute_command>`

  it('parses mangled tool openers with stray attribute remnants', () => {
    expect(parseAssistantMessageV2(malformedInvocation)).toEqual([
      {
        type: 'tool_use',
        name: 'execute_command',
        params: { command: 'uname -a', interactive: 'false', ip: '69.12.64.21', requires_approval: 'false' },
        partial: false
      }
    ])
    expect(parseAssistantMessageV2(`Plan first.\n${malformedInvocation}Done`)).toEqual([
      { type: 'text', content: 'Plan first.', partial: false },
      {
        type: 'tool_use',
        name: 'execute_command',
        params: { command: 'uname -a', interactive: 'false', ip: '69.12.64.21', requires_approval: 'false' },
        partial: false
      },
      { type: 'text', content: 'Done', partial: true }
    ])
  })

  it('accepts DSML closers inside mangled-opener calls', () => {
    const message = `<execute_command">
<command>uname -a</command>
</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>`
    expect(parseAssistantMessageV2(message)).toEqual([
      { type: 'tool_use', name: 'execute_command', params: { command: 'uname -a' }, partial: false }
    ])
  })

  it('accepts DSML parameters inside mangled-opener calls', () => {
    const message = `<execute_command"><｜｜DSML｜｜ parameter name="command">uname -a</｜｜DSML｜｜ parameter></｜｜DSML｜｜ invoke>`
    expect(parseAssistantMessageV2(message)).toEqual([
      { type: 'tool_use', name: 'execute_command', params: { command: 'uname -a' }, partial: false }
    ])
  })

  it('keeps streamed mangled-opener calls partial until the invoke closes', () => {
    const message = '<execute_command"><command>uname -a</command></｜｜DSML｜｜ invoke>'
    const openerEnd = message.indexOf('>') + 1
    for (let end = 1; end <= message.length; end++) {
      const blocks = parseAssistantMessageV2(message.slice(0, end))
      const tools = blocks.filter((block) => block.type === 'tool_use')
      expect(tools).toHaveLength(end < openerEnd ? 0 : 1)
      if (tools.length > 0) {
        expect(tools[0]).toMatchObject({ name: 'execute_command', partial: end < message.length })
      }
    }
  })

  it('keeps unregistered mangled tags as ordinary text', () => {
    const message = '<div">hello</div">'
    expect(parseAssistantMessageV2(message)).toEqual([{ type: 'text', content: message, partial: true }])
  })
})
