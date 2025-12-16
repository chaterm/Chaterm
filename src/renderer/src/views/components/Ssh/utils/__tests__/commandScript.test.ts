import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeScript } from '../commandScript'

describe('commandScript', () => {
  let mockTerminal: { write: (data: string) => void; writtenData: string[] }

  beforeEach(() => {
    const writtenData: string[] = []
    mockTerminal = {
      writtenData,
      write: vi.fn<[string], void>((data: string) => {
        writtenData.push(data)
      })
    }
  })

  describe('基础命令解析', () => {
    it('应该执行普通命令并添加回车', async () => {
      await executeScript('ls -la', mockTerminal)
      expect(mockTerminal.write).toHaveBeenCalledWith('ls -la\r')
    })

    it('应该处理多行命令', async () => {
      await executeScript('echo hello\necho world', mockTerminal)
      expect(mockTerminal.writtenData).toContain('echo hello\r')
      expect(mockTerminal.writtenData).toContain('echo world\r')
    })

    it('当 autoExecute=false 时最后一条命令不应添加回车', async () => {
      await executeScript('echo hello\necho world', mockTerminal, false)
      expect(mockTerminal.writtenData).toContain('echo hello\r')
      expect(mockTerminal.writtenData).toContain('echo world') // 无 \r
      expect(mockTerminal.writtenData).not.toContain('echo world\r')
    })
  })

  describe('注释处理', () => {
    it('应该跳过 # 开头的注释', async () => {
      await executeScript('# This is a comment\necho hello', mockTerminal)
      expect(mockTerminal.write).toHaveBeenCalledTimes(1)
      expect(mockTerminal.writtenData).toContain('echo hello\r')
    })

    it('应该跳过 // 开头的注释', async () => {
      await executeScript('// This is a comment\necho hello', mockTerminal)
      expect(mockTerminal.write).toHaveBeenCalledTimes(1)
      expect(mockTerminal.writtenData).toContain('echo hello\r')
    })

    it('应该跳过空行', async () => {
      await executeScript('echo hello\n\necho world', mockTerminal)
      expect(mockTerminal.write).toHaveBeenCalledTimes(2)
    })
  })

  describe('sleep 命令', () => {
    it('应该解析 sleep==100 格式的延时命令', async () => {
      const startTime = Date.now()
      await executeScript('sleep==110', mockTerminal)
      const elapsed = Date.now() - startTime

      // 应该等待约100ms (加上50ms的基础延迟，允许一些误差)
      // 下界：至少等待100ms
      expect(elapsed).toBeGreaterThanOrEqual(100)
      // 上界：不应该超过300ms (100ms sleep + 50ms delay + 误差)
      expect(elapsed).toBeLessThan(300)
      // 不应该向终端写入任何内容
      expect(mockTerminal.write).not.toHaveBeenCalled()
    })

    it('sleep 命令应该是大小写不敏感的', async () => {
      await executeScript('SLEEP==50', mockTerminal)
      expect(mockTerminal.write).not.toHaveBeenCalled()
    })
  })

  describe('特殊按键', () => {
    it('应该处理 esc 键', async () => {
      await executeScript('esc', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x1b')
    })

    it('应该处理 tab 键', async () => {
      await executeScript('tab', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\t')
    })

    it('应该处理 return 键', async () => {
      await executeScript('return', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\r')
    })

    it('应该处理 backspace 键', async () => {
      await executeScript('backspace', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\b')
    })

    it('特殊按键应该大小写不敏感', async () => {
      await executeScript('TAB', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\t')
    })
  })

  describe('方向键', () => {
    it('应该处理 up 键', async () => {
      await executeScript('up', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x1b[A')
    })

    it('应该处理 down 键', async () => {
      await executeScript('down', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x1b[B')
    })

    it('应该处理 left 键', async () => {
      await executeScript('left', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x1b[D')
    })

    it('应该处理 right 键', async () => {
      await executeScript('right', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x1b[C')
    })
  })

  describe('Ctrl 组合键', () => {
    it('应该处理 ctrl+c', async () => {
      await executeScript('ctrl+c', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x03')
    })

    it('应该处理 ctrl+d', async () => {
      await executeScript('ctrl+d', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x04')
    })

    it('应该处理 ctrl+z', async () => {
      await executeScript('ctrl+z', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x1a')
    })

    it('应该处理 ctrl+l (清屏)', async () => {
      await executeScript('ctrl+l', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x0c')
    })

    it('ctrl 组合键应该大小写不敏感', async () => {
      await executeScript('CTRL+C', mockTerminal)
      expect(mockTerminal.writtenData).toContain('\x03')
    })
  })

  describe('复杂脚本', () => {
    it('应该按顺序执行混合脚本', async () => {
      const script = `
# 这是注释
echo hello
sleep==50
ctrl+c
up
echo world
`
      await executeScript(script, mockTerminal)

      // 验证执行顺序
      const calls = mockTerminal.writtenData
      expect(calls[0]).toBe('echo hello\r')
      expect(calls[1]).toBe('\x03') // ctrl+c
      expect(calls[2]).toBe('\x1b[A') // up
      expect(calls[3]).toBe('echo world\r')
    })

    it('应该处理 Windows 风格换行符 (CRLF)', async () => {
      await executeScript('echo hello\r\necho world', mockTerminal)
      expect(mockTerminal.write).toHaveBeenCalledTimes(2)
    })

    it('应该处理 Mac 旧风格换行符 (CR)', async () => {
      await executeScript('echo hello\recho world', mockTerminal)
      expect(mockTerminal.write).toHaveBeenCalledTimes(2)
    })
  })

  describe('边界情况', () => {
    it('空脚本不应该执行任何命令', async () => {
      await executeScript('', mockTerminal)
      expect(mockTerminal.write).not.toHaveBeenCalled()
    })

    it('只有空白字符的脚本不应该执行任何命令', async () => {
      await executeScript('   \n   \n   ', mockTerminal)
      expect(mockTerminal.write).not.toHaveBeenCalled()
    })

    it('只有注释的脚本不应该执行任何命令', async () => {
      await executeScript('# comment\n// another comment', mockTerminal)
      expect(mockTerminal.write).not.toHaveBeenCalled()
    })

    it('应该去除命令前后的空白', async () => {
      await executeScript('   echo hello   ', mockTerminal)
      expect(mockTerminal.writtenData).toContain('echo hello\r')
    })
  })
})
