import { useDeviceStore } from '@/store/useDeviceStore'

export interface LoginLogData {
  username?: string
  email?: string
  ip_address?: string
  mac_address?: string
  login_method?: string
  status?: string
  user_agent?: string
  platform?: string
}

/**
 * Record user login log
 * @param userInfo User information
 * @param method Login method
 * @param status Login status
 */
export async function recordLoginLog(userInfo: any, method: string, status: 'success' | 'failed' = 'success'): Promise<void> {
  try {
    const api = window.api as any
    const deviceStore = useDeviceStore()

    // Get platform information
    const platform = await api.getPlatform()

    // Get user agent
    const userAgent = navigator.userAgent

    // Get device information
    let ipAddress = deviceStore.getDeviceIp
    let macAddress = deviceStore.getMacAddress

    // If device information is not available in store, try to fetch again
    if (ipAddress === 'Unknown' || !ipAddress) {
      try {
        ipAddress = await api.getLocalIP()
        deviceStore.setDeviceIp(ipAddress)
      } catch (error) {
        console.warn('Unable to get IP address:', error)
        ipAddress = 'Unknown'
      }
    }

    if (macAddress === 'Unknown' || !macAddress) {
      try {
        macAddress = await api.getMacAddress()
        deviceStore.setMacAddress(macAddress)
      } catch (error) {
        console.warn('Unable to get MAC address:', error)
        macAddress = 'Unknown'
      }
    }

    const loginData: LoginLogData = {
      username: userInfo?.name || userInfo?.displayName || '',
      email: userInfo?.email || '',
      ip_address: ipAddress,
      mac_address: macAddress,
      login_method: method,
      status: status,
      user_agent: userAgent,
      platform: platform
    }

    console.log('Recording login log:', loginData)

    const result = await api.insertLoginLog(loginData)
    if (result.success) {
      console.log('Login log recorded successfully')
    } else {
      console.error('Failed to record login log:', result.error)
    }
  } catch (error) {
    console.error('Error occurred while recording login log:', error)
  }
}

/**
 * Get login logs list
 * @param params Query parameters
 * @returns Login logs list
 */
export async function getLoginLogs(
  params: {
    limit?: number
    offset?: number
    email?: string
    startDate?: string
    endDate?: string
  } = {}
): Promise<any> {
  try {
    const api = window.api as any
    const result = await api.getLoginLogs(params)
    return result
  } catch (error) {
    console.error('Error occurred while getting login logs:', error)
    return { success: false, error: (error as Error).message }
  }
}
