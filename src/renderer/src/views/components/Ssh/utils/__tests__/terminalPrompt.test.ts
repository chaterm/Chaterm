import { describe, expect, it } from 'vitest'
import { getLastNonEmptyLine, isTerminalPromptLine, matchPrompt } from '../terminalPrompt'
import { stripAnsiBasic } from '../ansiUtils'

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

    it('extracts trailing prompt when prompt is on the same line without newline', () => {
      const output =
        'curl -s http://127.0.0.1:8500/v1/catalog/datacenters\n' +
        '["aliyun_sandbox","aliyun_autom","sandbox","secautom","uc_sandbox","autom","nx_autom","us_autom","us_sandbox"][xuhong_yao@AutomConsulSitC-172-16-158-235 ~]$ '

      expect(getLastNonEmptyLine(output)).toBe('[xuhong_yao@AutomConsulSitC-172-16-158-235 ~]$')
    })

    it('extracts bracket prompt when plain text output and prompt share the same line', () => {
      const output = 'curl -s http://127.0.0.1:8500/v1/catalog/datacenters\n"aliyun_sandbox" ssdsdsv  [xuhong_yao@AutomConsulSitC-172-16-158-235 ~]$'
      expect(getLastNonEmptyLine(output)).toBe('[xuhong_yao@AutomConsulSitC-172-16-158-235 ~]$')
    })

    it('extracts trailing user@host:path prompt when appended without newline', () => {
      const output = '{"status":"ok","count":8}user@host:/var/log# '
      expect(getLastNonEmptyLine(output)).toBe('user@host:/var/log#')
    })

    it('extracts trailing Windows PowerShell prompt when appended without newline', () => {
      const output = 'TotalMemoryMB: 31518PS C:\\Users\\admin> '
      expect(getLastNonEmptyLine(output)).toBe('PS C:\\Users\\admin>')
    })

    it('extracts trailing Windows CMD prompt when appended without newline', () => {
      const output = 'Volume serial number is 1234-ABCDC:\\Users\\admin> '
      expect(getLastNonEmptyLine(output)).toBe('C:\\Users\\admin>')
    })

    it('does not treat glued single-char suffix as prompt', () => {
      const output = 'checksum$'
      expect(getLastNonEmptyLine(output)).toBe('checksum$')
    })

    it('extracts single-char prompt when separated by whitespace', () => {
      const output = 'checksum $ '
      expect(getLastNonEmptyLine(output)).toBe('$')
    })

    it('extracts zsh theme prompt after macOS redraw sequences', () => {
      const output =
        'ProductName:\t\tmacOS\r\n' +
        '\x1b[1m\x1b[7m%\x1b[27m\x1b[1m\x1b[0m     \r \r' +
        '\x1b]2;user@host:~\x07\x1b]1;~\x07' +
        '\x1b]7;file://host/Users/test\x1b\\' +
        '\r\x1b[0m\x1b[27m\x1b[24m\x1b[J(base) \x1b[01;32m➜  \x1b[36m~\x1b[00m \x1b[K\x1b[?1h\x1b=\x1b[?2004h'

      expect(getLastNonEmptyLine(output)).toBe('(base) ➜  ~')
    })

    it('does not extract zsh prompt markers from ordinary output text', () => {
      expect(getLastNonEmptyLine('Deploy ➜ production')).toBe('Deploy ➜ production')
      expect(getLastNonEmptyLine('Next ❯ done')).toBe('Next ❯ done')
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

    it('matches zsh theme prompts', () => {
      expect(isTerminalPromptLine('(base) ➜  ~')).toBe(true)
      expect(isTerminalPromptLine('➜  Chaterm git:(main) ✗')).toBe(true)
      expect(isTerminalPromptLine('❯  ~/code')).toBe(true)
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
      expect(isTerminalPromptLine('Deploy ➜ production')).toBe(false)
      expect(
        isTerminalPromptLine(
          '["aliyun_sandbox","aliyun_autom","sandbox","secautom","uc_sandbox","autom","nx_autom","us_autom","us_sandbox"][xuhong_yao@AutomConsulSitC-172-16-158-235 ~]$'
        )
      ).toBe(false)
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

  describe('ANSI cleanup for prompt and command echo parsing', () => {
    it('strips OSC title sequences used by macOS zsh', () => {
      expect(stripAnsiBasic('\x1b]2;sw_vers\x07\x1b]1;sw_vers\x07ProductName:\t\tmacOS')).toBe('ProductName:\t\tmacOS')
    })

    it('applies backspace redraws before comparing command echo', () => {
      expect(stripAnsiBasic('s\x08sw_vers\x1b[?1l\x1b>\x1b[?2004l')).toBe('sw_vers')
    })
  })
})
