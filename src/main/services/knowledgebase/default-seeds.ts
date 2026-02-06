import { getSummaryToDocPrompt } from '@core/prompts/slash-commands'
import { app } from 'electron'
import { readFileSync } from 'node:fs'
import path from 'node:path'

export const KB_DEFAULT_SEEDS_VERSION = 2

type KnowledgeBaseSeedBase = {
  /** Stable identifier for tracking rename/delete/move/update. */
  id: string
  /** Suggested target path under knowledgebase root */
  defaultRelPath: string
  /** Override defaultRelPath based on language (optional). */
  getDefaultRelPath?: (isChinese: boolean) => string
}

type KnowledgeBaseTextSeed = KnowledgeBaseSeedBase & {
  /** Returns seed content based on language. */
  getContent: (isChinese: boolean) => string
  getBinaryContent?: never
}

type KnowledgeBaseBinarySeed = KnowledgeBaseSeedBase & {
  getContent?: never
  /** Returns binary seed content (e.g. images). */
  getBinaryContent: () => Buffer
}

export type KnowledgeBaseDefaultSeed = KnowledgeBaseTextSeed | KnowledgeBaseBinarySeed

function readSeedFile(name: string, lang: 'en' | 'zh'): string {
  const fileName = `${name}.seed.${lang}.md`
  const absPath = app.isPackaged
    ? path.join(process.resourcesPath, 'knowledgebase', fileName)
    : path.join(app.getAppPath(), 'src/main/services/knowledgebase', fileName)
  return readFileSync(absPath, 'utf-8')
}

function readSeedAsset(relPath: string): Buffer {
  const absPath = app.isPackaged
    ? path.join(process.resourcesPath, 'knowledgebase', relPath)
    : path.join(app.getAppPath(), 'src/main/services/knowledgebase', relPath)
  return readFileSync(absPath)
}

function getSeedContent(name: string, isChinese: boolean): string {
  const lang: 'en' | 'zh' = isChinese ? 'zh' : 'en'
  try {
    return readSeedFile(name, lang).trim()
  } catch {
    return ''
  }
}

export const KB_DEFAULT_SEEDS: KnowledgeBaseDefaultSeed[] = [
  {
    id: 'summary_to_doc',
    defaultRelPath: 'commands/Summary to Doc.md',
    getContent: (isChinese) => getSummaryToDocPrompt(isChinese)
  },
  // {
  //   id: 'knowledge_base_readme',
  //   defaultRelPath: 'README.md',
  //   getContent: (isChinese) => getSeedContent('kb-readme', isChinese)
  // },
  {
    id: 'markdown_guide',
    defaultRelPath: 'Markdown Guide.md',
    getDefaultRelPath: (isChinese) => (isChinese ? 'Markdown语法指南.md' : 'Markdown Guide.md'),
    getContent: (isChinese) => getSeedContent('kb-markdown-guide', isChinese)
  },
  {
    id: 'markdown_guide_image',
    defaultRelPath: 'images/interface.png',
    getBinaryContent: () => readSeedAsset('images/interface.png')
  }
]
