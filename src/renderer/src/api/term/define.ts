export interface CommonResponse {
  message: string
  error: string
  data: string
  content: string
  action: string
  contentType: string
}

export interface TermPostData {
  data: string
}

export interface TermQueryParams {
  uuid: string
}
