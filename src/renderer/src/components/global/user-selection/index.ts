// Export user selection dialog component
export { default as UserSelectionDialog } from './UserSelectionDialog.vue'

// Export state and handlers
export {
  showUserSelectionDialog,
  userSelectionError,
  userList,
  selectedUserId,
  currentConnectionId,
  userSelectionTimeRemaining,
  isSubmitting,
  resetUserSelectionDialog,
  handleUserSelectionRequest,
  handleUserSelectionTimeout,
  handleUserSelect,
  submitUserSelection,
  cancelUserSelection
} from './userSelectionState'



const logger = createRendererLogger('userSelection')

// Setup global listeners
export const setupGlobalUserSelectionListeners = () => {
  const api = (window as any).api
  if (api) {
    logger.info('Setting up global user selection listeners')
    api.onUserSelectionRequest(handleUserSelectionRequest)
    api.onUserSelectionTimeout(handleUserSelectionTimeout)
  }
}

import { handleUserSelectionRequest, handleUserSelectionTimeout } from './userSelectionState'
