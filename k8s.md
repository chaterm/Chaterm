# Chaterm K8S Management Feature - Project Planning Document

## 1. Project Overview

### 1.1 Background

Chaterm is an Electron-based AI-driven terminal tool. This project aims to extend Chaterm with Kubernetes multi-cluster management capabilities, providing users with a unified interface to manage multiple K8S clusters.

### 1.2 Goals

- Build a multi-cluster Kubernetes management client
- Integrate AI-assisted capabilities for cluster operations
- Provide powerful kubectl-integrated command-line tools

### 1.3 Core Features

| Feature | Description |
|---------|-------------|
| Command Line Terminal | kubectl-integrated terminal with multi-tab support and AI assistant |

---

## 2. Feature Specifications

### 2.1 Command Line Terminal

#### 2.1.1 Feature Description

A kubectl-integrated terminal with:

- **Cluster Sidebar**: View, connect, and manage multiple K8S clusters
- **Multi-tab Terminal**: Support multiple terminal sessions per cluster
- **AI Assistant Panel**: Context-aware AI help for kubectl commands
- **kubectl Autocomplete**: Smart command completion

#### 2.1.2 UI Wireframe

```
+--------------------------------------------------------------------------------+
| [Terminal] [Agents]                                          [Layout] [Settings]|
+--------------------------------------------------------------------------------+
|                                                                                 |
| +-- Clusters ---+  +-- Terminal Tabs ------------------+  +-- AI -------------+ |
| |               |  | [prod-api] [staging] [+]          |  | New Chat   + O ..| |
| | [+ Add]       |  +-----------------------------------+  |                  | |
| |               |  |                                   |  | Plan, @ for...   | |
| | CLUSTERS      |  | water_duan, Welcome to Chaterm    |  |                  | |
| | -----------   |  |                                   |  |                  | |
| | [*] prod      |  | > ~ kubectl get node              |  |                  | |
| |   47.239.3.97 |  | NAME        STATUS   ROLES   AGE  |  |                  | |
| |   Connected   |  | node-1      Ready    master  45d  |  |                  | |
| |               |  | node-2      Ready    worker  45d  |  |                  | |
| | [ ] staging   |  | node-3      Ready    worker  45d  |  | [AI]             | |
| |   10.0.1.100  |  |                                   |  | Hello, what do   | |
| |   Disconnected|  | > ~ kubectl get pods -n default   |  | you want to do   | |
| |               |  | NAME            READY   STATUS    |  | in the terminal? | |
| | [ ] dev       |  | api-7dd...      1/1     Running   |  |                  | |
| |   localhost   |  | web-abc...      1/1     Running   |  |                  | |
| |   Disconnected|  |                                   |  |                  | |
| |               |  | > ~ _                             |  +------------------+ |
| |               |  |                                   |  | Context          | |
| |               |  |                                   |  | prod/47.239.3.97 | |
| |               |  |                                   |  |                  | |
| |               |  |                                   |  | Agent            | |
| | [Settings]    |  |                                   |  | claude-sonnet    | |
| +---------------+  +-----------------------------------+  +------------------+ |
|                                                                                 |
+--------------------------------------------------------------------------------+
```

#### 2.1.3 Cluster Sidebar Features

| Feature | Description |
|---------|-------------|
| Cluster List | Display all configured clusters with name, server address, and connection status |
| Add Cluster | Add new cluster via kubeconfig file import or manual configuration |
| Connect/Disconnect | One-click connect or disconnect from clusters |
| Connection Status | Visual indicator (Connected/Disconnected/Error) |
| Quick Actions | Right-click menu for edit, delete, duplicate cluster |
| Active Selection | Radio-button style selection for current active cluster |

#### 2.1.4 Add Cluster Modal

```
+------------------------------------------------------------------+
|                        Add Cluster                            [X] |
+------------------------------------------------------------------+
|                                                                   |
|  +-------------------------------------------------------------+  |
|  | [Import Kubeconfig]              [Manual Configuration]     |  |
|  +-------------------------------------------------------------+  |
|                                                                   |
|  -- Import Kubeconfig Tab --                                      |
|                                                                   |
|  Kubeconfig File                                                  |
|  +---------------------------------------------+ [Browse...]      |
|  | ~/.kube/config                              |                  |
|  +---------------------------------------------+                  |
|                                                                   |
|  Or drag file here / paste content directly                      |
|  +-------------------------------------------------------------+  |
|  |                                                             |  |
|  |     [Drag file here or paste kubeconfig content below]      |  |
|  |                                                             |  |
|  +-------------------------------------------------------------+  |
|  |                                                             |  |
|  | apiVersion: v1                                              |  |
|  | kind: Config                                                |  |
|  | clusters:                                                   |  |
|  | - cluster:                                                  |  |
|  |     server: https://...                                     |  |
|  |   name: my-cluster                                          |  |
|  | ...                                                         |  |
|  |                                                             |  |
|  +-------------------------------------------------------------+  |
|                                                                   |
|  Available Contexts (after file selected):                        |
|  +-------------------------------------------------------------+  |
|  | [ ] kubernetes-admin@production    47.239.3.97              |  |
|  | [x] kubernetes-admin@staging       10.0.1.100               |  |
|  | [ ] minikube                       192.168.49.2             |  |
|  +-------------------------------------------------------------+  |
|                                                                   |
|                                   [Test Connection]    [Add]      |
|                                                                   |
+------------------------------------------------------------------+
```

```
+------------------------------------------------------------------+
|                        Add Cluster                            [X] |
+------------------------------------------------------------------+
|                                                                   |
|  +-------------------------------------------------------------+  |
|  | [Import Kubeconfig]              [Manual Configuration]     |  |
|  +-------------------------------------------------------------+  |
|                                                                   |
|  -- Manual Configuration Tab --                                   |
|                                                                   |
|  Cluster Name *                                                   |
|  +-------------------------------------------------------------+  |
|  | production-cluster                                          |  |
|  +-------------------------------------------------------------+  |
|                                                                   |
|  Server URL *                                                     |
|  +-------------------------------------------------------------+  |
|  | https://47.239.3.97:6443                                    |  |
|  +-------------------------------------------------------------+  |
|                                                                   |
|  Authentication Method                                            |
|  +-------------------------------------------------------------+  |
|  | [v] Certificate                                             |  |
|  +-------------------------------------------------------------+  |
|                                                                   |
|  -- Certificate Auth --                                           |
|                                                                   |
|  CA Certificate                                                   |
|  +------------------------------------------+ [Browse...] [Paste] |
|  | /path/to/ca.crt                          |                     |
|  +------------------------------------------+                     |
|                                                                   |
|  Client Certificate                                               |
|  +------------------------------------------+ [Browse...] [Paste] |
|  | /path/to/client.crt                      |                     |
|  +------------------------------------------+                     |
|                                                                   |
|  Client Key                                                       |
|  +------------------------------------------+ [Browse...] [Paste] |
|  | /path/to/client.key                      |                     |
|  +------------------------------------------+                     |
|                                                                   |
|  [ ] Skip TLS Verification (not recommended)                      |
|                                                                   |
|                                   [Test Connection]    [Add]      |
|                                                                   |
+------------------------------------------------------------------+
```

#### 2.1.5 Cluster Settings Panel

```
+------------------------------------------------------------------+
|                      Cluster Settings                         [X] |
+------------------------------------------------------------------+
|                                                                   |
|  +-- Cluster Info -----------------------------------------+      |
|  |                                                         |      |
|  |  Cluster Name                                           |      |
|  |  +---------------------------------------------------+  |      |
|  |  | production-cluster                                |  |      |
|  |  +---------------------------------------------------+  |      |
|  |                                                         |      |
|  |  Server URL                                             |      |
|  |  +---------------------------------------------------+  |      |
|  |  | https://47.239.3.97:6443                          |  |      |
|  |  +---------------------------------------------------+  |      |
|  |                                                         |      |
|  |  Context Name                                           |      |
|  |  +---------------------------------------------------+  |      |
|  |  | kubernetes-admin@production                       |  |      |
|  |  +---------------------------------------------------+  |      |
|  |                                                         |      |
|  +-----------------------------------------------------+--+      |
|                                                                   |
|  +-- Connection -----------------------------------------+        |
|  |                                                       |        |
|  |  Status:  [*] Connected                               |        |
|  |  Last Connected: 2024-03-18 10:30:45                  |        |
|  |                                                       |        |
|  |  [Disconnect]    [Test Connection]    [Reconnect]     |        |
|  |                                                       |        |
|  +-------------------------------------------------------+        |
|                                                                   |
|  +-- Authentication -------------------------------------+        |
|  |                                                       |        |
|  |  Method: Certificate                                  |        |
|  |                                                       |        |
|  |  CA Certificate:     /path/to/ca.crt      [Change]    |        |
|  |  Client Certificate: /path/to/client.crt  [Change]    |        |
|  |  Client Key:         /path/to/client.key  [Change]    |        |
|  |                                                       |        |
|  |  [ ] Skip TLS Verification                            |        |
|  |                                                       |        |
|  +-------------------------------------------------------+        |
|                                                                   |
|  +-- Terminal Settings ----------------------------------+        |
|  |                                                       |        |
|  |  Default Namespace                                    |        |
|  |  +---------------------------------------------------+|        |
|  |  | default                                       [v] ||        |
|  |  +---------------------------------------------------+|        |
|  |                                                       |        |
|  |  kubectl Path                                         |        |
|  |  +---------------------------------------------------+|        |
|  |  | /usr/local/bin/kubectl                            ||        |
|  |  +---------------------------------------------------+|        |
|  |                                                       |        |
|  |  [ ] Auto-connect on startup                          |        |
|  |  [ ] Show in favorites                                |        |
|  |                                                       |        |
|  +-------------------------------------------------------+        |
|                                                                   |
|  +-- Danger Zone ----------------------------------------+        |
|  |                                                       |        |
|  |  [Delete Cluster]                                     |        |
|  |                                                       |        |
|  +-------------------------------------------------------+        |
|                                                                   |
|                                        [Cancel]    [Save]         |
|                                                                   |
+------------------------------------------------------------------+
```

#### 2.1.6 Authentication Methods

| Method | Description | Required Fields |
|--------|-------------|-----------------|
| Certificate | X.509 client certificate authentication | CA Cert, Client Cert, Client Key |
| Token | Bearer token authentication | Token |
| Username/Password | Basic authentication | Username, Password |
| OIDC | OpenID Connect authentication | OIDC Provider URL, Client ID, Client Secret |
| AWS IAM | AWS EKS IAM authentication | AWS Profile, Cluster ARN |
| GCP | Google Cloud GKE authentication | GCP Project, Cluster Name, Zone |

---

## 3. Technical Architecture

### 3.1 System Architecture

```
+--------------------------------------------------------------------------------+
|                              Renderer Process                                   |
|  +-------------------------------------------------------------------------+   |
|  |                          Vue 3 Application                              |   |
|  |  +------------------------------------------------------------------+   |   |
|  |  |                      K8S Terminal (KubeTerminal)                 |   |   |
|  |  +------------------------------------------------------------------+   |   |
|  |                              |                                          |   |
|  |  +--------------------------------------------------------------+       |   |
|  |  |                    Pinia Stores                              |       |   |
|  |  |         k8sClusterStore | k8sTerminalStore                   |       |   |
|  |  +--------------------------------------------------------------+       |   |
|  +-------------------------------------------------------------------------+   |
|                                    | IPC                                        |
+--------------------------------------------------------------------------------+
                                     |
+--------------------------------------------------------------------------------+
|                              Preload Scripts                                    |
|  +-------------------------------------------------------------------------+   |
|  |  k8sApi: { cluster, terminal }                                          |   |
|  +-------------------------------------------------------------------------+   |
+--------------------------------------------------------------------------------+
                                     |
+--------------------------------------------------------------------------------+
|                               Main Process                                      |
|  +-------------------------------------------------------------------------+   |
|  |                         K8S Module (src/main/k8s)                       |   |
|  |  +---------------------------+  +-----------------------------------+   |   |
|  |  | ClusterManager            |  | TerminalService                   |   |   |
|  |  | - kubeconfig              |  | - kubectl execution               |   |   |
|  |  | - context switch          |  | - command completion              |   |   |
|  |  | - connection management   |  | - session management              |   |   |
|  |  +---------------------------+  +-----------------------------------+   |   |
|  |                              |                                          |   |
|  |  +--------------------------------------------------------------+       |   |
|  |  |                 @kubernetes/client-node                      |       |   |
|  |  +--------------------------------------------------------------+       |   |
|  +-------------------------------------------------------------------------+   |
+--------------------------------------------------------------------------------+
                                     |
                          +---------------------+
                          |   Kubernetes API    |
                          |   (Multiple Clusters)|
                          +---------------------+
```

### 3.2 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| UI Components | Ant Design Vue | Base components |
| Terminal | xterm.js | Terminal emulation |
| K8S Client | @kubernetes/client-node | K8S API communication |
| State | Pinia | State management |
| IPC | Electron IPC | Process communication |

---

## 4. Code Directory Structure

Following Chaterm's existing architecture patterns:

```
src/
├── main/
│   ├── k8s/                              # K8S Main Process Module
│   │   ├── index.ts                      # Module entry, IPC handlers registration
│   │   ├── types.ts                      # Shared type definitions
│   │   │
│   │   ├── cluster/                      # Cluster Management
│   │   │   ├── index.ts                  # Cluster manager entry
│   │   │   ├── manager.ts                # ClusterManager class
│   │   │   ├── kubeconfig.ts             # Kubeconfig parsing and management
│   │   │   └── context.ts                # Context switching logic
│   │   │
│   │   ├── terminal/                     # K8S Terminal Integration
│   │   │   ├── index.ts                  # Terminal service entry
│   │   │   ├── service.ts                # KubeTerminalService class
│   │   │   ├── kubectl.ts                # kubectl command execution
│   │   │   └── completion.ts             # Command auto-completion
│   │   │
│   │   └── utils/                        # Utilities
│   │       ├── api-client.ts             # K8S API client factory
│   │       └── errors.ts                 # Error handling
│   │
│   └── ... (existing modules)
│
├── preload/
│   ├── index.ts                          # Add k8sApi exposure
│   └── index.d.ts                        # Add K8S API type definitions
│
└── renderer/
    └── src/
        ├── views/
        │   └── k8s/                       # K8S Views
        │       ├── index.vue              # K8S module entry/layout
        │       │
        │       └── terminal/              # K8S Terminal Feature
        │           ├── index.vue          # Terminal main view
        │           ├── components/
        │           │   ├── ClusterSidebar.vue     # Cluster list sidebar
        │           │   ├── ClusterItem.vue        # Single cluster item
        │           │   ├── AddClusterModal.vue    # Add cluster dialog
        │           │   ├── ClusterSettings.vue    # Cluster settings panel
        │           │   ├── KubeTerminal.vue       # Terminal component
        │           │   ├── TerminalTabs.vue       # Tab management
        │           │   └── AiAssistant.vue        # AI panel
        │           └── composables/
        │               ├── useClusterList.ts      # Cluster list management
        │               ├── useClusterConfig.ts    # Cluster configuration
        │               ├── useKubectl.ts          # kubectl hook
        │               └── useTerminalSession.ts  # Session management
        │
        ├── store/
        │   └── k8s/                       # K8S Pinia Stores
        │       ├── index.ts               # Store module entry
        │       ├── cluster.ts             # useK8sClusterStore
        │       └── terminal.ts            # useK8sTerminalStore
        │
        ├── api/
        │   └── k8s.ts                     # K8S API calls (IPC wrappers)
        │
        ├── router/
        │   └── routes/
        │       └── k8s.ts                 # K8S route definitions
        │
        └── locales/
            └── lang/
                ├── zh-CN.ts               # Add k8s translations
                ├── zh-TW.ts               # Add k8s translations
                ├── en-US.ts               # Add k8s translations
                ├── ja-JP.ts               # Add k8s translations
                ├── ko-KR.ts               # Add k8s translations
                ├── de-DE.ts               # Add k8s translations
                ├── fr-FR.ts               # Add k8s translations
                ├── it-IT.ts               # Add k8s translations
                ├── pt-PT.ts               # Add k8s translations
                ├── ru-RU.ts               # Add k8s translations
                └── ar-AR.ts               # Add k8s translations
```

---

## 5. Database Schema

### 5.1 New Tables

```sql
-- K8S Cluster configurations
CREATE TABLE k8s_clusters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kubeconfig_path TEXT,
    kubeconfig_content TEXT,  -- Encrypted
    context_name TEXT NOT NULL,
    server_url TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    connection_status TEXT DEFAULT 'disconnected',  -- connected/disconnected/error
    last_connected_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- K8S Terminal sessions
CREATE TABLE k8s_terminal_sessions (
    id TEXT PRIMARY KEY,
    cluster_id TEXT NOT NULL,
    name TEXT,
    last_command TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (cluster_id) REFERENCES k8s_clusters(id)
);
```

### 5.2 Migration File

Location: `src/main/storage/db/migrations/YYYYMMDDHHMMSS_add_k8s_tables.ts`

---

## 6. IPC Channel Definitions

### 6.1 Channel List

```typescript
// src/preload/index.d.ts additions

interface K8sApi {
  // Cluster Management
  cluster: {
    list: () => Promise<K8sCluster[]>
    add: (config: K8sClusterConfig) => Promise<K8sCluster>
    update: (clusterId: string, config: Partial<K8sClusterConfig>) => Promise<K8sCluster>
    remove: (clusterId: string) => Promise<void>
    connect: (clusterId: string) => Promise<void>
    disconnect: (clusterId: string) => Promise<void>
    testConnection: (config: K8sClusterConfig) => Promise<boolean>
    getCurrent: () => Promise<K8sCluster | null>
    importKubeconfig: (filePath: string) => Promise<K8sCluster[]>
  }

  // Terminal
  terminal: {
    create: (clusterId: string) => Promise<string>
    execute: (sessionId: string, command: string) => Promise<CommandResult>
    getCompletions: (partial: string) => Promise<string[]>
    close: (sessionId: string) => Promise<void>
    resize: (sessionId: string, cols: number, rows: number) => Promise<void>
  }
}
```

---

## 7. Implementation Phases

### Phase 1: Foundation (Infrastructure)

- [ ] Set up K8S module directory structure
- [ ] Implement cluster management (kubeconfig, context)
- [ ] Add database migrations
- [ ] Define IPC channels and types
- [ ] Create base Pinia stores
- [ ] Add route configurations

### Phase 2: K8S Terminal

- [ ] Build cluster sidebar component
- [ ] Implement add cluster modal (kubeconfig import + manual config)
- [ ] Add cluster connect/disconnect functionality
- [ ] Implement kubectl execution service
- [ ] Create terminal UI with xterm.js
- [ ] Add command auto-completion
- [ ] Implement multi-tab sessions
- [ ] Connect AI assistant

### Phase 3: Polish and Integration

- [ ] Add all i18n translations (10 languages)
- [ ] Implement error handling and edge cases
- [ ] Add unit and E2E tests
- [ ] Performance optimization
- [ ] Documentation

---

## 8. Dependencies

### 8.1 New npm Packages

```json
{
  "dependencies": {
    "@kubernetes/client-node": "^0.20.0"
  }
}
```

### 8.2 Existing Dependencies to Leverage

- `xterm` / `xterm-addon-*` - Already used for terminal

---

## 9. Security Considerations

1. **Kubeconfig Storage**: Encrypt kubeconfig content in database using existing encryption mechanism
2. **RBAC Awareness**: Respect cluster RBAC, handle 403 errors gracefully
3. **Audit Logging**: Log all destructive operations
4. **Connection Security**: Support TLS verification, client certificates
5. **Kubeconfig Isolation**: Each cluster MUST use its own kubeconfig from the database, never fall back to system default `~/.kube/config`

---

## 10. Kubeconfig Isolation Architecture

### 10.1 Design Principle

Each K8S cluster in Chaterm maintains its own isolated kubeconfig configuration. This ensures:

- Multiple clusters can be managed independently without conflicts
- No accidental access to wrong cluster due to system kubeconfig changes
- Clear separation of credentials per cluster

### 10.2 Storage

When a cluster is added:
- The kubeconfig content is stored in the `k8s_clusters.kubeconfig_content` column
- Alternatively, a file path can be stored in `k8s_clusters.kubeconfig_path`
- At least one of these MUST be provided - the system will NOT fall back to `~/.kube/config`

### 10.3 Usage Flow

```
User adds cluster
       |
       v
+----------------------+
| kubeconfig_content   |  <-- Stored in database
| kubeconfig_path      |  <-- Or file path reference
+----------------------+
       |
       v
On terminal creation:
       |
       v
+----------------------+
| Read from database   |
| Set KUBECONFIG env   |
| Spawn pty with env   |
+----------------------+
       |
       v
kubectl uses cluster's own kubeconfig
```

### 10.4 Error Handling

If no kubeconfig is configured for a cluster:
- Terminal creation will fail with clear error message
- Connection test will fail with clear error message
- Agent operations will fail with clear error message

This prevents silent fallback to potentially wrong cluster configurations.

---

## 11. AI Integration Points

| Feature | AI Capability |
|---------|---------------|
| Terminal | Command suggestions, error explanation, kubectl generation |

---

## 12. Success Metrics

| Metric | Target |
|--------|--------|
| Cluster connection time | < 3s |
| Terminal response time | < 100ms |
| Memory usage per cluster | < 50MB |

---

## 13. References

- [Kubernetes Client Node.js](https://github.com/kubernetes-client/javascript)
- [Kubernetes API Reference](https://kubernetes.io/docs/reference/kubernetes-api/)
- [xterm.js](https://xtermjs.org/)
- [Chaterm Architecture](./CLAUDE.md)
