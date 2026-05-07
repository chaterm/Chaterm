// Barrel export for DB tools. DB tools are pure functions `(session, input)
// -> DbToolResult`; dispatch glue (reading dbContext off the Task, mapping
// result to tool message, approval gating) is wired up by task #11 + the
// ToolRegistry registration that follows it. See db-ai-tool-whitelist-decision.md.

export * from './shared'
export { runListDatabases } from './list-databases'
export type { ListDatabasesResult } from './list-databases'
export { runListSchemas } from './list-schemas'
export type { ListSchemasInput, ListSchemasResult } from './list-schemas'
export { runListTables } from './list-tables'
export type { ListTablesInput, ListTablesResult } from './list-tables'
export { runDescribeTable } from './describe-table'
export type { DescribeTableInput, DescribeTableResult } from './describe-table'
export { runInspectIndexes } from './inspect-indexes'
export type { InspectIndexesInput, InspectIndexesResult, IndexInfo } from './inspect-indexes'
export { runSampleRows } from './sample-rows'
export type { SampleRowsInput, SampleRowsResult } from './sample-rows'
export { runCountRows } from './count-rows'
export type { CountRowsInput, CountRowsResult } from './count-rows'
export { runExplainPlan } from './explain-plan'
export type { ExplainPlanInput, ExplainPlanResult } from './explain-plan'
export { runExecuteReadonlyQuery } from './execute-readonly-query'
export type { ExecuteReadonlyQueryInput, ExecuteReadonlyQueryResult } from './execute-readonly-query'
export { runExecuteWriteQuery } from './execute-write-query'
export type { ExecuteWriteQueryInput, ExecuteWriteQueryResult } from './execute-write-query'
export { runSuggestIndexes } from './suggest-indexes'
export type { SuggestIndexesInput, SuggestIndexesResult } from './suggest-indexes'
