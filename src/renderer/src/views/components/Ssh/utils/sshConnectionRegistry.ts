// Registry mapping tabId (panel's currentConnectionId prop) to the actual SSH connectionId.
// This allows TerminalLayout's context menu to look up the SSH connectionId
// for a given tab without reaching into sshConnect.vue's internal state.

const registry = new Map<string, string>()

export function registerSshConnection(tabId: string, connectionId: string): void {
  registry.set(tabId, connectionId)
}

export function unregisterSshConnection(tabId: string): void {
  registry.delete(tabId)
}

export function getSshConnectionId(tabId: string): string | undefined {
  return registry.get(tabId)
}
