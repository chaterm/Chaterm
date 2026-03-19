//  Copyright (c) 2025-present, chaterm.ai  All rights reserved.
//  This source code is licensed under the GPL-3.0

/**
 * Slash command definitions for user input.
 * These commands are displayed in the chat UI and replaced with full prompts before sending to LLM.
 */
export const SLASH_COMMANDS = {
  SUMMARY_TO_DOC: '/summary-to-doc',
  SUMMARY_TO_SKILL: '/summary-to-skill'
} as const

export type SlashCommand = (typeof SLASH_COMMANDS)[keyof typeof SLASH_COMMANDS]

// English prompt for summarize to knowledge base
export const SUMMARY_TO_DOC_PROMPT_EN = `You MUST use the summarize_to_knowledge tool to summarize this conversation.

DO NOT use attempt_completion or any other tool. ONLY use summarize_to_knowledge.

Analyze the conversation and extract:
1. Problem description and background
2. Solutions and key steps
3. Important commands or code snippets (if any)
4. Lessons learned and best practices

Generate the summary in well-structured Markdown format.
Choose a concise file name with .md extension that reflects the main topic.`

// Chinese prompt for summarize to knowledge base
export const SUMMARY_TO_DOC_PROMPT_CN = `使用 summarize_to_knowledge 工具来总结这段对话（不要使用 attempt_completion 或其他工具）。

分析对话并提取以下内容：
1. 问题描述和背景
2. 解决方案和关键步骤
3. 重要的命令或代码片段（如有）
4. 经验教训和最佳实践

生成结构清晰的 Markdown 格式总结。
选择一个简洁的 .md 文件名，能够反映主题内容。`

/**
 * Get the appropriate prompt for summarize to doc based on language setting.
 * @param isChinese - Whether to use Chinese prompt
 * @returns The full prompt string
 */
export function getSummaryToDocPrompt(isChinese: boolean): string {
  return isChinese ? SUMMARY_TO_DOC_PROMPT_CN : SUMMARY_TO_DOC_PROMPT_EN
}

// English prompt for summarize to skill
export const SUMMARY_TO_SKILL_PROMPT_EN = `You MUST use the summarize_to_skill tool to convert this conversation into a reusable skill.

DO NOT use attempt_completion or any other tool. ONLY use summarize_to_skill.

Analyze the conversation and extract reusable workflows, instructions, or procedures:
1. Identify the core task or workflow pattern
2. Extract step-by-step instructions that can be reused
3. Include any important commands, configurations, or code patterns
4. Generalize specific details into reusable parameters where appropriate

Generate:
- skill_name: a lowercase-with-hyphens identifier (e.g., "deploy-docker-app", "setup-nginx-ssl")
- description: a concise one-line description of what the skill does
- content: well-structured Markdown instructions for the skill`

// Chinese prompt for summarize to skill
export const SUMMARY_TO_SKILL_PROMPT_CN = `使用 summarize_to_skill 工具将这段对话转换为可复用的技能（不要使用 attempt_completion 或其他工具）。

分析对话并提取可复用的工作流程、指令或程序：
1. 识别核心任务或工作流模式
2. 提取可复用的分步指令
3. 包含重要的命令、配置或代码模式
4. 在适当的地方将具体细节泛化为可复用的参数

生成：
- skill_name: 小写连字符格式的标识符（例如 "deploy-docker-app"、"setup-nginx-ssl"）
- description: 简洁的一行描述，说明技能的用途
- content: 结构清晰的 Markdown 格式技能指令`

/**
 * Get the appropriate prompt for summarize to skill based on language setting.
 * @param isChinese - Whether to use Chinese prompt
 * @returns The full prompt string
 */
export function getSummaryToSkillPrompt(isChinese: boolean): string {
  return isChinese ? SUMMARY_TO_SKILL_PROMPT_CN : SUMMARY_TO_SKILL_PROMPT_EN
}

/**
 * Check if a text is a slash command.
 * @param text - The text to check
 * @returns True if the text is a recognized slash command
 */
export function isSlashCommand(text: string): boolean {
  const trimmed = text.trim()
  return Object.values(SLASH_COMMANDS).includes(trimmed as SlashCommand)
}

/**
 * Get the slash command from text if it exists.
 * @param text - The text to check
 * @returns The slash command or null if not found
 */
export function getSlashCommand(text: string): SlashCommand | null {
  const trimmed = text.trim()
  if (Object.values(SLASH_COMMANDS).includes(trimmed as SlashCommand)) {
    return trimmed as SlashCommand
  }
  return null
}
