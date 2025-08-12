# 全量同步定时器 (FullSyncTimerManager)

## 概述

FullSyncTimerManager 是一个专门用于管理定期全量同步的定时器管理器。它解决了当前数据同步架构中的一个重要需求：定期执行全量同步以确保本地数据与服务端完全一致。

## 主要特性

- **定时执行**：支持按小时间隔定期执行全量同步
- **智能双向冲突处理**：
  - 全量同步执行时自动暂停增量同步轮询
  - 增量同步进行时全量同步自动跳过，避免数据竞争
  - 双向互斥确保数据一致性
- **并发保护**：防止多个全量同步同时执行
- **状态监控**：提供详细的执行状态和统计信息
- **错误处理**：优雅处理同步失败，记录错误统计
- **资源管理**：完善的资源清理和生命周期管理

## 架构集成

### 在SyncController中的集成

```typescript
// SyncController构造函数中初始化
this.fullSyncTimer = new FullSyncTimerManager(
    {
        intervalHours: 1,           // 每1小时执行一次
        enableOnStart: false       // 由数据同步开关控制
    },
    // 全量同步回调函数
    async () => {
        await this.performScheduledFullSync();
    }
);

// 启动自动同步时同时启动全量同步定时器
async startAutoSync(): Promise<void> {
    await this.pollingManager.startPolling();     // 启动增量同步轮询
    await this.fullSyncTimer.start();             // 启动全量同步定时器
}

// 停止自动同步时同时停止全量同步定时器  
async stopAutoSync(): Promise<void> {
    await this.fullSyncTimer.stop();              // 停止全量同步定时器
    await this.pollingManager.stopPolling();      // 停止增量同步轮询
}
```

### 与数据同步开关的联动

全量同步定时器与主进程中的数据同步开关完全联动：

- **启用数据同步**：自动启动增量同步轮询和全量同步定时器
- **禁用数据同步**：自动停止增量同步轮询和全量同步定时器
- **用户切换**：为新用户重新启动同步服务

## API接口

### 构造函数

```typescript
constructor(
    config?: Partial<FullSyncTimerConfig>,
    fullSyncCallback?: () => Promise<void>
)
```

### 主要方法

| 方法 | 描述 | 返回值 |
|------|------|--------|
| `start()` | 启动定时器 | `Promise<void>` |
| `stop()` | 停止定时器 | `Promise<void>` |
| `syncNow()` | 立即执行全量同步 | `Promise<boolean>` |
| `getStatus()` | 获取定时器状态 | `FullSyncTimerStatus` |
| `updateInterval(hours)` | 更新定时器间隔 | `void` |
| `setFullSyncCallback(callback)` | 设置同步回调函数 | `void` |
| `destroy()` | 清理资源 | `Promise<void>` |

### 状态接口

```typescript
interface FullSyncTimerStatus {
  isEnabled: boolean;             // 定时器是否启用
  isRunning: boolean;             // 是否正在执行全量同步
  intervalMs: number;             // 定时器间隔（毫秒）
  lastFullSyncTime: Date | null;  // 上次全量同步时间
  nextFullSyncTime: Date | null;  // 下次全量同步时间
  totalFullSyncs: number;         // 总全量同步次数
  successfulFullSyncs: number;    // 成功的全量同步次数
}
```

## IPC接口

主进程提供以下IPC接口供渲染进程调用：

### 获取同步状态（包含全量同步定时器状态）

```typescript
// 渲染进程调用
const result = await window.electron.ipcRenderer.invoke('data-sync:get-user-status');
console.log(result.data.fullSyncTimer); // 全量同步定时器状态
```

### 立即执行全量同步

```typescript
// 渲染进程调用
const result = await window.electron.ipcRenderer.invoke('data-sync:full-sync-now');
console.log('全量同步结果:', result.success);
```

### 更新全量同步间隔

```typescript
// 渲染进程调用
const result = await window.electron.ipcRenderer.invoke('data-sync:update-full-sync-interval', 2); // 2小时
console.log('更新结果:', result.success);
```

## 工作流程

### 1. 定时执行流程

```
定时器触发 → 检查是否有正在进行的同步 → 暂停增量同步轮询 → 执行全量同步 → 恢复增量同步轮询 → 更新统计信息 → 调度下次执行
```

### 2. 手动执行流程

```
用户触发 → 检查并发保护 → 执行全量同步 → 更新统计信息 → 返回执行结果
```

### 3. 资源清理流程

```
停止请求 → 清除定时器 → 等待当前同步完成 → 清理回调函数 → 重置状态
```

## 使用示例

### 基本使用

```typescript
import { FullSyncTimerManager } from './services/FullSyncTimerManager';

// 创建定时器管理器
const fullSyncTimer = new FullSyncTimerManager(
    {
        intervalHours: 1,        // 每小时执行一次
        enableOnStart: false     // 手动启动
    },
    async () => {
        // 执行全量同步逻辑
        await performFullSync();
    }
);

// 启动定时器
await fullSyncTimer.start();

// 获取状态
const status = fullSyncTimer.getStatus();
console.log('定时器状态:', status);

// 手动执行同步
const result = await fullSyncTimer.syncNow();
console.log('手动同步结果:', result);

// 更新间隔
fullSyncTimer.updateInterval(2); // 改为2小时

// 停止定时器
await fullSyncTimer.stop();

// 清理资源
await fullSyncTimer.destroy();
```

### 错误处理

```typescript
const fullSyncTimer = new FullSyncTimerManager(
    { intervalHours: 1 },
    async () => {
        try {
            await performFullSync();
        } catch (error) {
            logger.error('全量同步失败:', error);
            throw error; // 让定时器记录失败统计
        }
    }
);
```

## 配置选项

### 默认配置

```typescript
{
    intervalHours: 1,           // 默认每1小时执行一次
    enableOnStart: false        // 默认不自动启动
}
```

### 推荐配置

- **生产环境**：`intervalHours: 1` (每小时)
- **开发环境**：`intervalHours: 0.1` (6分钟，用于测试)
- **演示环境**：`intervalHours: 0.001` (3.6秒，快速演示)

## 监控和调试

### 日志输出

定时器会输出详细的日志信息：

```
[INFO] 全量同步定时器初始化完成，间隔: 1小时
[INFO] 全量同步定时器已启动，间隔: 1小时，下次执行: 2024-01-01 15:00:00
[INFO] 开始执行定时全量同步...
[INFO] 定时全量同步完成，耗时: 5秒
```

### 状态监控

```typescript
// 定期检查定时器状态
setInterval(() => {
    const status = fullSyncTimer.getStatus();
    console.log(`全量同步统计: ${status.successfulFullSyncs}/${status.totalFullSyncs} 成功`);
    if (status.nextFullSyncTime) {
        console.log(`下次执行: ${status.nextFullSyncTime.toLocaleString()}`);
    }
}, 30000); // 每30秒检查一次
```

## 注意事项

1. **资源管理**：始终在应用关闭前调用 `destroy()` 方法清理资源
2. **并发控制**：定时器内置并发保护，无需外部控制
3. **错误恢复**：同步失败不会停止定时器，会继续按计划执行
4. **时间精度**：定时器使用 `setTimeout`，精度受系统影响
5. **内存使用**：长时间运行时注意监控内存使用情况

## 测试

运行测试：

```bash
npm test -- FullSyncTimerManager.test.ts
```

运行演示：

```bash
npm run demo:full-sync-timer
```

## 故障排除

### 常见问题

1. **定时器不执行**
   - 检查是否调用了 `start()` 方法
   - 检查回调函数是否正确设置
   - 查看日志中是否有错误信息

2. **同步失败率高**
   - 检查网络连接
   - 检查服务端状态
   - 增加错误重试逻辑

3. **内存泄漏**
   - 确保调用 `destroy()` 清理资源
   - 检查回调函数中是否有未清理的资源

### 调试技巧

1. 使用较短的间隔进行测试（如 0.001 小时）
2. 启用详细日志记录
3. 监控定时器状态变化
4. 使用演示脚本验证功能 