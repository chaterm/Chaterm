# JumpServer Exec Implementation Documentation

> This document details the command execution (exec) implementation logic in the JumpServer bastion host environment, for future maintenance and adjustment reference.

## Table of Contents

- [Background and Challenges](#background-and-challenges)
- [Core Architecture](#core-architecture)
- [Module Description](#module-description)
- [Implementation Flow](#implementation-flow)
- [Key Technical Points](#key-technical-points)
- [Troubleshooting](#troubleshooting)
- [Extension Guide](#extension-guide)

---

## Background and Challenges

### Why is a Special Exec Implementation Needed?

**Standard SSH Connection:**

```typescript
// Standard SSH can directly use conn.exec()
conn.exec('ls /usr/bin', (err, stream) => {
  stream.on('data', (data) => console.log(data))
  stream.on('close', (code) => console.log('Exit code:', code))
})
```

**JumpServer Bastion Host:**

```
User → SSH Connection → JumpServer → Select User → Enter Password → Target Server
     (ssh2)            (Interactive Menu)                          (Shell Stream)
```

**Core Issues:**

1. JumpServer connections do not have direct `conn.exec()` capability
2. All interactions must be completed through **interactive shell streams**
3. Command output is mixed with echo, prompts, and control characters
4. Cannot directly obtain command exit codes

---

## Core Architecture

### Overall Design Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Renderer Process (Frontend)               │
│  - Call: window.api.sshConnExec({ id, cmd })               │
└────────────────────────────┬────────────────────────────────┘
                             │ IPC
┌────────────────────────────┴────────────────────────────────┐
│                    Preload (Bridge Layer)                    │
│  - Forward: ipcRenderer.invoke('ssh:conn:exec', { id, cmd }) │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────┐
│                Main Process (sshHandle.ts)                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ IPC Handler: ipcMain.handle('ssh:conn:exec')        │  │
│  │  ↓                                                    │  │
│  │  if (jumpserverShellStreams.has(id)) {              │  │
│  │    return executeCommandOnJumpServerAsset(id, cmd)  │  │
│  │  } else {                                            │  │
│  │    return conn.exec(cmd)  // Standard SSH           │  │
│  │  }                                                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                             ↓                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ executeCommandOnJumpServerAsset()                    │  │
│  │  1. Get or create exec stream                       │  │
│  │  2. Generate unique marker                          │  │
│  │  3. Send command + marker                           │  │
│  │  4. Listen for output, detect marker                │  │
│  │  5. Clean output, extract exit code                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                             ↓                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ createJumpServerExecStream(connectionId)             │  │
│  │  - Check cache (jumpserverExecStreams)               │  │
│  │  - Check creation Promise (prevent race condition) │  │
│  │  - Create new shell stream                          │  │
│  │  - Auto-navigate to target asset                    │  │
│  │  - Cache stream object                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                             ↓                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ navigateToJumpServerAsset()                         │  │
│  │  - State machine: connecting → inputIp → selectUser │  │
│  │            → inputPassword → connected              │  │
│  │  - Replicate main connection navigation path        │  │
│  │    (navigationPath)                                 │  │
│  │  - Auto-input IP/user/password                      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              Utility Modules                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │ executor.ts          │  │ navigator.ts          │        │
│  │ - OutputParser       │  │ - hasPasswordPrompt   │        │
│  │ - cleanCommandOutput │  │ - hasPasswordError    │        │
│  │ - extractExitCode    │  │ - detectConnection    │        │
│  │ - generateMarkers    │  │                       │        │
│  └──────────────────────┘  └──────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```
