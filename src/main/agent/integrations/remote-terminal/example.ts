//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

// Remote terminal usage example
import { ConnectionInfo, RemoteTerminalManager } from './index'
import { testStorageFromMain } from '../../core/storage/state'
import { createLogger } from '@logging'

const logger = createLogger('remote-terminal.example')

// Example: Connect to a remote server and execute commands
export async function executeRemoteCommand() {
  // Note: testStorageFromMain requires the main window to be initialized to work
  // It may fail if called early in the main process startup
  try {
    logger.info('Attempting to call testStorageFromMain...')
    await testStorageFromMain()
    logger.info('testStorageFromMain call successful')
  } catch (error) {
    logger.error('testStorageFromMain call failed', { error: error instanceof Error ? error.message : String(error) })
    logger.info('This may be because the main window has not been initialized, which is normal')
  }

  const connectionInfo: ConnectionInfo = {
    host: '127.0.0.1',
    port: 22,
    username: '',
    password: '',
    privateKey: ``,
    passphrase: '',
    needProxy: false
  }
  logger.debug('Connection info', { data: connectionInfo })

  const cwd = '/home'
  const remoteManager = new RemoteTerminalManager()

  try {
    // Set connection information
    remoteManager.setConnectionInfo(connectionInfo)

    logger.info('Connecting to remote server...')
    logger.info(`Host: ${connectionInfo.host}:${connectionInfo.port}`)
    logger.info(`Username: ${connectionInfo.username}`)

    // Create new remote terminal
    const terminalInfo = await remoteManager.createTerminal()

    // Execute a simple test command
    const command = 'ls /home'
    logger.info(`Executing command: ${command}`)

    logger.debug('Calling runCommand...')

    const process = remoteManager.runCommand(terminalInfo, command, cwd)
    logger.debug('runCommand returned, starting to register event listeners...')

    let output = ''

    // Register all event listeners immediately (before await)
    logger.debug('Registering line event listener')

    process.on('line', (line) => {
      output += line + '\n'
      logger.debug('Received output line', { data: line })
    })

    process.on('completed', () => {
      terminalInfo.busy = false
      logger.info('User-defined completed event listener triggered')
    })
    process.on('error', (error) => {
      logger.error('Command execution error', { error: error instanceof Error ? error.message : String(error) })
    })

    // Now wait for the command to complete
    logger.info('All event listeners registered, waiting for command execution to complete...')
    await process

    // Clean up connection
    await remoteManager.disposeAll()
    logger.info('Remote connection closed')

    return output
  } catch (error) {
    logger.error('Remote terminal operation failed', { error: error instanceof Error ? error.message : String(error) })

    // Output more detailed error information
    if (error instanceof Error) {
      logger.error('Error details', { data: { message: error.message, stack: error.stack } })
    }

    throw error
  }
}

// Default export of the main example function
export default executeRemoteCommand
