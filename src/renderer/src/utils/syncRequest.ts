import { getSyncServerUrl } from '@/utils/edition'
import { createAuthedRequest } from '@/utils/request'

const syncRequest = createAuthedRequest(`${getSyncServerUrl()}/v1`)

export default syncRequest
