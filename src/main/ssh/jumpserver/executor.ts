/**
 * JumpServer 命令执行和输出解析工具
 */

/**
 * 输出解析器 - 清理命令输出中的控制字符和回显
 */
export class OutputParser {
  /**
   * 清理命令输出，移除回显和控制字符
   * @param rawOutput 原始输出
   * @returns 清理后的输出
   */
  static cleanCommandOutput(rawOutput: string): string {
    // 按行分割
    const lines = rawOutput.split(/\r?\n/)

    // 过滤掉控制字符、空行、命令回显片段
    const cleanLines = lines.filter((line, index) => {
      const trimmed = line.trim()

      // 保留非空行
      if (!trimmed || trimmed === '\r') {
        return false
      }

      // 移除控制字符
      if (trimmed === '\x1b[?2004l' || trimmed.startsWith('\x1b]')) {
        return false
      }

      // 移除 echo 标记的行
      if (trimmed.includes('echo "') && trimmed.includes('__CHATERM_')) {
        return false
      }

      // 移除标记本身
      if (trimmed.startsWith('__CHATERM_')) {
        return false
      }

      // 移除命令回显（第一行通常是命令本身）
      if (index === 0 && (trimmed.includes('ls ') || trimmed.includes('sudo '))) {
        return false
      }

      return true
    })

    // 拼接并清理行尾的 \r
    const result = cleanLines
      .map((line) => line.replace(/\r$/, ''))
      .join('\n')
      .trim()

    return result
  }

  /**
   * 从输出中提取退出码
   * @param output 完整输出
   * @param exitCodeMarker 退出码标记
   * @returns 退出码，默认为 0
   */
  static extractExitCode(output: string, exitCodeMarker: string): number {
    const exitCodePattern = new RegExp(`${exitCodeMarker}(\\d+)`)
    const exitCodeMatch = output.match(exitCodePattern)
    return exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0
  }

  /**
   * 生成唯一的命令标记
   * @returns { marker, exitCodeMarker }
   */
  static generateMarkers(): { marker: string; exitCodeMarker: string } {
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(7)

    return {
      marker: `__CHATERM_EXEC_END_${timestamp}_${randomId}__`,
      exitCodeMarker: `__CHATERM_EXIT_CODE_${timestamp}_${randomId}__`
    }
  }
}
