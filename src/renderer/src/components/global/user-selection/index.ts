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

// Setup global listeners
export const setupGlobalUserSelectionListeners = () => {
  const api = (window as any).api
  if (api) {
    console.log('Setting up global user selection listeners')
    api.onUserSelectionRequest(handleUserSelectionRequest)
    api.onUserSelectionTimeout(handleUserSelectionTimeout)
  }
}

import { handleUserSelectionRequest, handleUserSelectionTimeout } from './userSelectionState'
