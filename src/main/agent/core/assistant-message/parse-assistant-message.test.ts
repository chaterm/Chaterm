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

describe('parseAssistantMessageV2 DSML compatibility', () => {
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
})
