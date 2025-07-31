export const cleanAnsiEscapeSequences = (text: string): string => {
  if (!text || typeof text !== 'string') {
    return text
  }

  return text
    .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\u001b\[\?[0-9;]*[hl]/g, '')
    .replace(/\u001b\[[\d;]*[HfABCDEFGJKSTijklmnpqrsu]/g, '')
    .replace(/\u001b\[[0-9]+[ABCD]/g, '')
    .replace(/\u001b\[K/g, '')
    .replace(/\u001b\[J/g, '')
    .replace(/\u001b\[2J/g, '')
    .replace(/\u001b\[H/g, '')
    .replace(/\u001b\[[0-9]*[JK]/g, '')
    .replace(/\u001b\]0;[^\u0007]*\u0007/g, '')
    .replace(/\u001b\][0-9;]*[^\u0007]*\u0007/g, '')
    .replace(/\u001b\([AB01]/g, '')
    .replace(/\u001b[=>]/g, '')
    .replace(/\u001b[NO]/g, '')
    .replace(/\x00/g, '')
    .replace(/\x07/g, '')
    .replace(/\x08/g, '')
    .replace(/\x0B/g, '')
    .replace(/\x0C/g, '')
    .replace(/\x0E/g, '')
    .replace(/\x0F/g, '')
    .replace(/\r/g, '')
    .replace(/\u001b\[m/g, '')
    .replace(/\u001b\[\d*m/g, '')
}

export const extractFinalOutput = (formattedOutput: string): string => {
  if (!formattedOutput || typeof formattedOutput !== 'string') {
    return formattedOutput
  }

  const mainRegex = /Terminal output:\n```\n([\s\S]*?)\n```/
  const mainMatch = formattedOutput.match(mainRegex)

  if (mainMatch && mainMatch[1]) {
    return cleanAnsiEscapeSequences(mainMatch[1]).trim()
  }

  const alternativeRegex = /```\n([\s\S]*?)\n```/
  const altMatch = formattedOutput.match(alternativeRegex)

  if (altMatch && altMatch[1]) {
    return cleanAnsiEscapeSequences(altMatch[1]).trim()
  }

  const simpleRegex = /```([\s\S]*?)```/
  const simpleMatch = formattedOutput.match(simpleRegex)

  if (simpleMatch && simpleMatch[1]) {
    return cleanAnsiEscapeSequences(simpleMatch[1]).trim()
  }

  return cleanAnsiEscapeSequences(formattedOutput)
}
