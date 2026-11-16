import type { Terminal } from '@xterm/xterm'

// Maps the element an output terminal is opened on to its xterm instance, so the
// chat search can read the full buffer instead of only the rows currently rendered.
const terminals = new WeakMap<HTMLElement, Terminal>()

export function registerTerminalOutput(element: HTMLElement, terminal: Terminal): void {
  terminals.set(element, terminal)
}

export function unregisterTerminalOutput(element: HTMLElement): void {
  terminals.delete(element)
}

export function getTerminalOutput(element: HTMLElement): Terminal | undefined {
  return terminals.get(element)
}
