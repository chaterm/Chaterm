# Snippet Drag Reorder Design (No Cross-Group)

## Summary
Add drag-and-drop reordering for quick command snippets within the current list (root or selected group). Reordering updates UI immediately and persists new order by rewriting the group’s `sort_order` in one transaction. Cross-group moves are not allowed. Dragging is disabled during search mode to avoid partial-list reorder errors.

## Goals
- Drag to reorder snippets within the visible list.
- Preserve stable ordering via `sort_order` in DB.
- No cross-group moves.
- Minimal dependencies (use native HTML5 drag events).

## Non-Goals
- Dragging groups/folders.
- Cross-group drag or drag into/out of root.
- Reordering while search filter is active.

## UX / Behavior
- Snippet cards are draggable only when `searchQuery` is empty.
- Only command cards can be dragged. Group cards remain static.
- Drag-and-drop moves the item to the target position; intermediate items shift accordingly.
- After drop:
  - UI updates immediately (optimistic reorder).
  - Persist reorder to DB; on failure, show error and refresh.

## Data Flow
1. `dragstart`: record `draggingId` and its index.
2. `dragover`: compute hover index; optionally show visual hint and allow drop.
3. `drop`: build ordered list of ids for current group (root or selected group).
4. Update `quickCommands` locally to new order.
5. Call `userSnippetOperation({ operation: 'reorder', params: { group_uuid, ordered_ids } })`.
6. On success, no further action. On failure, show error and call `refresh()`.

## IPC / API Changes
Extend `userSnippetOperation` to support `reorder`:
- Params:
  - `group_uuid: string | null`
  - `ordered_ids: number[]` (full ordered list for the group)

Update typings in `src/preload/index.d.ts` and `src/preload/index.ts` to include `reorder`.

## DB Logic
Add a `reorder` operation to `src/main/storage/db/chaterm/snippets.ts`:
- Validate `ordered_ids` not empty.
- Transaction:
  - For each `id` in `ordered_ids`, update:
    - `sort_order = (index + 1) * 10`
    - `updated_at = strftime('%s', 'now')`
  - Ensure update constrained to `group_uuid` (match `NULL` or specific UUID).

List query already orders by `sort_order ASC, id ASC`.

## Error Handling
- If DB update fails, return `code != 200`.
- UI shows `message.error` and calls `refresh()` to restore server order.

## Performance
- Rewriting ~200 rows in a single SQLite transaction is expected to complete in milliseconds.
- Short main-process blocking time is acceptable at this scale.

## Testing
- **DB unit test** in `src/main/storage/db/chaterm/__tests__`:
  - Seed a group with known ids and `sort_order`.
  - Call `reorder` with a new order.
  - Assert updated `sort_order` follows the new order; other groups remain unchanged.
- **UI logic test** (optional): verify reorder list generation and drag-disabled-when-search behavior.

## Rollback
- Revert `reorder` operation and UI drag handlers; DB schema unchanged.
