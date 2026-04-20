import { ExperienceManager, ExperienceManagerOptions, ExperienceLlmCompletion } from './ExperienceManager'

export type {
  ExperienceExtractionInput,
  ExperienceExtractionOutcome,
  ExperienceExtractionResult,
  ExtractedExperienceCandidate
} from './ExperienceManager'
export type { ExperienceLlmCompletion, ExperienceManagerOptions }
export { ExperienceManager }

export function createExperienceManager(options: ExperienceManagerOptions): ExperienceManager {
  return new ExperienceManager(options)
}
