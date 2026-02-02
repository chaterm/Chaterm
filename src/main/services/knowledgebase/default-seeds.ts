import { getSummaryToDocPrompt } from '@core/prompts/slash-commands'

export const KB_DEFAULT_SEEDS_VERSION = 1

export interface KnowledgeBaseDefaultSeed {
  /** Stable identifier for tracking rename/delete/move/update. */
  id: string
  /** Suggested target path under knowledgebase root */
  defaultRelPath: string
  /** Returns seed content based on language. */
  getContent: (isChinese: boolean) => string
}

export const KB_DEFAULT_SEEDS: KnowledgeBaseDefaultSeed[] = [
  {
    id: 'summary_to_doc',
    defaultRelPath: 'commands/Summary to Doc.md',
    getContent: (isChinese) => getSummaryToDocPrompt(isChinese)
  }
]
