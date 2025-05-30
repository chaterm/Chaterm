import { ipcMain } from 'electron';
import { Client } from 'ssh2';

// 存储 SSH 连接
const remoteConnections = new Map<string, Client>();
// 存储 shell 会话流
const remoteShellStreams = new Map();

export async function remoteSshConnect(connectionInfo: any): Promise<{ id?: string; error?: string }> {
  const { host, port, username, password, privateKey, passphrase } = connectionInfo;
  const connectionId = `ssh_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;

  return new Promise((resolve) => {
    const conn = new Client();

    conn.on('ready', () => {
      remoteConnections.set(connectionId, conn);
      console.log(`SSH连接成功: ${connectionId}`);
      resolve({ id: connectionId });
    });

    conn.on('error', (err) => {
      console.error('SSH连接错误:', err.message);
      resolve({ error: err.message });
    });

    const connectConfig: any = {
      host,
      port: port || 22,
      username,
      keepaliveInterval: 10000 // 保持连接活跃
    };

    try {
      if (privateKey) {
        connectConfig.privateKey = privateKey;
        if (passphrase) {
          connectConfig.passphrase = passphrase;
        }
      } else if (password) {
        connectConfig.password = password;
      } else {
        resolve({ error: '缺少密码或私钥' });
        return;
      }

    console.log(`连接配置: ${JSON.stringify(connectConfig)}`);
      conn.connect(connectConfig);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('SSH连接配置错误:', errorMessage);
      resolve({ error: `连接配置错误: ${errorMessage}` });
    }
  });
}

export async function remoteSshExec(sessionId: string, command: string): Promise<{ success?: boolean; output?: string; error?: string }> {
  const conn = remoteConnections.get(sessionId);
  if (!conn) {
    console.error(`SSH连接不存在: ${sessionId}`);
    return { success: false, error: '未连接到远程服务器' };
  }
  

  const command1 = 'ls /home'

  console.log(`执行SSH命令: ${command} (会话: ${sessionId})`);

  return new Promise((resolve) => {
    conn.exec(command1, (err, stream) => {
      if (err) {
        console.error('SSH命令执行错误:', err.message);
        resolve({ success: false, error: err.message });
        return;
      }

      let output = '';

      stream.on('data', (data: Buffer) => { // 添加Buffer类型注解
        output += data.toString();
      });

      stream.stderr.on('data', (data: Buffer) => { // 添加Buffer类型注解
        output += data.toString(); // 也将错误输出添加到结果中
      });

      stream.on('close', (code: number | null) => { // code可以是null
        console.log(`SSH命令完成，退出码: ${code}, 输出长度: ${output.length}`);
        resolve({
          success: code === 0,
          output: output,
          error: code !== 0 ? `命令执行失败，退出码: ${code}` : undefined
        });
      });
    });
  });
}

export async function remoteSshDisconnect(sessionId: string): Promise<{ success?: boolean; error?: string }> {
  const stream = remoteShellStreams.get(sessionId);
  if (stream) {
    stream.end();
    remoteShellStreams.delete(sessionId);
  }

  const conn = remoteConnections.get(sessionId);
  if (conn) {
    conn.end();
    remoteConnections.delete(sessionId);
    console.log(`SSH连接已断开: ${sessionId}`);
    return { success: true };
  }

  console.warn(`尝试断开不存在的SSH连接: ${sessionId}`);
  return { success: false, error: '没有活动的远程连接' };
}


export const registerRemoteTerminalHandlers = () => {
  ipcMain.handle('ssh:remote-connect', async (_event, connectionInfo) => {
    return remoteSshConnect(connectionInfo);
  });

  ipcMain.handle('ssh:remote-exec', async (_event, sessionId, command) => {
    return remoteSshExec(sessionId, command);
  });

  ipcMain.handle('ssh:remote-disconnect', async (_event, sessionId) => {
    return remoteSshDisconnect(sessionId);
  });
}; 