import { describe, it, expect, afterEach } from '@jest/globals';
import {
    remoteWsConnect,
    remoteWsExec,
    remoteWsDisconnect,
    __testExports // Keep this if you need to access wsConnections directly later
  } from './ws';
  import WebSocket from 'ws';
  import CryptoJS from 'crypto-js'
  import { v4 as uuidv4 } from 'uuid'
  
  const WS_URL = 'ws://demo.chaterm.ai/v1/term-api/ws?&uuid=Z0aNmyAXhwqtykCs4Rf2jamha0zgo6F%2Fx93ajYIRNJfHlr4He25Wz8F1wJzLud9gZUJFMhhKkS0knivzyy8XKJzcHaVj3Z09nEQdoPeJ3v9lMwmnPWLpnmgxwrNwJvP9ecZAz4Rw1AlSQT7Ou9CRmG4CX9yvCGkn614m%2Bd6BXht2HP1pN88bAnEz4yUR87RruzDLHmAQwtTvuszZfNwGiOfv12etJUjkhsiDRX2eji0%3D';
  




  export function encrypt(authData) {
    const keyStr = 'CtmKeyNY@D96^qza'
    const ivStr = keyStr
    const key = CryptoJS.enc.Utf8.parse(keyStr)
    const iv = CryptoJS.enc.Utf8.parse(ivStr)
    const srcs = CryptoJS.enc.Utf8.parse(JSON.stringify(authData))
    const encrypted = CryptoJS.AES.encrypt(srcs, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    })
    return encodeURIComponent(encrypted.toString())
  }
  
  describe('remote terminal ws', () => {
    let wsId: string | undefined;
  
    afterEach(async () => {
        if (wsId) {
            console.log(`Cleaning up connection ${wsId}`);
            await remoteWsDisconnect(wsId);
            console.log(`Cleanup complete for connection ${wsId}`);
            wsId = undefined;
        }
    });
    const dynamicTerminalId = `test@172.31.64.249:remote:${uuidv4()}`
    const authData = {
        email: 'test@gmail.com',
        ip: '172.31.64.249',
        organizationId: 'firm-0001',
        terminalId: dynamicTerminalId,
        uid: 2000001
    }
  
    it('连接成功后执行命令ls /home并检查输出', async () => {
      console.log('Starting test: connect, exec, disconnect');
  
        // 1. 连接
      console.log('[ws.test.ts] 准备加密的 authData:', authData);
        const auth = encrypt(authData)
        console.log('[ws.test.ts] 加密后的 auth:', auth);
        const wsUrl = 'ws://demo.chaterm.ai/v1/term-api/ws?&uuid=' + auth // 后端WebSocket地址
        const connectRes = await remoteWsConnect({ wsUrl: wsUrl, terminalId: dynamicTerminalId });
  
        if ('error' in connectRes) {
            console.error('Connection failed:', connectRes.error);
            throw new Error(connectRes.error);
        }
        
        wsId = connectRes.id;
        expect(wsId).toBeDefined();
        console.log(`Successfully connected with id: ${wsId}.`);
  
        // 等待一段时间，让会话稳定
        console.log('Waiting for session to stabilize...');
        await new Promise(resolve => setTimeout(resolve, 2000));
  
        // 2. 执行命令
        console.log('Executing command: ls /home');
        const execRes = await remoteWsExec(wsId!, 'ls /home');
        console.log('Exec result:', execRes);
  
        // 3. 验证结果
        expect(execRes.success).toBe(true);
        expect(execRes.error).toBeUndefined();
        console.log('ls /home 输出:', execRes.output || '无输出');
        
        // 我们断言输出是一个字符串
        expect(typeof execRes.output).toBe('string');
  
      console.log('Test finished, cleanup will happen in afterEach.');
    }, 30000);
  });