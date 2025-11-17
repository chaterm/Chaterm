# JumpServer Exec 功能实现文档

> 本文档详细说明 JumpServer 堡垒机环境下的命令执行 (exec) 实现逻辑，用于后续维护和调整参考。

## 目录

- [背景与挑战](#背景与挑战)
- [核心架构](#核心架构)
- [模块说明](#模块说明)
- [实现流程](#实现流程)
- [关键技术点](#关键技术点)
- [故障排查](#故障排查)
- [扩展指南](#扩展指南)

---

## 背景与挑战

### 为什么需要特殊的 Exec 实现？

**标准 SSH 连接：**

```typescript
// 标准 SSH 可以直接使用 conn.exec()
conn.exec('ls /usr/bin', (err, stream) => {
  stream.on('data', (data) => console.log(data))
  stream.on('close', (code) => console.log('Exit code:', code))
})
```

**JumpServer 堡垒机：**

```
用户 → SSH 连接 → JumpServer → 选择用户 → 输入密码 → 目标服务器
     (ssh2)      (交互式菜单)                              (shell 流)
```

**核心问题：**

1. JumpServer 连接没有直接的 `conn.exec()` 能力
2. 所有交互必须通过 **交互式 shell 流** 完成
3. 命令输出混杂回显、提示符、控制字符
4. 无法直接获取命令退出码

---

## 核心架构

### 整体设计图

```
┌─────────────────────────────────────────────────────────────┐
│                    Renderer Process (前端)                   │
│  - 调用: window.api.sshConnExec({ id, cmd })               │
└────────────────────────────┬────────────────────────────────┘
                             │ IPC
┌────────────────────────────┴────────────────────────────────┐
│                    Preload (桥接层)                          │
│  - 转发: ipcRenderer.invoke('ssh:conn:exec', { id, cmd })  │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────┐
│                Main Process (主进程 - sshHandle.ts)          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ IPC Handler: ipcMain.handle('ssh:conn:exec')        │  │
│  │  ↓                                                    │  │
│  │  if (jumpserverShellStreams.has(id)) {              │  │
│  │    return executeCommandOnJumpServerAsset(id, cmd)  │  │
│  │  } else {                                            │  │
│  │    return conn.exec(cmd)  // 标准 SSH               │  │
│  │  }                                                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                             ↓                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ executeCommandOnJumpServerAsset()                    │  │
│  │  1. 获取或创建 exec 流                               │  │
│  │  2. 生成唯一标记 (marker)                           │  │
│  │  3. 发送命令 + 标记                                  │  │
│  │  4. 监听输出，检测标记                               │  │
│  │  5. 清理输出，提取退出码                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                             ↓                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ createJumpServerExecStream(connectionId)             │  │
│  │  - 检查缓存 (jumpserverExecStreams)                 │  │
│  │  - 检查创建中 Promise (防止竞态)                    │  │
│  │  - 创建新 shell 流                                   │  │
│  │  - 自动导航到目标资产                               │  │
│  │  - 缓存流对象                                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                             ↓                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ navigateToJumpServerAsset()                          │  │
│  │  - 状态机: connecting → inputIp → selectUser →      │  │
│  │            inputPassword → connected                 │  │
│  │  - 复刻主连接的导航路径 (navigationPath)            │  │
│  │  - 自动输入 IP/用户/密码                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              Utility Modules (工具模块)                      │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │ executor.ts          │  │ navigator.ts         │        │
│  │ - OutputParser       │  │ - hasPasswordPrompt  │        │
│  │ - cleanCommandOutput │  │ - hasPasswordError   │        │
│  │ - extractExitCode    │  │ - detectConnection   │        │
│  │ - generateMarkers    │  │                      │        │
│  └──────────────────────┘  └──────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```
