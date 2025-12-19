# JumpServer Connection Flow Overview

```
┌──────────────────────┐
│      Start Connect   │
└──────────┬───────────┘
           │
           ▼
 ┌────────────────────┐
 │ Cache exists?       │
 │ (jumpserverConnections.has)│
 └───────┬────────────┘
         │Yes
         ▼
 ┌────────────────────┐
 │ Reuse connection   │
 │ and return         │
 └────────────────────┘
         │No
         ▼
 ┌────────────────────┐
 │ Build ConnectConfig│
 │ (host/port/user/   │
 │ password or private│
 │ key/proxy)         │
 └─────────┬──────────┘
           │
           ▼
 ┌────────────────────┐
 │ Create ssh2.Client │
 │ Listen for keyboard│
 │ -interactive/MFA   │
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
        │No → error/retry
        │
        ▼Yes
 ┌────────────────────┐
 │ Send "connected to │
 │ bastion" status,   │
 │ start shell        │
 └─────────┬──────────┘
           │
           ▼
 ┌────────────────────┐
 │ Shell data state   │
 │ machine            │
 │ connectionPhase:   │
 │ connecting/inputIp/ │
 │ inputPassword      │
 └─────────┬──────────┘
           │
           ▼
 ┌────────────────────────────────────┐
 │ connecting                         │
 │ └ Detect 'Opt>' → write targetIp →│
 │    phase=inputIp                  │
 └─────────┬──────────────────────────┘
           │
           ▼
 ┌────────────────────────────────────┐
 │ inputIp                            │
 │ ├ If Password prompt appears →     │
 │ │   phase=inputPassword → delay   │
 │ │   writing password               │
 │ └ If "Connecting to/Last login/    │
 │    prompt" captured →              │
 │    handleConnectionSuccess         │
 └─────────┬──────────────────────────┘
           │
           ▼
 ┌────────────────────────────────────┐
 │ inputPassword                      │
 │ ├ If password auth error or       │
 │ │ [Host]> appears → close         │
 │ │ connection and report error     │
 │ └ If success indicator captured → │
 │    handleConnectionSuccess         │
 └─────────┬──────────────────────────┘
           │
           ▼
 ┌────────────────────┐
 │ handleConnection   │
 │ Success            │
 │ • Clear timeout    │
 │ • Record connection│
 │   and stream       │
 │ • jumpserverConnectionStatus.set  │
 │ • Send "connected  │
 │   to target" status│
 │ • resolve({connected})            │
 └─────────┬──────────┘
           │
           ▼
 ┌────────────────────┐
 │ Error scenarios    │
 │ • Connection/      │
 │   authentication   │
 │   failure          │
 │ • shell close/error│
 │ → Clear Map and    │
 │   reject           │
 └────────────────────┘
```

> This flowchart summarizes the same JumpServer connection state machine in `src/main/ssh/jumpserverHandle.ts` and `src/main/agent/integrations/remote-terminal/jumpserverHandle.ts`. Both implementations use `handleConnectionSuccess` to uniformly manage resource registration and status notifications after success, ensuring compatibility with both passwordless assets and scenarios requiring passwords.
