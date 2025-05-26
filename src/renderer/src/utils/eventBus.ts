import mitt, { Emitter } from 'mitt'

/**
 * 定义事件类型
 */
export type AppEvents = {
  currentClickServer: any // 可根据实际 item 类型替换 any
  updateRightIcon: boolean // 更新右侧图标状态
  // 可扩展更多事件
}

const eventBus: Emitter<AppEvents> = mitt<AppEvents>()

export default eventBus
