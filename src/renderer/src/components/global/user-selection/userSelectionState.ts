import { ref } from 'vue'

const logger = createRendererLogger('userSelection')

// User selection dialog state
export const showUserSelectionDialog = ref(false)
export const userSelectionError = ref(false)
export const userList = ref<Array<{ id: number; name: string; username: string }>>([])
export const selectedUserId = ref<number | null>(null)
export const currentConnectionId = ref<string | null>(null)
export const userSelectionTimeRemaining = ref(0)
export const isSubmitting = ref(false)

// Constants
const USER_SELECTION_TIMEOUT = 30000 // 30 seconds

let userSelectionTimerInterval: NodeJS.Timeout | null = null

// Start user selection timer
const startUserSelectionTimer = (durationMs = USER_SELECTION_TIMEOUT) => {
  if (userSelectionTimerInterval) {
    clearInterval(userSelectionTimerInterval)
  }
  const endTime = Date.now() + durationMs
  userSelectionTimeRemaining.value = durationMs
  userSelectionTimerInterval = setInterval(() => {
    const remaining = endTime - Date.now()
    if (remaining <= 0) {
      if (userSelectionTimerInterval !== null) {
        clearInterval(userSelectionTimerInterval)
      }
      userSelectionTimeRemaining.value = 0
      showUserSelectionDialog.value = false
      cancelUserSelection()
    } else {
      userSelectionTimeRemaining.value = remaining
    }
  }, 1000)
}

// Reset error state
const resetErrors = () => {
  userSelectionError.value = false
}

// Reset user selection dialog state
export const resetUserSelectionDialog = () => {
  logger.info('Reset user selection dialog state')
  showUserSelectionDialog.value = false
  userSelectionError.value = false
  userList.value = []
  selectedUserId.value = null
  currentConnectionId.value = null
  isSubmitting.value = false
  // Clear timer
  if (userSelectionTimerInterval) {
    clearInterval(userSelectionTimerInterval)
    userSelectionTimerInterval = null
  }
}

// Handle user selection request from main process
export const handleUserSelectionRequest = (data: any) => {
  logger.info('Received user selection request', { id: data.id, userCount: data.users?.length })

  currentConnectionId.value = data.id
  userList.value = data.users || []
  // Automatically select the first user by default
  selectedUserId.value = userList.value.length > 0 ? userList.value[0].id : null
  showUserSelectionDialog.value = true
  resetErrors()
  startUserSelectionTimer()
}

// Handle user selection timeout
export const handleUserSelectionTimeout = (data: any) => {
  if (data.id === currentConnectionId.value && showUserSelectionDialog.value) {
    logger.info('User selection timeout')
    resetUserSelectionDialog()
  }
}

// Handle user selection (row click)
export const handleUserSelect = (userId: number) => {
  logger.info('User selected', { userId })
  selectedUserId.value = userId
  resetErrors()
}

// Submit user selection
export const submitUserSelection = async () => {
  logger.info('Attempting to submit user selection', { selectedUserId: selectedUserId.value })

  // Reset error state
  resetErrors()

  // Validate input
  if (selectedUserId.value === null) {
    logger.debug('No user selected')
    userSelectionError.value = true
    return
  }

  if (!currentConnectionId.value) {
    logger.debug('No current connection ID')
    userSelectionError.value = true
    return
  }

  if (isSubmitting.value) {
    logger.debug('Already submitting, ignoring duplicate request')
    return
  }

  try {
    isSubmitting.value = true
    logger.info('Submitting user selection', { connectionId: currentConnectionId.value, userId: selectedUserId.value })

    const api = (window as any).api
    await api.sendUserSelectionResponse(currentConnectionId.value, selectedUserId.value)

    logger.info('User selection submitted successfully')
    // Close dialog after successful submission
    resetUserSelectionDialog()
  } catch (error) {
    logger.error('Failed to submit user selection', { error: String(error) })
    userSelectionError.value = true
    isSubmitting.value = false
  }
}

// Cancel user selection
export const cancelUserSelection = () => {
  if (currentConnectionId.value) {
    logger.info('Cancelling user selection', { connectionId: currentConnectionId.value })
    const api = (window as any).api
    api.sendUserSelectionCancel(currentConnectionId.value)
    resetUserSelectionDialog()
  }
}
