import { describe, expect, it } from 'vitest'
import { getLastNonEmptyLine, isTerminalPromptLine, matchPrompt } from '../terminalPrompt'

describe('terminalPrompt utils', () => {
  describe('getLastNonEmptyLine', () => {
    it('returns last non-empty line', () => {
      const output = 'line1\n\nline2\n'
      expect(getLastNonEmptyLine(output)).toBe('line2')
    })

    it('returns empty string for empty input', () => {
      expect(getLastNonEmptyLine('')).toBe('')
      expect(getLastNonEmptyLine('\n\n')).toBe('')
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

    it('matches Linux prompts with environment prefix (conda/virtualenv)', () => {
      expect(isTerminalPromptLine('(base) [root@centost-csjava-28112 ~]#')).toBe(true)
      expect(isTerminalPromptLine('(base) [user@host]$')).toBe(true)
      expect(isTerminalPromptLine('(myenv) user@host:~$')).toBe(true)
      expect(isTerminalPromptLine('(venv) $')).toBe(true)
      expect(isTerminalPromptLine('(conda-env) #')).toBe(true)
      expect(isTerminalPromptLine('(py3.9) user@server:/home/user#')).toBe(true)
    })

    it('matches shell name with version prompts', () => {
      expect(isTerminalPromptLine('bash-5.1$')).toBe(true)
      expect(isTerminalPromptLine('bash-5.1#')).toBe(true)
      expect(isTerminalPromptLine('sh-4.4$')).toBe(true)
      expect(isTerminalPromptLine('zsh-5.8$')).toBe(true)
      expect(isTerminalPromptLine('(base) bash-5.1$')).toBe(true)
    })

    it('matches hostname only prompts', () => {
      expect(isTerminalPromptLine('hostname:~$')).toBe(true)
      expect(isTerminalPromptLine('myserver:/var/log#')).toBe(true)
      expect(isTerminalPromptLine('server01:~#')).toBe(true)
      expect(isTerminalPromptLine('(base) hostname:~$')).toBe(true)
    })

    it('matches path only prompts', () => {
      expect(isTerminalPromptLine('~/projects $')).toBe(true)
      expect(isTerminalPromptLine('/var/log #')).toBe(true)
      expect(isTerminalPromptLine('~ $')).toBe(true)
      expect(isTerminalPromptLine('./src $')).toBe(true)
      expect(isTerminalPromptLine('(venv) ~/code $')).toBe(true)
    })

    it('matches fish shell prompts', () => {
      expect(isTerminalPromptLine('user@host ~>')).toBe(true)
      expect(isTerminalPromptLine('hostname ~/projects>')).toBe(true)
      expect(isTerminalPromptLine('server /var/log>')).toBe(true)
      expect(isTerminalPromptLine('>')).toBe(true)
      expect(isTerminalPromptLine('(base) user@host ~>')).toBe(true)
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

    it('matches Git Bash prompts', () => {
      expect(isTerminalPromptLine('user@DESKTOP-ABC MINGW64 ~')).toBe(true)
      expect(isTerminalPromptLine('admin@PC123 MINGW32 /c/Users')).toBe(true)
      expect(isTerminalPromptLine('dev@hostname MSYS ~/projects')).toBe(true)
    })

    it('matches Windows PowerShell/CMD prompts', () => {
      expect(isTerminalPromptLine('C:\\Users\\admin>')).toBe(true)
      expect(isTerminalPromptLine('C:\\>')).toBe(true)
      expect(isTerminalPromptLine('D:\\Projects\\myapp>')).toBe(true)
      expect(isTerminalPromptLine('PS C:\\Users\\admin>')).toBe(true)
      expect(isTerminalPromptLine('PS D:\\Projects>')).toBe(true)
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
