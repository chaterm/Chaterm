<template>
  <div class="mcp-container">
    <a-card
      :bordered="false"
      class="mcp-toolbar-card"
    >
      <div class="mcp-toolbar">
        <div class="toolbar-info">
          <div class="toolbar-title">MCP Servers</div>
          <div class="toolbar-description">{{ $t('mcp.description') }}</div>
        </div>
        <a-button
          type="primary"
          @click="openConfigInEditor"
        >
          <PlusOutlined />
          {{ $t('mcp.addServer') }}
        </a-button>
      </div>
    </a-card>

    <div class="server-list">
      <a-empty
        v-if="displayServers.length === 0"
        :description="$t('mcp.noServers')"
      />

      <a-card
        v-for="server in displayServers"
        :key="server.name"
        class="server-card"
        :class="{ 'server-card-loading': loadingServers.has(server.name) }"
        :bordered="false"
      >
        <a-collapse
          :bordered="false"
          class="server-collapse"
        >
          <a-collapse-panel
            :key="server.name"
            class="server-panel"
          >
            <template #header>
              <div class="server-header">
                <div class="server-title">
                  <span class="server-name">{{ server.name }}</span>
                </div>
                <div
                  class="server-actions"
                  @click.stop
                >
                  <a-badge
                    :status="getStatusBadge(server.status)"
                    class="status-badge"
                  />
                  <a-button
                    size="small"
                    type="text"
                    :disabled="loadingServers.has(server.name)"
                    @click="openConfigInEditor"
                  >
                    <EditOutlined />
                  </a-button>
                  <a-button
                    size="small"
                    type="text"
                    danger
                    :disabled="loadingServers.has(server.name)"
                    @click="confirmDeleteServer(server.name)"
                  >
                    <DeleteOutlined />
                  </a-button>
                  <a-switch
                    :checked="!server.disabled"
                    :loading="loadingServers.has(server.name)"
                    :disabled="loadingServers.has(server.name)"
                    size="small"
                    @change="(checked) => toggleServerDisabled(server.name, !checked)"
                  />
                </div>
              </div>
            </template>

            <div class="server-content">
              <div
                v-if="server.error"
                class="server-error"
              >
                <ExclamationCircleOutlined />
                <span>{{ server.error }}</span>
              </div>

              <a-tabs
                class="server-tabs"
                default-active-key="tools"
              >
                <a-tab-pane
                  key="tools"
                  :tab="`Tools (${server.tools?.length || 0})`"
                >
                  <div
                    v-if="server.tools && server.tools.length > 0"
                    class="section-content"
                  >
                    <div
                      v-for="tool in server.tools"
                      :key="tool.name"
                      class="tool-item"
                      :class="{ 'tool-item-disabled': !isToolEnabled(server.name, tool.name) }"
                    >
                      <div class="tool-header">
                        <span class="tool-icon">🔧</span>
                        <span
                          class="tool-name"
                          @click="toggleToolState(server.name, tool.name)"
                          >{{ tool.name }}</span
                        >
                        <a-badge
                          :status="isToolEnabled(server.name, tool.name) ? 'success' : 'default'"
                          class="tool-state-badge"
                        />
                      </div>
                      <div
                        v-if="tool.description"
                        class="tool-description"
                      >
                        {{ tool.description }}
                      </div>
                      <a-collapse
                        v-if="tool.inputSchema && tool.inputSchema.properties"
                        :bordered="false"
                        class="tool-parameters-collapse"
                      >
                        <a-collapse-panel
                          key="parameters"
                          class="parameters-panel"
                        >
                          <template #header>
                            <div class="parameters-header">PARAMETERS ({{ Object.keys(tool.inputSchema.properties).length }})</div>
                          </template>
                          <div class="tool-parameters">
                            <div
                              v-for="(prop, key) in tool.inputSchema.properties"
                              :key="key"
                              class="parameter-item"
                            >
                              <div class="parameter-name">
                                {{ key
                                }}<span
                                  v-if="tool.inputSchema.required && tool.inputSchema.required.includes(key)"
                                  class="required-marker"
                                  >*</span
                                >
                              </div>
                              <div class="parameter-description">{{ prop.description || 'No description' }}</div>
                            </div>
                          </div>
                        </a-collapse-panel>
                      </a-collapse>
                    </div>
                  </div>
                  <div
                    v-else
                    class="empty-state"
                  >
                    {{ $t('mcp.noTools') }}
                  </div>
                </a-tab-pane>

                <a-tab-pane
                  key="resources"
                  :tab="`Resources (${server.resources?.length || 0})`"
                >
                  <div
                    v-if="server.resources && server.resources.length > 0"
                    class="section-content"
                  >
                    <div
                      v-for="resource in server.resources"
                      :key="resource.uri"
                      class="resource-item"
                    >
                      <div class="resource-header">
                        <span class="resource-icon">📄</span>
                        <span class="resource-name">{{ resource.name }}</span>
                      </div>
                      <div
                        v-if="resource.description"
                        class="resource-description"
                      >
                        {{ resource.description }}
                      </div>
                      <div
                        v-if="resource.uri"
                        class="resource-uri"
                      >
                        <span class="uri-label">URI:</span>
                        <span class="uri-value">{{ resource.uri }}</span>
                      </div>
                    </div>
                  </div>
                  <div
                    v-else
                    class="empty-state"
                  >
                    {{ $t('mcp.noResources') }}
                  </div>
                </a-tab-pane>
              </a-tabs>
            </div>
          </a-collapse-panel>
        </a-collapse>
      </a-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Modal, notification } from 'ant-design-vue'
import { mcpConfigService } from '@/services/mcpService'
import { useI18n } from 'vue-i18n'
import eventBus from '@/utils/eventBus'
import { EditOutlined, PlusOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue'
import type { McpServer } from '@shared/mcp'

const { t } = useI18n()

const servers = ref<McpServer[]>([])

// Track optimistic updates for immediate UI feedback
const optimisticUpdates = ref<Map<string, Partial<McpServer>>>(new Map())

// Track loading states per server
const loadingServers = ref<Set<string>>(new Set())

// Track tool enabled/disabled states
// Key format: "serverName:toolName", Value: true (enabled) / false (disabled)
const toolStates = ref<Record<string, boolean>>({})

// Computed property that merges optimistic updates with server state
const displayServers = computed(() => {
  return servers.value.map((server) => {
    const optimisticUpdate = optimisticUpdates.value.get(server.name)
    if (optimisticUpdate) {
      return { ...server, ...optimisticUpdate }
    }
    return server
  })
})

// Open configuration file in editor
const openConfigInEditor = () => {
  // Emit event to open MCP config editor tab
  eventBus.emit('open-user-tab', 'mcpConfigEditor')
}

// Get status badge color
const getStatusBadge = (status: string) => {
  switch (status) {
    case 'connected':
      return 'success'
    case 'connecting':
      return 'processing'
    case 'disconnected':
      return 'error'
    default:
      return 'default'
  }
}

// Get tool state key
const getToolStateKey = (serverName: string, toolName: string): string => {
  return `${serverName}:${toolName}`
}

// Check if tool is enabled (default to true if not in state)
const isToolEnabled = (serverName: string, toolName: string): boolean => {
  const key = getToolStateKey(serverName, toolName)
  return toolStates.value[key] !== false // Default to enabled
}

// Toggle tool enabled/disabled state
const toggleToolState = async (serverName: string, toolName: string) => {
  const key = getToolStateKey(serverName, toolName)
  const currentState = isToolEnabled(serverName, toolName)
  const newState = !currentState

  // Optimistic update
  toolStates.value[key] = newState

  try {
    await window.api.setMcpToolState(serverName, toolName, newState)
  } catch (error) {
    // Rollback on error
    toolStates.value[key] = currentState
    console.error('Failed to toggle tool state:', error)
  }
}

const toggleServerDisabled = async (name: string, disabled: boolean) => {
  optimisticUpdates.value.set(name, { disabled })

  loadingServers.value.add(name)

  try {
    await mcpConfigService.toggleServerDisabled(name, disabled)

    optimisticUpdates.value.delete(name)
  } catch (error) {
    console.error('Failed to toggle server:', error)

    optimisticUpdates.value.delete(name)

    notification.error({
      message: t('mcp.error'),
      description: error instanceof Error ? error.message : String(error)
    })
  } finally {
    // Remove from loading state
    loadingServers.value.delete(name)
  }
}

// Confirm delete server
const confirmDeleteServer = (name: string) => {
  Modal.confirm({
    title: t('mcp.confirmDelete'),
    content: t('mcp.deleteServerConfirm', { name }),
    onOk: () => deleteServer(name)
  })
}

// Delete server
const deleteServer = async (name: string) => {
  try {
    await mcpConfigService.deleteServer(name)
    notification.success({
      message: t('mcp.deleteSuccess')
    })
  } catch (error) {
    console.error('Failed to delete server:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    notification.error({
      message: t('mcp.error'),
      description: errorMessage
    })
  }
}

// Listen for MCP status updates
let removeStatusListener: (() => void) | undefined
let removeServerListener: (() => void) | undefined

onMounted(async () => {
  console.log('Mounting MCP component')
  // Set up listener for full status updates (all servers)
  if (window.api && window.api.onMcpStatusUpdate) {
    removeStatusListener = window.api.onMcpStatusUpdate((updatedServers: McpServer[]) => {
      servers.value = updatedServers
    })
  }

  // Set up listener for single server updates
  if (window.api && window.api.onMcpServerUpdate) {
    removeServerListener = window.api.onMcpServerUpdate((updatedServer: McpServer) => {
      const index = servers.value.findIndex((s) => s.name === updatedServer.name)
      if (index !== -1) {
        servers.value[index] = updatedServer
      } else {
        servers.value.push(updatedServer)
      }

      optimisticUpdates.value.delete(updatedServer.name)

      // loadingServers.value.delete(updatedServer.name)
    })
  }

  // Request initial server list
  if (window.api && window.api.getMcpServers) {
    try {
      const initialServers = await window.api.getMcpServers()
      servers.value = initialServers
    } catch (error) {
      console.error('Failed to get initial MCP servers:', error)
    }
  }

  // Load tool states from database
  if (window.api && window.api.getAllMcpToolStates) {
    try {
      const states = await window.api.getAllMcpToolStates()
      toolStates.value = states
    } catch (error) {
      console.error('Failed to load MCP tool states:', error)
    }
  }
})

onBeforeUnmount(() => {
  if (removeStatusListener) {
    removeStatusListener()
  }
  if (removeServerListener) {
    removeServerListener()
  }
})
</script>

<style scoped lang="less">
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.mcp-container {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
  background-color: var(--bg-color);
  color: var(--text-color);
}

.mcp-toolbar-card {
  margin-bottom: 20px;
  background-color: var(--bg-color);
  border-radius: 8px;
  overflow: hidden;

  :deep(.ant-card-body) {
    background-color: var(--card-bg);
    transition: background-color 0.3s ease;
    padding: 20px;
    border: 1px solid rgba(128, 128, 128, 0.1);
    border-radius: 8px;
  }

  .mcp-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;

    .toolbar-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;

      .toolbar-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-color);
        line-height: 1.4;
      }

      .toolbar-description {
        font-size: 12px;
        color: var(--text-color-secondary);
        line-height: 1.5;
        opacity: 0.8;
      }
    }

    .ant-btn {
      height: 36px;
      padding: 0 20px;
      font-weight: 500;
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 4px rgba(24, 144, 255, 0.15);
      transition: all 0.3s ease;
      flex-shrink: 0;

      &:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(24, 144, 255, 0.25);
      }

      &:active {
        transform: translateY(0);
      }
    }
  }
}

.server-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.server-card {
  background-color: var(--bg-color);
  border-radius: 8px;
  overflow: hidden;
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;

  :deep(.ant-card-body) {
    background-color: var(--card-bg);
    transition: background-color 0.3s ease;
    padding: 0;
  }

  &.server-card-loading {
    opacity: 0.7;
    pointer-events: none;

    :deep(.ant-card-body) {
      position: relative;

      &::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.05) 50%, transparent 100%);
        animation: shimmer 1.5s infinite;
      }
    }
  }

  .server-collapse {
    :deep(.ant-collapse-item) {
      border: none;
      background-color: transparent;
    }

    :deep(.ant-collapse-arrow) {
      color: var(--text-color);
    }

    :deep(.ant-collapse-header) {
      padding: 16px 12px !important;
      background-color: transparent !important;
      cursor: pointer;
      align-items: center !important;

      &:hover {
        background-color: var(--hover-bg-color);
      }
    }

    :deep(.ant-collapse-content) {
      border-top: 1px solid rgba(128, 128, 128, 0.15);
      background-color: transparent;
    }

    :deep(.ant-collapse-content-box) {
      padding: 0 !important;
    }

    .server-content {
      display: block;
      width: 100%;
    }

    .server-tabs {
      width: 100%;

      :deep(.ant-tabs-nav) {
        margin: 0;
        padding: 0;
        background-color: transparent;
        width: 100%;

        &::before {
          border-bottom: 1px solid rgba(128, 128, 128, 0.15);
        }
      }

      :deep(.ant-tabs-nav-wrap) {
        width: 100%;
      }

      :deep(.ant-tabs-nav-list) {
        width: 100%;
      }

      :deep(.ant-tabs-tab) {
        padding: 12px 0;
        margin: 0 20px 0 0;
        color: var(--text-color-secondary);
        font-size: 13px;
        font-weight: 500;

        &:hover {
          color: var(--text-color);
        }

        &.ant-tabs-tab-active {
          .ant-tabs-tab-btn {
            color: var(--text-color);
          }
        }
      }

      :deep(.ant-tabs-ink-bar) {
        background: var(--primary-color);
      }

      :deep(.ant-tabs-content) {
        padding: 16px 12px;
      }

      .section-content {
        .tool-item,
        .resource-item {
          padding: 10px 0;
          // border-bottom: 1px solid rgba(128, 128, 128, 0.2);
          transition: all 0.3s ease;

          &:last-child {
            border-bottom: none;
            padding-bottom: 0;
          }

          &:first-child {
            padding-top: 0;
          }
        }

        .tool-item-disabled {
          opacity: 0.5;

          .tool-name,
          .tool-description,
          .parameter-name,
          .parameter-description {
            color: var(--text-color-secondary) !important;
          }
        }

        .tool-header,
        .resource-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;

          .tool-icon,
          .resource-icon {
            font-size: 14px;
          }

          .tool-name {
            font-weight: 500;
            color: var(--text-color);
            font-size: 14px;
            cursor: pointer;
            user-select: none;
            transition: opacity 0.2s ease;

            &:hover {
              opacity: 0.7;
            }
          }

          .resource-name {
            font-weight: 500;
            color: var(--text-color);
            font-size: 14px;
          }

          .tool-state-badge {
            margin-left: 4px;
          }
        }

        .tool-description,
        .resource-description {
          color: var(--text-color-secondary);
          font-size: 13px;
          line-height: 1.6;
          margin-bottom: 12px;
        }

        .tool-parameters-collapse {
          margin-top: 12px;
          background: transparent;
          border: 1px solid rgba(128, 128, 128, 0.15);
          border-radius: 6px;

          :deep(.ant-collapse-item) {
            border: none;
            background: transparent;
          }

          :deep(.ant-collapse-header) {
            padding: 8px 12px !important;
            background: transparent !important;
            align-items: center;

            &:hover {
              background: var(--hover-bg-color) !important;
            }
          }

          :deep(.ant-collapse-arrow) {
            color: var(--text-color);
          }

          :deep(.ant-collapse-content) {
            border: none;
            background: transparent;
          }

          :deep(.ant-collapse-content-box) {
            padding: 6px 12px 6px 12px !important;
          }

          .parameters-header {
            font-size: 11px;
            font-weight: 600;
            color: var(--text-color-secondary);
            letter-spacing: 0.5px;
          }
        }

        .tool-parameters {
          .parameter-item {
            margin-bottom: 8px;
            display: flex;
            gap: 8px;
            align-items: baseline;

            &:last-child {
              margin-bottom: 0;
            }

            .parameter-name {
              font-size: 13px;
              font-weight: 500;
              color: #d97706;
              font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
              white-space: nowrap;
              flex-shrink: 0;

              .required-marker {
                color: var(--error-color);
                margin-left: 2px;
              }
            }

            .parameter-description {
              font-size: 12px;
              color: var(--text-color-secondary);
              line-height: 1.5;
              flex: 1;
            }
          }
        }

        .resource-uri {
          margin-top: 8px;
          display: flex;
          gap: 8px;
          align-items: baseline;
          font-size: 12px;

          .uri-label {
            font-weight: 500;
            color: var(--text-color-secondary);
            white-space: nowrap;
          }

          .uri-value {
            color: #0ea5e9;
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
            word-break: break-all;
          }
        }
      }

      .empty-state {
        color: var(--text-color-secondary);
        font-style: italic;
        font-size: 13px;
        text-align: center;
        padding: 20px 0;
      }
    }

    .server-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;

      .server-title {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 12px;

        .server-loading-spinner {
          :deep(.ant-spin-dot) {
            font-size: 14px;
          }
        }

        .server-name {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-color);
        }
      }

      .server-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;

        .status-badge {
          :deep(.ant-badge-status-dot) {
            width: 8px;
            height: 8px;
          }
        }

        .ant-btn {
          padding: 4px 8px;
          height: 28px;
          color: var(--text-color-secondary);
          transition: all 0.2s ease;

          &:hover:not(:disabled) {
            color: var(--text-color);
            background-color: var(--hover-bg-color);
          }

          &.ant-btn-dangerous {
            &:hover:not(:disabled) {
              color: var(--error-color);
            }
          }

          &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
        }

        .ant-switch {
          &:disabled {
            opacity: 0.6;
          }
        }
      }
    }

    .server-error {
      padding: 8px 12px;
      background-color: rgba(239, 68, 68, 0.1);
      border: 1px solid var(--error-color);
      border-radius: 4px;
      color: var(--error-color);
      margin: 0 12px 12px 12px;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      transition: background-color 0.3s ease;
      font-size: 13px;

      span {
        flex: 1;
        line-height: 1.5;
      }
    }
  }
}
</style>
