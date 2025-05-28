// 远程终端使用示例
import { ConnectionInfo, RemoteTerminalManager } from './index'
import { testStorageFromMain } from '../../core/storage/state'




// 示例：连接远程服务器并执行命令
export async function executeRemoteCommand() {

  // 注意：testStorageFromMain 需要主窗口初始化才能工作
  // 如果在主进程启动早期调用可能会失败
  try {
    console.log('尝试调用 testStorageFromMain...')
    await testStorageFromMain()
    console.log('testStorageFromMain 调用成功')
  } catch (error) {
    console.error('testStorageFromMain 调用失败:', error)
    console.log('这可能是因为主窗口尚未初始化，这是正常的')
  }
  

  // 使用指定的连接信息
  const connectionInfo: ConnectionInfo = {
    host: '127.0.0.1',
    port: 2222,
    username: 'root',
    password: '', // 如果使用私钥，密码通常为空
    privateKey: `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACDJqVbjzi15L+3tUqdBG02PZ5KNZ+ZgWJ2vh/IxpA3uVAAAAKBCN/ObQjfz
mwAAAAtzc2gtZWQyNTUxOQAAACDJqVbjzi15L+3tUqdBG02PZ5KNZ+ZgWJ2vh/IxpA3uVA
AAAECN0lht9B1lfiIpeM5eNB5LNhJQAEWgpGg9CjThPAjUzcmpVuPOLXkv7e1Sp0EbTY9n
ko1n5mBYna+H8jGkDe5UAAAAGXh1aG9uZ195YW9ASEhOQjIwMjQwMjAwNDMBAgME
-----END OPENSSH PRIVATE KEY-----`, 
    passphrase: ''
  }

  const remoteManager = new RemoteTerminalManager()
  
  try {
    // 设置连接信息
    remoteManager.setConnectionInfo(connectionInfo)
    
    console.log('正在连接到远程服务器...')
    console.log(`主机: ${connectionInfo.host}:${connectionInfo.port}`)
    console.log(`用户名: ${connectionInfo.username}`)
    
    // 创建新的远程终端
    const terminalInfo = await remoteManager.createTerminal()
    
    // 执行一个简单的测试命令
    const command = 'cat  /home/fish/sggfsd.txt'
    console.log(`执行命令: ${command}`)
    
    console.log('调用 runCommand...')
    const process = remoteManager.runCommand(terminalInfo, command)
    console.log('runCommand 返回，开始注册事件监听器...')
    
    let output = ''
    
    // 立即注册所有事件监听器（在await之前）
    console.log('注册 line 事件监听器')


    process.on('line', (line) => {
      output += line + '\n'
      console.log('收到输出行:', line)
    })
    
    process.on('completed', () => {
      terminalInfo.busy = false
      console.log('🎉🎉🎉 用户自定义的completed事件监听器被触发了！🎉🎉🎉')
    })
    process.on('error', (error) => {
      console.error('命令执行出错:', error)
    })
    
    // 现在等待命令完成
    console.log('所有事件监听器已注册，等待命令执行完成...')
    await process
    
    // 清理连接
    await remoteManager.disposeAll()
    console.log('远程连接已关闭')
    
    return output
    
  } catch (error) {
    console.error('远程终端操作失败:', error)
    
    // 输出更详细的错误信息
    if (error instanceof Error) {
      console.error('错误详情:')
      console.error('- 消息:', error.message)
      console.error('- 堆栈:', error.stack)
    }
    
    throw error
  }
}

// 默认导出主要示例函数
export default executeRemoteCommand 