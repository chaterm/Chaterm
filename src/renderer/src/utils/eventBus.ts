import mitt from 'mitt'

/**
 * 定义事件类型
 */
export interface AppEvents {
  currentClickServer: any // 可根据实际 item 类型替换 any
  updateRightIcon: boolean // 更新右侧图标状态
  executeTerminalCommand: { command: string; tabId?: string } // 执行终端命令
  focusActiveTerminal: void // 将焦点返回到当前活跃的终端
  getActiveTabAssetInfo: void | { tabId?: string } // 请求获取当前活跃tab的资产信息
  assetInfoResult: any | { assetInfo: any; tabId?: string } // 返回资产信息结果
  LocalAssetMenu: any // 更新资产目录
  SettingModelChanged: any // 设置页面模型变更事件
  AiTabModelChanged: any // AI Tab模型变更事件
  apiProviderChanged: any
  activeTabChanged: any
  chatToAi: any
  sendMessageToAi: { content: string; tabId?: string }
  toggleMenu: any
  updateWatermark: string // 更新水印状态
  updateSecretRedaction: string // 更新密文脱敏状态
  updateDataSync: string // 更新数据同步状态
  keyChainUpdated: void // 密钥更新事件，用于同步主机配置中的密钥选项
  aliasStatusChanged: number // 别名状态变更事件，1表示启用，2表示禁用
  openUserTab: any // 打开Tab
  // 可扩展更多事件
  [key: string | symbol]: any
}

const emitter = mitt<AppEvents>()

export default emitter
