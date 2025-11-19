/**
 * 安全的 JSON 序列化工具
 * 使用 superjson 处理特殊类型：Date、undefined、NaN、Infinity、循环引用、RegExp、Set、Map、BigInt 等
 */

interface SerializationOptions {
  /** 是否严格模式(遇到无法序列化的值时抛出错误) */
  strict?: boolean
}

interface SerializationResult {
  success: boolean
  data?: string
  error?: string
}

// 延迟加载 superjson（使用动态 import 解决 ESM/CommonJS 兼容问题）
let superjsonInstance: any = null

async function getSuperjson() {
  if (!superjsonInstance) {
    // 动态导入 ESM 模块
    const module = await import('superjson')
    superjsonInstance = module.default || module
  }
  return superjsonInstance
}

/**
 * 安全的序列化
 *
 * 支持的特殊类型：
 * - Date 对象
 * - undefined, NaN, Infinity, -Infinity
 * - RegExp 正则表达式
 * - Set, Map 集合
 * - BigInt 大整数
 * - TypedArray (Uint8Array 等)
 * - Error 对象
 * - 循环引用
 *
 * @param value 要序列化的值
 * @param options 序列化选项
 * @returns 序列化结果
 */
export async function safeStringify(value: any, options: SerializationOptions = {}): Promise<SerializationResult> {
  const { strict = false } = options

  try {
    const superjson = await getSuperjson()
    const data = superjson.stringify(value)
    return { success: true, data }
  } catch (error: any) {
    if (strict) {
      throw error
    }
    return {
      success: false,
      error: error.message || 'JSON serialization failed'
    }
  }
}

/**
 * 安全的反序列化
 *
 * 自动恢复特殊类型：
 * - Date 对象
 * - undefined, NaN, Infinity, -Infinity
 * - RegExp 正则表达式
 * - Set, Map 集合
 * - BigInt 大整数
 * - TypedArray (Uint8Array 等)
 * - Error 对象
 * - 循环引用
 *
 * @param jsonString JSON 字符串
 * @returns 反序列化后的对象，失败返回 null
 */
export async function safeParse<T = any>(jsonString: string): Promise<T | null> {
  try {
    const superjson = await getSuperjson()
    return superjson.parse(jsonString) as T
  } catch (error) {
    console.error('JSON parse failed:', error)
    return null
  }
}
