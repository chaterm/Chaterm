export interface BatchDeleteAssetsResult {
  data: {
    message: 'success' | 'failed'
    changes: number
    requested: number
    error?: string
  }
}
