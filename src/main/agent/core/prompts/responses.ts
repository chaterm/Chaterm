//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0
//
// Copyright (c) 2025 cline Authors, All rights reserved.
// Licensed under the Apache License, Version 2.0

import { Anthropic } from '@anthropic-ai/sdk'
import * as diff from 'diff'
import * as path from 'path'

export const formatResponse = {
  contextTruncationNotice: () =>
    `[NOTE] Some previous conversation history with the user has been removed to maintain optimal context window length. The initial user task and the most recent exchanges have been retained for continuity, while intermediate conversation history has been removed. Please keep this in mind as you continue assisting the user.`,

  preTruncationSummaryPrompt: () =>
    `You are a conversation summarizer for a DevOps terminal assistant. Summarize the following conversation excerpt that is about to be removed from context due to length limits.

Focus on preserving:
1. Host/cluster/environment info (IPs, hostnames, regions, configs)
2. Diagnostic findings (error messages, log patterns, metrics)
3. Commands executed and their key results
4. Operational decisions made and their rationale
5. File paths and configurations examined or modified
6. Unresolved issues or pending actions

Output a structured summary with clear sections. Be concise but retain all actionable details. Keep the summary under 1500 words.`,

  preTruncationSummaryUserContent: (serialized: string, existingSummary?: string | null) => {
    if (existingSummary) {
      return (
        `An existing summary from a previous truncation is provided below. Merge it with the new conversation excerpt into a single cohesive summary.\n\n` +
        `<existing_summary>\n${existingSummary}\n</existing_summary>\n\n` +
        `<new_conversation>\n${serialized}\n</new_conversation>`
      )
    }
    return `Please summarize the following conversation excerpt:\n\n${serialized}`
  },

  contextSummaryNotice: (summary: string) =>
    `[CONTEXT SUMMARY] The following is an automated summary of conversation history that was removed to maintain context window limits:\n\n<context_summary>\n${summary}\n</context_summary>\n\n[NOTE] Some previous conversation history has been removed. The summary above captures the essential details. The initial task and most recent exchanges are retained.`,

  condense: () =>
    `The user has accepted the condensed conversation summary you generated. This summary covers important details of the historical conversation with the user which has been truncated.\n<explicit_instructions type="condense_response">It's crucial that you respond by ONLY asking the user what you should work on next. You should NOT take any initiative or make any assumptions about continuing with work. For example you should NOT suggest file changes or attempt to read any files.\nWhen asking the user what you should work on next, you can reference information in the summary which was just generated. However, you should NOT reference information outside of what's contained in the summary for this response. Keep this response CONCISE.</explicit_instructions>`,

  toolDenied: () => `The user denied this operation.`,

  toolError: (error?: string) => `The tool execution failed with the following error:\n<error>\n${error}\n</error>`,

  chatermIgnoreError: (path: string) =>
    `Access to ${path} is blocked by the .clineignore file settings. You must try to continue in the task without using this file, or ask the user to update the .clineignore file.`,

  noToolsUsed: () =>
    `[ERROR] You did not use a tool in your previous response! Please retry with a tool use.

${toolUseInstructionsReminder}

# Next Steps

If you have completed the user's task, use the attempt_completion tool.
If you require additional information from the user, use the ask_followup_question tool.
Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task.
(This is an automated message, so do not respond to it conversationally.)`,

  tooManyMistakes: (feedback?: string) =>
    `You seem to be having trouble proceeding. The user has provided the following feedback to help guide you:\n<feedback>\n${feedback}\n</feedback>`,

  missingToolParameterError: (paramName: string) =>
    `Missing value for required parameter '${paramName}'. Please retry with complete response.\n\n${toolUseInstructionsReminder}`,

  invalidMcpToolArgumentError: (serverName: string, toolName: string) =>
    `Invalid JSON argument used with ${serverName} for ${toolName}. Please retry with a properly formatted JSON argument.`,

  toolResult: (text: string, images?: string[]): string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> => {
    if (images && images.length > 0) {
      const textBlock: Anthropic.TextBlockParam = { type: 'text', text }
      const imageBlocks: Anthropic.ImageBlockParam[] = formatImagesIntoBlocks(images)
      // Placing images after text leads to better results
      return [textBlock, ...imageBlocks]
    } else {
      return text
    }
  },

  imageBlocks: (images?: string[]): Anthropic.ImageBlockParam[] => {
    return formatImagesIntoBlocks(images)
  },

  formatFilesList: (absolutePath: string, files: string[], didHitLimit: boolean): string => {
    const sorted = files
      .map((file) => {
        // convert absolute path to relative path
        const relativePath = path.relative(absolutePath, file).toPosix()
        return file.endsWith('/') ? relativePath + '/' : relativePath
      })
      // Sort so files are listed under their respective directories to make it clear what files are children of what directories. Since we build file list top down, even if file list is truncated it will show directories that cline can then explore further.
      .sort((a, b) => {
        const aParts = a.split('/') // only works if we use toPosix first
        const bParts = b.split('/')
        for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
          if (aParts[i] !== bParts[i]) {
            // If one is a directory and the other isn't at this level, sort the directory first
            if (i + 1 === aParts.length && i + 1 < bParts.length) {
              return -1
            }
            if (i + 1 === bParts.length && i + 1 < aParts.length) {
              return 1
            }
            // Otherwise, sort alphabetically
            return aParts[i].localeCompare(bParts[i], undefined, {
              numeric: true,
              sensitivity: 'base'
            })
          }
        }
        // If all parts are the same up to the length of the shorter path,
        // the shorter one comes first
        return aParts.length - bParts.length
      })

    const clineIgnoreParsed = sorted
    if (didHitLimit) {
      return `${clineIgnoreParsed.join('\n')}\n\n(File list truncated. Use list_files on specific subdirectories if you need to explore further.)`
    } else if (clineIgnoreParsed.length === 0 || (clineIgnoreParsed.length === 1 && clineIgnoreParsed[0] === '')) {
      return 'No files found.'
    } else {
      return clineIgnoreParsed.join('\n')
    }
  },

  createPrettyPatch: (filename = 'file', oldStr?: string, newStr?: string) => {
    // strings cannot be undefined or diff throws exception
    const patch = diff.createPatch(filename.toPosix(), oldStr || '', newStr || '')
    const lines = patch.split('\n')
    const prettyPatchLines = lines.slice(4)
    return prettyPatchLines.join('\n')
  },

  taskResumption: (mode: 'chat' | 'cmd' | 'agent', agoText: string, wasRecent: boolean | 0 | undefined, responseText?: string): [string, string] => {
    let taskMsg = ''
    if (mode === 'cmd') {
      taskMsg = `The task was interrupted ${agoText}. The conversation might be incomplete. Please note that the project state may have changed since then.\n\nNote: If you previously attempted a tool use without receiving a result, assume it was unsuccessful. As you are in CMD mode, please respond directly to the user's message.`
    } else if (mode === 'agent') {
      taskMsg = `The task was interrupted ${agoText}. It may be incomplete, so please reassess the task context. Be aware that the project state may have changed. \n\nNote: If you previously used a tool without receiving a result, assume it failed and decide whether a retry is necessary. If the last tool was a browser_action, the browser is closed, and you'll need to relaunch it.`
    } else if (mode === 'chat') {
      taskMsg = `The task was interrupted ${agoText}. Please review the chat history to confirm the task status. Note that the project state may have changed.`
    }

    if (wasRecent) {
      taskMsg +=
        '\n\nImportant: If the last replace_in_file or write_to_file operation was reverted to its original state upon interruption, there is no need to re-read the file since you already have the latest content.'
    }

    const taskResumptionMessage = `[TASK RESUMPTION] ${taskMsg}`

    let userMsg = ''
    if (responseText) {
      if (mode === 'agent') {
        userMsg = 'New message for plan_mode_respond tool: please provide your reply in the <response> parameter'
      } else if (mode === 'cmd') {
        userMsg = 'New instructions for continuing the task'
      } else if (mode === 'chat') {
        userMsg = 'New chat response: please provide your reply'
      }
      userMsg += `:\n<user_message>\n${responseText}\n</user_message>`
    }

    const userResponseMessage = userMsg

    return [taskResumptionMessage, userResponseMessage]
  },

  fileEditWithUserChanges: (
    relPath: string,
    userEdits: string,
    autoFormattingEdits: string | undefined,
    finalContent: string | undefined,
    newProblemsMessage: string | undefined
  ) =>
    `The user made the following updates to your content:\n\n${userEdits}\n\n` +
    (autoFormattingEdits
      ? `The user's editor also applied the following auto-formatting to your content:\n\n${autoFormattingEdits}\n\n(Note: Pay close attention to changes such as single quotes being converted to double quotes, semicolons being removed or added, long lines being broken into multiple lines, adjusting indentation style, adding/removing trailing commas, etc. This will help you ensure future SEARCH/REPLACE operations to this file are accurate.)\n\n`
      : '') +
    `The updated content, which includes both your original modifications and the additional edits, has been successfully saved to ${relPath.toPosix()}. Here is the full, updated content of the file that was saved:\n\n` +
    `<final_file_content path="${relPath.toPosix()}">\n${finalContent}\n</final_file_content>\n\n` +
    `Please note:\n` +
    `1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
    `2. Proceed with the task using this updated file content as the new baseline.\n` +
    `3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
    `4. IMPORTANT: For any future changes to this file, use the final_file_content shown above as your reference. This content reflects the current state of the file, including both user edits and any auto-formatting (e.g., if you used single quotes but the formatter converted them to double quotes). Always base your SEARCH/REPLACE operations on this final version to ensure accuracy.\n` +
    `${newProblemsMessage}`,

  fileEditWithoutUserChanges: (
    relPath: string,
    autoFormattingEdits: string | undefined,
    finalContent: string | undefined,
    newProblemsMessage: string | undefined
  ) =>
    `The content was successfully saved to ${relPath.toPosix()}.\n\n` +
    (autoFormattingEdits
      ? `Along with your edits, the user's editor applied the following auto-formatting to your content:\n\n${autoFormattingEdits}\n\n(Note: Pay close attention to changes such as single quotes being converted to double quotes, semicolons being removed or added, long lines being broken into multiple lines, adjusting indentation style, adding/removing trailing commas, etc. This will help you ensure future SEARCH/REPLACE operations to this file are accurate.)\n\n`
      : '') +
    `Here is the full, updated content of the file that was saved:\n\n` +
    `<final_file_content path="${relPath.toPosix()}">\n${finalContent}\n</final_file_content>\n\n` +
    `IMPORTANT: For any future changes to this file, use the final_file_content shown above as your reference. This content reflects the current state of the file, including any auto-formatting (e.g., if you used single quotes but the formatter converted them to double quotes). Always base your SEARCH/REPLACE operations on this final version to ensure accuracy.\n\n` +
    `${newProblemsMessage}`,

  diffError: (relPath: string, originalContent: string | undefined) =>
    `This is likely because the SEARCH block content doesn't match exactly with what's in the file, or if you used multiple SEARCH/REPLACE blocks they may not have been in the order they appear in the file.\n\n` +
    `The file was reverted to its original state:\n\n` +
    `<file_content path="${relPath.toPosix()}">\n${originalContent}\n</file_content>\n\n` +
    `Now that you have the latest state of the file, try the operation again with fewer, more precise SEARCH blocks. For large files especially, it may be prudent to try to limit yourself to <5 SEARCH/REPLACE blocks at a time, then wait for the user to respond with the result of the operation before following up with another replace_in_file call to make additional edits.\n(If you run into this error 3 times in a row, you may use the write_to_file tool as a fallback.)`,

  toolAlreadyUsed: (toolName: string) =>
    `Tool [${toolName}] was not executed because a tool has already been used in this message. Only one tool may be used per message. You must assess the first tool's result before proceeding to use the next tool.`
}

export const formatResponseCN = {
  contextTruncationNotice: () =>
    `[注意] 部分历史对话已被移除以维持最佳上下文窗口长度。初始用户任务和最近的交流已被保留以确保连续性，中间的对话历史已被移除。请在继续协助用户时注意这一点。`,

  preTruncationSummaryPrompt: () =>
    `你是一个 DevOps 终端助手的对话摘要生成器。请总结以下即将因上下文长度限制而被移除的对话片段。

重点保留以下信息：
1. 主机/集群/环境信息（IP地址、主机名、区域、配置）
2. 诊断发现（错误消息、日志模式、指标）
3. 已执行的命令及其关键结果
4. 做出的运维决策及其理由
5. 检查或修改过的文件路径和配置
6. 未解决的问题或待处理的操作

输出结构化摘要，包含清晰的章节。保持简洁但保留所有可操作的细节。摘要不超过1500字。`,

  preTruncationSummaryUserContent: (serialized: string, existingSummary?: string | null) => {
    if (existingSummary) {
      return (
        `以下提供了此前一次截断生成的摘要。请将它与新的对话片段合并为一份连贯的总结。\n\n` +
        `<existing_summary>\n${existingSummary}\n</existing_summary>\n\n` +
        `<new_conversation>\n${serialized}\n</new_conversation>`
      )
    }
    return `请总结以下对话片段：\n\n${serialized}`
  },

  contextSummaryNotice: (summary: string) =>
    `[上下文摘要] 以下是为维持上下文窗口限制而移除的对话历史的自动摘要：\n\n<context_summary>\n${summary}\n</context_summary>\n\n[注意] 部分历史对话已被移除。以上摘要涵盖了关键细节。初始任务和最近的交流已被保留。`,

  condense: () =>
    `用户已接受你生成的压缩对话摘要。该摘要涵盖了已被截断的历史对话中的重要细节。\n<explicit_instructions type="condense_response">至关重要的是，你只需询问用户下一步想要处理什么。你不应该主动采取任何行动或对继续工作做出任何假设。例如，你不应该建议文件更改或尝试读取任何文件。\n在询问用户下一步工作时，你可以引用刚刚生成的摘要中的信息。但在此回复中，你不应该引用摘要之外的信息。保持此回复简洁。</explicit_instructions>`,

  toolDenied: () => `用户拒绝了此操作。`,

  toolError: (error?: string) => `工具执行失败，错误信息如下：\n<error>\n${error}\n</error>`,

  chatermIgnoreError: (path: string) =>
    `对 ${path} 的访问被 .clineignore 文件设置阻止。你必须尝试在不使用此文件的情况下继续任务，或要求用户更新 .clineignore 文件。`,

  noToolsUsed: () =>
    `[错误] 你在上一次回复中没有使用工具！请重试并使用工具。

${toolUseInstructionsReminderCN}

# 下一步

如果你已完成用户的任务，请使用 attempt_completion 工具。
如果你需要用户提供更多信息，请使用 ask_followup_question 工具。
否则，如果你尚未完成任务且不需要额外信息，请继续执行任务的下一步。
（这是一条自动消息，请不要以对话方式回复。）`,

  tooManyMistakes: (feedback?: string) => `你似乎在继续执行时遇到了困难。用户提供了以下反馈来帮助指导你：\n<feedback>\n${feedback}\n</feedback>`,

  missingToolParameterError: (paramName: string) => `缺少必需参数 '${paramName}' 的值。请使用完整的回复重试。\n\n${toolUseInstructionsReminderCN}`,

  invalidMcpToolArgumentError: (serverName: string, toolName: string) =>
    `在 ${serverName} 的 ${toolName} 中使用了无效的 JSON 参数。请使用正确格式的 JSON 参数重试。`,

  toolResult: (text: string, images?: string[]): string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> => {
    if (images && images.length > 0) {
      const textBlock: Anthropic.TextBlockParam = { type: 'text', text }
      const imageBlocks: Anthropic.ImageBlockParam[] = formatImagesIntoBlocks(images)
      return [textBlock, ...imageBlocks]
    } else {
      return text
    }
  },

  imageBlocks: (images?: string[]): Anthropic.ImageBlockParam[] => {
    return formatImagesIntoBlocks(images)
  },

  formatFilesList: (absolutePath: string, files: string[], didHitLimit: boolean): string => {
    const sorted = files
      .map((file) => {
        const relativePath = path.relative(absolutePath, file).toPosix()
        return file.endsWith('/') ? relativePath + '/' : relativePath
      })
      .sort((a, b) => {
        const aParts = a.split('/')
        const bParts = b.split('/')
        for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
          if (aParts[i] !== bParts[i]) {
            if (i + 1 === aParts.length && i + 1 < bParts.length) {
              return -1
            }
            if (i + 1 === bParts.length && i + 1 < aParts.length) {
              return 1
            }
            return aParts[i].localeCompare(bParts[i], undefined, {
              numeric: true,
              sensitivity: 'base'
            })
          }
        }
        return aParts.length - bParts.length
      })

    const clineIgnoreParsed = sorted
    if (didHitLimit) {
      return `${clineIgnoreParsed.join('\n')}\n\n（文件列表已截断。如需进一步探索，请对特定子目录使用 list_files。）`
    } else if (clineIgnoreParsed.length === 0 || (clineIgnoreParsed.length === 1 && clineIgnoreParsed[0] === '')) {
      return '未找到文件。'
    } else {
      return clineIgnoreParsed.join('\n')
    }
  },

  createPrettyPatch: (filename = 'file', oldStr?: string, newStr?: string) => {
    const patch = diff.createPatch(filename.toPosix(), oldStr || '', newStr || '')
    const lines = patch.split('\n')
    const prettyPatchLines = lines.slice(4)
    return prettyPatchLines.join('\n')
  },

  taskResumption: (mode: 'chat' | 'cmd' | 'agent', agoText: string, wasRecent: boolean | 0 | undefined, responseText?: string): [string, string] => {
    let taskMsg = ''
    if (mode === 'cmd') {
      taskMsg = `任务在${agoText}被中断。对话可能不完整。请注意项目状态可能已发生变化。\n\n注意：如果你之前尝试使用工具但未收到结果，请假设该操作未成功。由于你处于命令模式，请直接回复用户的消息。`
    } else if (mode === 'agent') {
      taskMsg = `任务在${agoText}被中断。任务可能不完整，请重新评估任务上下文。请注意项目状态可能已发生变化。\n\n注意：如果你之前使用了工具但未收到结果，请假设该操作失败并决定是否需要重试。如果最后一个工具是 browser_action，浏览器已关闭，你需要重新启动它。`
    } else if (mode === 'chat') {
      taskMsg = `任务在${agoText}被中断。请查看聊天历史以确认任务状态。请注意项目状态可能已发生变化。`
    }

    if (wasRecent) {
      taskMsg +=
        '\n\n重要提示：如果最后一次 replace_in_file 或 write_to_file 操作在中断时被恢复到原始状态，则无需重新读取文件，因为你已经拥有最新内容。'
    }

    const taskResumptionMessage = `[任务恢复] ${taskMsg}`

    let userMsg = ''
    if (responseText) {
      if (mode === 'agent') {
        userMsg = 'plan_mode_respond 工具的新消息：请在 <response> 参数中提供你的回复'
      } else if (mode === 'cmd') {
        userMsg = '继续任务的新指令'
      } else if (mode === 'chat') {
        userMsg = '新的聊天回复：请提供你的回复'
      }
      userMsg += `:\n<user_message>\n${responseText}\n</user_message>`
    }

    const userResponseMessage = userMsg

    return [taskResumptionMessage, userResponseMessage]
  },

  fileEditWithUserChanges: (
    relPath: string,
    userEdits: string,
    autoFormattingEdits: string | undefined,
    finalContent: string | undefined,
    newProblemsMessage: string | undefined
  ) =>
    `用户对你的内容进行了以下更新：\n\n${userEdits}\n\n` +
    (autoFormattingEdits
      ? `用户的编辑器还对你的内容应用了以下自动格式化：\n\n${autoFormattingEdits}\n\n（注意：请仔细关注单引号转换为双引号、分号的添加或移除、长行拆分为多行、缩进样式调整、尾逗号的添加/移除等变化。这将帮助你确保后续对此文件的 SEARCH/REPLACE 操作准确无误。）\n\n`
      : '') +
    `包含你的原始修改和额外编辑的更新内容已成功保存到 ${relPath.toPosix()}。以下是已保存文件的完整更新内容：\n\n` +
    `<final_file_content path="${relPath.toPosix()}">\n${finalContent}\n</final_file_content>\n\n` +
    `请注意：\n` +
    `1. 你无需重新写入这些更改，因为它们已经被应用。\n` +
    `2. 请以此更新后的文件内容作为新的基准继续任务。\n` +
    `3. 如果用户的编辑已解决了部分任务或更改了需求，请相应调整你的方法。` +
    `4. 重要：对于此文件的任何后续更改，请使用上面显示的 final_file_content 作为参考。此内容反映了文件的当前状态，包括用户编辑和任何自动格式化（例如，如果你使用了单引号但格式化器将其转换为双引号）。始终基于此最终版本进行 SEARCH/REPLACE 操作以确保准确性。\n` +
    `${newProblemsMessage}`,

  fileEditWithoutUserChanges: (
    relPath: string,
    autoFormattingEdits: string | undefined,
    finalContent: string | undefined,
    newProblemsMessage: string | undefined
  ) =>
    `内容已成功保存到 ${relPath.toPosix()}。\n\n` +
    (autoFormattingEdits
      ? `除了你的编辑外，用户的编辑器还对你的内容应用了以下自动格式化：\n\n${autoFormattingEdits}\n\n（注意：请仔细关注单引号转换为双引号、分号的添加或移除、长行拆分为多行、缩进样式调整、尾逗号的添加/移除等变化。这将帮助你确保后续对此文件的 SEARCH/REPLACE 操作准确无误。）\n\n`
      : '') +
    `以下是已保存文件的完整更新内容：\n\n` +
    `<final_file_content path="${relPath.toPosix()}">\n${finalContent}\n</final_file_content>\n\n` +
    `重要：对于此文件的任何后续更改，请使用上面显示的 final_file_content 作为参考。此内容反映了文件的当前状态，包括任何自动格式化（例如，如果你使用了单引号但格式化器将其转换为双引号）。始终基于此最终版本进行 SEARCH/REPLACE 操作以确保准确性。\n\n` +
    `${newProblemsMessage}`,

  diffError: (relPath: string, originalContent: string | undefined) =>
    `这可能是因为 SEARCH 块内容与文件中的实际内容不完全匹配，或者如果你使用了多个 SEARCH/REPLACE 块，它们可能没有按照在文件中出现的顺序排列。\n\n` +
    `文件已恢复到原始状态：\n\n` +
    `<file_content path="${relPath.toPosix()}">\n${originalContent}\n</file_content>\n\n` +
    `现在你已经获得了文件的最新状态，请使用更少、更精确的 SEARCH 块重试操作。特别是对于大文件，建议每次限制在5个以内的 SEARCH/REPLACE 块，然后等待用户回复操作结果后再进行额外的 replace_in_file 调用。\n（如果你连续3次遇到此错误，可以使用 write_to_file 工具作为备选方案。）`,

  toolAlreadyUsed: (toolName: string) =>
    `工具 [${toolName}] 未执行，因为此消息中已使用了一个工具。每条消息只能使用一个工具。你必须先评估第一个工具的结果，然后再使用下一个工具。`
}

export function getFormatResponse(language: string): typeof formatResponse {
  return language === 'zh-CN' ? formatResponseCN : formatResponse
}

// to avoid circular dependency
const formatImagesIntoBlocks = (images?: string[]): Anthropic.ImageBlockParam[] => {
  return images
    ? images.map((dataUrl) => {
        // data:image/png;base64,base64string
        const [rest, base64] = dataUrl.split(',')
        const mimeType = rest.split(':')[1].split(';')[0]
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: base64
          }
        } as Anthropic.ImageBlockParam
      })
    : []
}

const toolUseInstructionsReminderCN = `# 提醒：工具使用说明

工具调用使用 XML 风格的标签格式。工具名称包含在开闭标签中，每个参数同样包含在各自的标签中。格式如下：

<tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</tool_name>

例如：

<attempt_completion>
<result>
I have completed the task...
</result>
</attempt_completion>

请始终遵循此格式进行所有工具调用，以确保正确的解析和执行。`

const toolUseInstructionsReminder = `# Reminder: Instructions for Tool Use

Tool uses are formatted using XML-style tags. The tool name is enclosed in opening and closing tags, and each parameter is similarly enclosed within its own set of tags. Here's the structure:

<tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</tool_name>

For example:

<attempt_completion>
<result>
I have completed the task...
</result>
</attempt_completion>

Always adhere to this format for all tool uses to ensure proper parsing and execution.`
