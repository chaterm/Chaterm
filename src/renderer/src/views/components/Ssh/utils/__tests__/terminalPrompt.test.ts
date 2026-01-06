import { describe, expect, it } from 'vitest'
import { getLastNonEmptyLine, isTerminalPromptLine, matchPrompt } from '../terminalPrompt'

describe('terminalPrompt utils', () => {
  describe('getLastNonEmptyLine', () => {
    it('returns last non-empty line', () => {
      const output = 'line1\\n\\nline2\\n'
      expect(getLastNonEmptyLine(output)).toBe('line2')
    })

    it('returns empty string for empty input', () => {
      expect(getLastNonEmptyLine('')).toBe('')
      expect(getLastNonEmptyLine('\\n\\n')).toBe('')
    })
  })

  describe('isTerminalPromptLine', () => {
    it('matches common Linux prompts', () => {
      expect(isTerminalPromptLine('[user@host]$')).toBe(true)
      expect(isTerminalPromptLine('[user@host]#')).toBe(true)
      expect(isTerminalPromptLine('user@host:~$')).toBe(true)
      expect(isTerminalPromptLine('user@host:/var/log#')).toBe(true)
      expect(isTerminalPromptLine('$')).toBe(true)
      expect(isTerminalPromptLine('#')).toBe(true)
    })

    it('matches Cisco prompts', () => {
      expect(isTerminalPromptLine('switch#')).toBe(true)
      expect(isTerminalPromptLine('switch>')).toBe(true)
      expect(isTerminalPromptLine('switch(config)#')).toBe(true)
      expect(isTerminalPromptLine('switch(config-if)#')).toBe(true)
    })

    it('matches Huawei prompts', () => {
      expect(isTerminalPromptLine('<hw6800-chaterm-test>')).toBe(true)
      expect(isTerminalPromptLine('[hw6800-chaterm-test]')).toBe(true)
      expect(isTerminalPromptLine('[~hw6800-chaterm-test]')).toBe(true)
      expect(isTerminalPromptLine('[*hw6800-chaterm-test]')).toBe(true)
      expect(isTerminalPromptLine('[~*hw6800-chaterm-test]')).toBe(true)
      expect(isTerminalPromptLine('[hw6800-chaterm-test-GigabitEthernet0/0/1]')).toBe(true)
      expect(isTerminalPromptLine('[hw6800-chaterm-test-Vlanif10]')).toBe(true)
    })

    it('does not match non-prompt lines', () => {
      expect(isTerminalPromptLine('Huawei Versatile Routing Platform Software')).toBe(false)
      expect(isTerminalPromptLine('Info: The max number of VTY users is 5')).toBe(false)
      expect(isTerminalPromptLine('Compiled Tue 23-Apr-19 02:38 by mmen')).toBe(false)
      expect(isTerminalPromptLine('ROM: Bootstrap program is Linux')).toBe(false)
    })
  })

  describe('matchPrompt', () => {
    it('returns prompt type when matched', () => {
      expect(matchPrompt('<hw6800-chaterm-test>').type).toBe('huaweiUser')
      expect(matchPrompt('[hw6800-chaterm-test]').type).toBe('huaweiSystem')
      expect(matchPrompt('[~hw6800-chaterm-test]').type).toBe('huaweiSystem')
      expect(matchPrompt('[*hw6800-chaterm-test]').type).toBe('huaweiSystem')
      expect(matchPrompt('[~*hw6800-chaterm-test]').type).toBe('huaweiSystem')
      expect(matchPrompt('switch#').type).toBe('cisco')
      expect(matchPrompt('[user@host]$').type).toBe('linux')
    })

    it('returns unknown for non-prompt', () => {
      const result = matchPrompt('Not a prompt line')
      expect(result.isPrompt).toBe(false)
      expect(result.type).toBe('unknown')
    })
  })
})
