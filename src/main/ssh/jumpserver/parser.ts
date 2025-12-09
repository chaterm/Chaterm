// ssh2jumpserver/parser.ts

export interface Asset {
  id: number
  name: string
  address: string
  platform: string
  organization: string
  comment: string
}

export interface PaginationInfo {
  currentPage: number
  totalPages: number
}

export interface ParsedOutput {
  assets: Asset[]
  pagination: PaginationInfo
}

export interface JumpServerUser {
  id: number
  name: string
  username: string
}

/**
 * 解析资产信息 - 支持中英文表头
 * 中文表头: ID | 名称 | 地址 | 平台 | 组织 | 备注
 * 英文表头: ID | NAME | ADDRESS | PLATFORM | ORGANIZATION | COMMENT
 */
function parseAssets(output: string): Asset[] {
  const assets: Asset[] = []
  const lines = output.split('\n')
  const assetRegex = /^\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*$/

  let foundAssetHeader = false

  for (const line of lines) {
    // 仅在未找到表头时进行检测
    if (!foundAssetHeader) {
      const upperLine = line.toUpperCase()

      // 优先检测中文表头
      if (line.includes('ID') && (line.includes('名称') || line.includes('地址'))) {
        foundAssetHeader = true
        continue
      }

      // 回退到英文表头 - 使用 ADDRESS 区分资产表和用户表
      if (upperLine.includes('ID') && upperLine.includes('ADDRESS') && !upperLine.includes('USERNAME')) {
        foundAssetHeader = true
        continue
      }

      // 通用分隔符检测
      if (line.includes('-----+--')) {
        foundAssetHeader = true
        continue
      }
    }

    if (foundAssetHeader) {
      const match = line.match(assetRegex)
      if (match) {
        try {
          const asset: Asset = {
            id: parseInt(match[1].trim()),
            name: match[2].trim(),
            address: match[3].trim(),
            platform: match[4].trim(),
            organization: match[5].trim(),
            comment: match[6].trim()
          }
          assets.push(asset)
        } catch (e) {
          console.error('解析资产行失败:', line, e)
        }
      }
    }
  }
  return assets
}

/**
 * 解析分页信息 - 支持中英文格式
 * 中文: 页码：1，每页行数：10，总页数：2
 * 英文: Page: 1, Count: 10, Total Page: 2, Total Count: 18
 */
function parsePagination(output: string): PaginationInfo {
  // 优先尝试中文格式
  const chineseRegex = /页码：\s*(\d+).*?总页数：\s*(\d+)/
  const chineseMatch = output.match(chineseRegex)
  if (chineseMatch) {
    return {
      currentPage: parseInt(chineseMatch[1], 10),
      totalPages: parseInt(chineseMatch[2], 10)
    }
  }

  // 回退到英文格式
  const englishRegex = /Page:\s*(\d+).*?Total Page:\s*(\d+)/
  const englishMatch = output.match(englishRegex)
  if (englishMatch) {
    return {
      currentPage: parseInt(englishMatch[1], 10),
      totalPages: parseInt(englishMatch[2], 10)
    }
  }

  // 默认值
  return { currentPage: 1, totalPages: 1 }
}

/**
 * 解析 Jumpserver 的原始输出
 * @param output Jumpserver shell 的原始输出字符串
 * @returns 解析后的资产和分页信息
 */
export function parseJumpserverOutput(output: string): ParsedOutput {
  const assets = parseAssets(output)
  const pagination = parsePagination(output)
  return { assets, pagination }
}

/**
 * Parse JumpServer user list from output
 * @param output JumpServer shell output containing user table
 * @returns Array of parsed users
 */
export function parseJumpServerUsers(output: string): JumpServerUser[] {
  const users: JumpServerUser[] = []
  const lines = output.split('\n')
  // Match pattern: ID | NAME | USERNAME
  const userRegex = /^\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*$/

  let foundUserHeader = false

  for (const line of lines) {
    // Detect user table header (ID | NAME | USERNAME)
    if (line.includes('ID') && line.includes('NAME') && line.includes('USERNAME')) {
      foundUserHeader = true
      continue
    }

    // Skip separator lines
    if (line.includes('---+---')) {
      continue
    }

    if (foundUserHeader) {
      // Stop parsing when we hit Tips or other non-table content
      if (line.includes('Tips:') || line.includes('Back:') || line.includes('ID>')) {
        break
      }

      const match = line.match(userRegex)
      if (match) {
        try {
          const user: JumpServerUser = {
            id: parseInt(match[1].trim()),
            name: match[2].trim(),
            username: match[3].trim()
          }
          users.push(user)
        } catch (e) {
          console.error('Failed to parse user line:', line, e)
        }
      }
    }
  }

  return users
}

/**
 * Detect if output contains user selection prompt
 * @param output JumpServer shell output
 * @returns true if user selection is required
 */
export function hasUserSelectionPrompt(output: string): boolean {
  return output.includes('account ID') && output.includes('ID') && output.includes('NAME') && output.includes('USERNAME')
}
