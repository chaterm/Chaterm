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

/**
 * 解析资产信息
 */
function parseAssets(output: string): Asset[] {
  const assets: Asset[] = []
  const lines = output.split('\n')
  const assetRegex = /^\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*$/

  let foundAssetHeader = false

  for (const line of lines) {
    if (line.includes('ID | 名称') || line.includes('-----+--')) {
      foundAssetHeader = true
      continue
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
 * 解析分页信息
 */
function parsePagination(output: string): PaginationInfo {
  const paginationRegex = /页码：\s*(\d+)，每页行数：\d+，总页数：\s*(\d+)/
  const match = output.match(paginationRegex)
  if (match) {
    return {
      currentPage: parseInt(match[1], 10),
      totalPages: parseInt(match[2], 10)
    }
  }
  return { currentPage: 1, totalPages: 1 } // 默认值
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
