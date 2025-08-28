// Remote terminal usage example
import { ConnectionInfo, RemoteTerminalManager } from './index'
import { testStorageFromMain } from '../../core/storage/state'

// Example: Connect to a remote server and execute commands
export async function executeRemoteCommand() {
  // Note: testStorageFromMain requires the main window to be initialized to work
  // It may fail if called early in the main process startup
  try {
    console.log('Attempting to call testStorageFromMain...')
    await testStorageFromMain()
    console.log('testStorageFromMain call successful')
  } catch (error) {
    console.error('testStorageFromMain call failed:', error)
    console.log('This may be because the main window has not been initialized, which is normal')
  }

  const connectionInfo: ConnectionInfo = {
    host: '127.0.0.1',
    port: 22,
    username: '',
    password: '',
    privateKey: ``,
    passphrase: ''
  }

  const cwd = '/home'
  const remoteManager = new RemoteTerminalManager()

  try {
    // Set connection information
    remoteManager.setConnectionInfo(connectionInfo)

    console.log('Connecting to remote server...')
    console.log(`Host: ${connectionInfo.host}:${connectionInfo.port}`)
    console.log(`Username: ${connectionInfo.username}`)

    // Create new remote terminal
    const terminalInfo = await remoteManager.createTerminal()

    // Execute a simple test command
    const command = 'ls /home'
    console.log(`Executing command: ${command}`)

    console.log('Calling runCommand...')

    const process = remoteManager.runCommand(terminalInfo, command, cwd)
    console.log('runCommand returned, starting to register event listeners...')

    let output = ''

    // Register all event listeners immediately (before await)
    console.log('Registering line event listener')

    process.on('line', (line) => {
      output += line + '\n'
      console.log('Received output line:', line)
    })

    process.on('completed', () => {
      terminalInfo.busy = false
      console.log('🎉🎉🎉 User-defined completed event listener triggered! 🎉🎉🎉')
    })
    process.on('error', (error) => {
      console.error('Command execution error:', error)
    })

    // Now wait for the command to complete
    console.log('All event listeners registered, waiting for command execution to complete...')
    await process

    // Clean up connection
    await remoteManager.disposeAll()
    console.log('Remote connection closed')

    return output
  } catch (error) {
    console.error('Remote terminal operation failed:', error)

    // Output more detailed error information
    if (error instanceof Error) {
      console.error('Error details:')
      console.error('- Message:', error.message)
      console.error('- Stack:', error.stack)
    }

    throw error
  }
}

// Default export of the main example function
export default executeRemoteCommand
