export interface ChatSettings {
  mode: 'chat' | 'cmd' | 'agent'
}

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  mode: 'agent'
}
