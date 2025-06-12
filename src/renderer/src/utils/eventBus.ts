import mitt from 'mitt'

/**
 * 定义事件类型
 */
export interface AppEvents {
  currentClickServer: any // 可根据实际 item 类型替换 any
  updateRightIcon: boolean // 更新右侧图标状态
  executeTerminalCommand: string // 执行终端命令
  writeTerminalCommand: string // 写入终端命令
  getActiveTabAssetInfo: void // 请求获取当前活跃tab的资产信息
  assetInfoResult: any // 返回资产信息结果
  currentCwdChanged: string // 当前工作目录变化事件
  LocalAssetMenu: any // 更新资产目录
  SettingModelChanged: any
  apiProviderChanged: any
  activeTabChanged: any
  // 可扩展更多事件
  [key: string | symbol]: any
}

const emitter = mitt<AppEvents>()

export default emitter
