# JumpServer 连接流程概览

```
┌──────────────────────┐
│      Start Connect   │
└──────────┬───────────┘
           │
           ▼
 ┌────────────────────┐
 │ 缓存存在?           │
 │ (jumpserverConnections.has)│
 └───────┬────────────┘
         │Yes
         ▼
 ┌────────────────────┐
 │ 复用连接并返回     │
 └────────────────────┘
         │No
         ▼
 ┌────────────────────┐
 │ 构建 ConnectConfig │
 │ (host/port/user/   │
 │ 密码或私钥/代理)   │
 └─────────┬──────────┘
           │
           ▼
 ┌────────────────────┐
 │ 建立 ssh2.Client   │
 │ 监听 keyboard-     │
 │ interactive/MFA    │
 └─────────┬──────────┘
           │
           ▼
 ┌────────────────────┐
 │ conn.connect       │
 └─────────┬──────────┘
           │
           ▼
 ┌────────────────────┐
 │ ready?             │
 └──────┬─────────────┘
        │No → 错误/重试
        │
        ▼Yes
 ┌────────────────────┐
 │ 发送“已连到堡垒机” │
 │ 状态，启动 shell    │
 └─────────┬──────────┘
           │
           ▼
 ┌────────────────────┐
 │ shell 数据状态机   │
 │ connectionPhase:    │
 │ connecting/inputIp/ │
 │ inputPassword       │
 └─────────┬──────────┘
           │
           ▼
 ┌────────────────────────────────────┐
 │ connecting                         │
 │ └ 检测 'Opt>' → 写入 targetIp →   │
 │    phase=inputIp                  │
 └─────────┬──────────────────────────┘
           │
           ▼
 ┌────────────────────────────────────┐
 │ inputIp                            │
 │ ├ 若出现 Password 提示 → phase=input│
 │ │ Password → 延迟写入密码          │
 │ └ 若捕获 “Connecting to/Last login/提示符│
 │    等” → handleConnectionSuccess   │
 └─────────┬──────────────────────────┘
           │
           ▼
 ┌────────────────────────────────────┐
 │ inputPassword                      │
 │ ├ 若出现 password auth error 或     │
 │ │ [Host]> → 关闭连接并报错         │
 │ └ 若捕获成功指示 → handleConnection │
 │    Success                         │
 └─────────┬──────────────────────────┘
           │
           ▼
 ┌────────────────────┐
 │ handleConnection   │
 │ Success            │
 │ • 清理 timeout     │
 │ • 记录连接与 stream│
 │ • jumpserverConnectionStatus.set  │
 │ • 发送“已连到目标”状态            │
 │ • resolve({connected})            │
 └─────────┬──────────┘
           │
           ▼
 ┌────────────────────┐
 │ 错误场景            │
 │ • 连接/验证失败     │
 │ • shell close/error │
 │ → 清理 Map 并 reject│
 └────────────────────┘
```

> 该流程图总结了 `src/main/ssh/jumpserverHandle.ts` 与 `src/main/agent/integrations/remote-terminal/jumpserverHandle.ts` 中相同的 JumpServer 建连状态机。两处实现均通过 `handleConnectionSuccess` 统一管理成功后的资源注册与状态通知，确保既兼容免密资产也覆盖需要密码的场景。
